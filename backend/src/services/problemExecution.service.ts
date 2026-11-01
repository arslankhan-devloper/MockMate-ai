import { env } from '../config/env.js'
import type {
  CodingLanguage,
  ProblemTest,
} from '../utils/problemGenerationValidation.js'

// Sandboxed code execution via a Piston-compatible service.
//
// IMPORTANT: user code is NEVER executed in the Express process or on the host.
// Every attempt is sent to `CODE_EXECUTION_URL` (default: the public Piston
// service; point this at a self-hosted instance for production/privacy). If the
// sandbox cannot be reached the request fails explicitly; it never pretends a
// submission was run.

export type ExecutionVerdict =
  | 'accepted'
  | 'wrong_answer'
  | 'runtime_error'
  | 'compile_error'
  | 'time_limit_exceeded'

export interface TestResult {
  index: number
  passed: boolean
  hidden: boolean
  input?: unknown
  expected?: unknown
  actual?: unknown
  stderr?: string
}

export interface EvaluationResult {
  verdict: ExecutionVerdict
  passedTests: number
  totalTests: number
  results: TestResult[]
  provider: string
}

export class SandboxError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'SandboxError'
    this.status = status
    this.code = code
  }
}

const PYTHON_VERSION = process.env.CODE_EXECUTION_PYTHON_VERSION?.trim() || '3.10.0'
const JAVASCRIPT_VERSION = process.env.CODE_EXECUTION_JAVASCRIPT_VERSION?.trim() || '18.15.0'

const LANGUAGE_NAMES: Record<CodingLanguage, string> = {
  python: 'python',
  javascript: 'javascript',
}

const FILE_NAMES: Record<CodingLanguage, string> = {
  python: 'main.py',
  javascript: 'main.js',
}

export function isCodingLanguage(value: unknown): value is CodingLanguage {
  return value === 'python' || value === 'javascript'
}

export function buildHarness(
  language: CodingLanguage,
  functionName: string,
  code: string,
  args: unknown[],
): string {
  const argsJson = JSON.stringify(args)
  const argsLiteral = JSON.stringify(argsJson)
  if (language === 'python') {
    return [
      code,
      '',
      'import json as __mockmate_json',
      `__mockmate_args = __mockmate_json.loads(${argsLiteral})`,
      `__mockmate_result = ${functionName}(*__mockmate_args)`,
      'print(__mockmate_json.dumps(__mockmate_result, separators=(",", ":")))',
      '',
    ].join('\n')
  }
  return [
    code,
    '',
    `const __mockmateArgs = JSON.parse(${argsLiteral});`,
    `const __mockmateResult = ${functionName}(...__mockmateArgs);`,
    'console.log(JSON.stringify(__mockmateResult === undefined ? null : __mockmateResult));',
    '',
  ].join('\n')
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Math.abs(actual - expected) <= 1e-6
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length &&
      actual.every((value, index) => valuesEqual(value, expected[index]))
  }
  if (
    typeof actual === 'object' && actual !== null &&
    typeof expected === 'object' && expected !== null &&
    !Array.isArray(actual) && !Array.isArray(expected)
  ) {
    const a = actual as Record<string, unknown>
    const b = expected as Record<string, unknown>
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && valuesEqual(a[key], b[key]))
  }
  return actual === expected
}

function parseLastLine(stdout: string): { ok: true; value: unknown } | { ok: false; raw: string } {
  const lines = stdout.replace(/\r/g, '').trim().split('\n').filter((line) => line.trim() !== '')
  const last = lines[lines.length - 1]?.trim() ?? ''
  if (!last) return { ok: false, raw: '' }
  if (last.length > 200_000) return { ok: false, raw: last.slice(0, 500) }
  try {
    return { ok: true, value: JSON.parse(last) }
  } catch {
    return { ok: false, raw: last.slice(0, 500) }
  }
}

interface PistonRun {
  stdout?: unknown
  stderr?: unknown
  output?: unknown
  code?: unknown
  signal?: unknown
}

