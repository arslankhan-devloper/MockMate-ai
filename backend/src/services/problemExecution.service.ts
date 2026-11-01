import { env } from '../config/env.js'
import type {
  CodingLanguage,
  ProblemTest,
} from '../utils/problemGenerationValidation.js'
import {
  CodingProviderError,
  runOnlineCompiler,
  type CodingRunResult,
} from './onlineCompiler.service.js'
import type { CodingRoundLanguageId } from '../utils/codingRoundLanguages.js'

// Sandboxed code execution via OnlineCompiler.io (the same provider and the
// same credentials used by the Coding Round). The compiler ids come from
// `utils/codingRoundLanguages.ts`; nothing here re-declares them.
//
// IMPORTANT: user code is NEVER executed in the Express process or on the host.
// Every attempt is sent to the provider over HTTPS. If the provider cannot be
// reached the request fails explicitly; it never pretends a submission ran.

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

// DSA problem ids map 1:1 onto the Coding Round language ids, so the compiler
// (`python-3.14`, `nodejs-24`) is resolved by the shared helper rather than
// duplicated here.
const COMPILER_LANGUAGE: Record<CodingLanguage, CodingRoundLanguageId> = {
  python: 'python',
  javascript: 'javascript',
}

// The provider takes a whole-second limit. DSA harnesses are a single function
// call per test, so 3s matches the previous per-test budget.
const TEST_TIME_LIMIT_SECONDS = 3

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

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// The provider reports a killed process through the exit code and/or the error
// text rather than a POSIX signal name.
function looksLikeTimeout(result: CodingRunResult): boolean {
  if (result.exitCode === 124 || result.exitCode === 137) return true
  return /time[ _]?limit (exceeded|reached)/i.test(result.error)
}

// Python and Node both surface a compile/syntax failure as `error` text with a
// non-zero exit code; `evaluateCode` performs its own secondary detection.
function looksLikeCompileError(result: CodingRunResult): boolean {
  return /(syntaxerror|syntax error|compilation (failed|error)|error: expected)/i.test(result.error)
}

function toSandboxError(error: CodingProviderError): SandboxError {
  switch (error.code) {
    case 'not_configured':
      return new SandboxError(503, 'code_execution_unavailable', 'Code execution is not configured.')
    case 'timeout':
      return new SandboxError(504, 'code_execution_timeout', 'The code execution service timed out.')
    case 'unavailable':
      return new SandboxError(
        503,
        'code_execution_unavailable',
        'The code execution service is unavailable. Try again later.',
      )
    case 'rate_limited':
      return new SandboxError(
        429,
        'code_execution_rate_limited',
        'The code execution service is busy. Please try again shortly.',
      )
    case 'invalid_request':
      return new SandboxError(
        400,
        'code_execution_rejected',
        'The code execution service rejected this submission. Check the code and language.',
      )
    default:
      return new SandboxError(502, 'code_execution_failed', 'The code execution service returned an error.')
  }
}

async function executeOnce(
  language: CodingLanguage,
  code: string,
): Promise<{
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  compileFailed: boolean
}> {
  let result: CodingRunResult
  try {
    result = await runOnlineCompiler({
      language: COMPILER_LANGUAGE[language],
      code,
      input: '',
      timeLimit: TEST_TIME_LIMIT_SECONDS,
    })
  } catch (err) {
    if (err instanceof CodingProviderError) throw toSandboxError(err)
    throw new SandboxError(502, 'code_execution_failed', 'The code execution service returned an error.')
  }

  const timedOut = looksLikeTimeout(result)
  // A `status: 'error'` result with a zero exit code still means the program
  // failed; normalise it so the caller's exit-code check cannot read it as a
  // pass.
  const exitCode = result.status === 'error' && result.exitCode === 0 ? 1 : result.exitCode

  return {
    stdout: result.output,
    stderr: asText(result.error).trim(),
    exitCode,
    timedOut,
    compileFailed: looksLikeCompileError(result),
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
  if (!env.onlineCompilerApiKey) {
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
      execution = await executeOnce(input.language, harness)
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
    provider: 'onlinecompiler',
  }
}