interface PistonResponse {
  compile?: PistonRun
  run?: PistonRun
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asCode(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function executeOnce(
  language: CodingLanguage,
  code: string,
  timeoutMs: number,
): Promise<{
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  compileFailed: boolean
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.codeExecutionTimeoutMs)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (env.codeExecutionApiKey) {
    headers.Authorization = `Bearer ${env.codeExecutionApiKey}`
  }

  let response: Response
  try {
    response = await fetch(`${env.codeExecutionUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        language: LANGUAGE_NAMES[language],
        version: language === 'python' ? PYTHON_VERSION : JAVASCRIPT_VERSION,
        files: [{ name: FILE_NAMES[language], content: code }],
        stdin: '',
        args: [],
        compile_timeout: 10000,
        run_timeout: timeoutMs,
        run_memory_limit: 256_000_000,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SandboxError(504, 'code_execution_timeout', 'The code execution service timed out.')
    }
    throw new SandboxError(
      503,
      'code_execution_unavailable',
      'The sandboxed code execution service is unavailable. Configure CODE_EXECUTION_URL or try again later.',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new SandboxError(429, 'code_execution_rate_limited', 'The code execution service is busy. Please try again shortly.')
    }
    console.error(`[mockmate-backend] sandbox execution failed (status ${response.status})`)
    throw new SandboxError(502, 'code_execution_failed', 'The code execution service returned an error.')
  }

  let payload: PistonResponse
  try {
    payload = (await response.json()) as PistonResponse
  } catch {
    throw new SandboxError(502, 'code_execution_failed', 'The code execution service returned an unreadable response.')
  }

  const compile = payload.compile
  const compileCode = asCode(compile?.code)
  if (compile && compileCode !== null && compileCode !== 0) {
    return {
      stdout: asText(compile.stdout),
      stderr: asText(compile.stderr) || asText(compile.output) || 'Compilation failed.',
      exitCode: compileCode,
      timedOut: false,
      compileFailed: true,
    }
  }

  const run = payload.run
  if (!run) {
    throw new SandboxError(502, 'code_execution_failed', 'The code execution service returned no run result.')
  }

  const signal = asText(run.signal)
  const exitCode = asCode(run.code)
  return {
    stdout: asText(run.stdout) || asText(run.output),
    stderr: asText(run.stderr),
    exitCode,
    timedOut: signal === 'SIGKILL' || signal === 'SIGTERM' || exitCode === 137,
    compileFailed: false,
  }
}

export interface EvaluateCodeInput {
  language: CodingLanguage
  code: string
  functionName: string
  tests: ProblemTest[]
  /** When false, hidden test inputs and expected values are omitted. */
  revealDetails: boolean
  /** Index offset for visible tests when hidden tests follow. */
  startIndex?: number
  hiddenFromIndex?: number
}

// Runs every test in a separate sandbox process so state cannot leak between
// cases. `results` contains full details only for visible tests.
export async function evaluateCode(input: EvaluateCodeInput): Promise<EvaluationResult> {
  if (!env.codeExecutionUrl) {
    throw new SandboxError(503, 'code_execution_unavailable', 'Code execution is not configured.')
  }
  if (input.tests.length === 0) {
    throw new SandboxError(400, 'no_tests', 'There are no tests to run.')
  }

  const results: TestResult[] = []
  let passed = 0
  let compileError = false
  let runtimeError = false
  let timeLimit = false

  for (let index = 0; index < input.tests.length; index += 1) {
    const test = input.tests[index]
    const absoluteIndex = (input.startIndex ?? 0) + index
    const hidden = input.hiddenFromIndex !== undefined && index >= input.hiddenFromIndex
    const harness = buildHarness(input.language, input.functionName, input.code, test.args)

    let execution
    try {
      execution = await executeOnce(input.language, harness, 3000)
    } catch (err) {
      // A provider error aborts the whole evaluation; we never mark remaining
      // tests as passed or invent a result.
      throw err
    }

    const stderr = execution.stderr.trim()
    const failedProcess =
      execution.timedOut ||
      (execution.exitCode !== null && execution.exitCode !== 0) ||
      (execution.exitCode === null && stderr !== '')
    if (execution.timedOut) timeLimit = true
    if (failedProcess) {
      const syntaxFailure =
        stderr.toLowerCase().includes('syntaxerror') ||
        stderr.toLowerCase().includes('syntax error')
      if (execution.compileFailed || syntaxFailure) {
        compileError = true
      } else {
        runtimeError = true
      }
    }

    const parsed = failedProcess ? { ok: false as const, raw: '' } : parseLastLine(execution.stdout)
    const testPassed = !failedProcess && parsed.ok && valuesEqual(parsed.value, test.expected)
    if (testPassed) passed += 1

    const result: TestResult = {
      index: absoluteIndex,
      passed: testPassed,
      hidden,
    }
    if (!hidden && input.revealDetails) {
      result.input = test.args
      result.expected = test.expected
      if (parsed.ok) result.actual = parsed.value
      else if (parsed.raw) result.actual = parsed.raw
      if (stderr) result.stderr = stderr.slice(0, 2000)
    }
    results.push(result)
  }

  const total = input.tests.length
  const verdict: ExecutionVerdict = passed === total
    ? 'accepted'
    : timeLimit
      ? 'time_limit_exceeded'
      : compileError
        ? 'compile_error'
        : runtimeError
          ? 'runtime_error'
          : 'wrong_answer'

  return {
    verdict,
    passedTests: passed,
    totalTests: total,
    results,
    provider: 'piston',
  }
}
