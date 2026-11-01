// Strict normalisation for AI-generated coding problems.
//
// The model output is untrusted. Nothing is stored or returned until every
// required field has the right type, length and shape. Hidden tests are kept in
// the normalised object but are never included in the public API response.

export type ProblemDifficulty = 'easy' | 'medium' | 'hard'
export const PROBLEM_DIFFICULTIES: ProblemDifficulty[] = ['easy', 'medium', 'hard']

export type CodingLanguage = 'python' | 'javascript'
export const CODING_LANGUAGES: CodingLanguage[] = ['python', 'javascript']

export type ProblemValueType =
  | 'int'
  | 'long'
  | 'double'
  | 'boolean'
  | 'string'
  | 'int[]'
  | 'long[]'
  | 'double[]'
  | 'boolean[]'
  | 'string[]'
  | 'int[][]'
  | 'string[][]'

const VALUE_TYPES = new Set<ProblemValueType>([
  'int', 'long', 'double', 'boolean', 'string',
  'int[]', 'long[]', 'double[]', 'boolean[]', 'string[]', 'int[][]', 'string[][]',
])

export interface ProblemParameter {
  name: string
  type: ProblemValueType
}

export interface ProblemExample {
  input: string
  output: string
  explanation?: string
}

export interface ProblemTest {
  args: unknown[]
  expected: unknown
}

export interface NormalizedCodingProblem {
  title: string
  difficulty: ProblemDifficulty
  topic: string
  concepts: string[]
  statement: string
  inputFormat: string
  outputFormat: string
  constraints: string[]
  examples: ProblemExample[]
  visibleTests: ProblemTest[]
  hiddenTests: ProblemTest[]
  hints: string[]
  approach: string
  expectedComplexity: string
  functionName: string
  parameters: ProblemParameter[]
  returnType: ProblemValueType
  starterCode: Record<CodingLanguage, string>
  generationRationale: string
}

export type ProblemValidationResult =
  | { ok: true; value: NormalizedCodingProblem }
  | { ok: false; error: string }

const MAX_TITLE = 120
const MIN_STATEMENT = 40
const MAX_STATEMENT = 6000
const MAX_TEXT = 120
const MAX_FORMAT = 600
const MAX_CONSTRAINT = 300
const MAX_EXAMPLE = 1200
const MAX_HINT = 500
const MAX_APPROACH = 2500
const MAX_COMPLEXITY = 160
const MAX_STARTER = 12_000
const MAX_TESTS = 10
const MAX_JSON_DEPTH = 12

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

function isInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

function matchesType(value: unknown, type: ProblemValueType): boolean {
  switch (type) {
    case 'int':
    case 'long':
      return isInteger(value)
    case 'double':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'string':
      return typeof value === 'string'
    case 'int[]':
    case 'long[]':
      return Array.isArray(value) && value.every(isInteger)
    case 'double[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    case 'boolean[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'boolean')
    case 'string[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
    case 'int[][]':
      return Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every(isInteger))
    case 'string[][]':
      return Array.isArray(value) && value.every(
        (row) => Array.isArray(row) && row.every((item) => typeof item === 'string'),
      )
    default:
      return false
  }
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function textList(value: unknown, min: number, max: number, itemMax: number): string[] | null {
  if (!Array.isArray(value)) return null
  const out: string[] = []
  for (const item of value.slice(0, max)) {
    if (typeof item !== 'string') return null
    const trimmed = item.trim()
    if (!trimmed || trimmed.length > itemMax) return null
    out.push(trimmed)
  }
  if (out.length < min || out.length > max) return null
  return out
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Bound JSON values so a hostile/malformed provider response cannot create a
// huge database row or deeply nested comparison.
function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH) return false
  if (value === null) return true
  if (typeof value === 'string') return value.length <= MAX_EXAMPLE
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) {
    if (value.length > 200) return false
    return value.every((item) => isJsonValue(item, depth + 1))
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length > 100) return false
    return entries.every(
      ([key, item]) => key.length <= 80 && isJsonValue(item, depth + 1),
    )
  }
  return false
}

function normalizeTests(
  value: unknown,
  parameters: ProblemParameter[],
  min: number,
  max: number,
): ProblemTest[] | null {
  if (!Array.isArray(value)) return null
  const tests: ProblemTest[] = []
  for (const item of value.slice(0, max)) {
    if (!isPlainObject(item)) return null
    if (!Array.isArray(item.args)) return null
    if (item.args.length !== parameters.length) return null
    if (!item.args.every((arg) => isJsonValue(arg))) return null
    if (!isJsonValue(item.expected)) return null
    tests.push({ args: item.args, expected: item.expected })
  }
  if (tests.length < min) return null
  return tests
}

function normalizeExamples(value: unknown): ProblemExample[] | null {
  if (!Array.isArray(value)) return null
  const examples: ProblemExample[] = []
  for (const item of value.slice(0, 4)) {
    if (!isPlainObject(item)) return null
    const input = text(item.input, MAX_EXAMPLE)
    const output = text(item.output, MAX_EXAMPLE)
    if (!input || !output) return null
    const explanation = item.explanation === undefined
      ? undefined
      : text(item.explanation, MAX_EXAMPLE)
    if (item.explanation !== undefined && !explanation) return null
    examples.push(explanation ? { input, output, explanation } : { input, output })
  }
  return examples.length >= 1 ? examples : null
}

function normalizeParameters(value: unknown): ProblemParameter[] | null {
  if (!Array.isArray(value)) return null
  const parameters: ProblemParameter[] = []
  const names = new Set<string>()
  for (const item of value.slice(0, 5)) {
    if (!isPlainObject(item)) return null
    const name = text(item.name, 40)
    const type = text(item.type, 30) as ProblemValueType | null
    if (!name || !IDENTIFIER_RE.test(name) || names.has(name)) return null
    if (!type || !VALUE_TYPES.has(type)) return null
    names.add(name)
    parameters.push({ name, type })
  }
  return parameters.length >= 1 ? parameters : null
}

function normalizeStarterCode(
  value: unknown,
  functionName: string,
): Record<CodingLanguage, string> | null {
  if (!isPlainObject(value)) return null
  const python = text(value.python, MAX_STARTER)
  const javascript = text(value.javascript, MAX_STARTER)
  if (!python || !javascript) return null
  const pythonSignature = new RegExp(`def\\s+${functionName}\\s*\\(`)
  const javascriptSignature = new RegExp(
    `(?:function\\s+${functionName}\\s*\\(|(?:const|let|var)\\s+${functionName}\\s*=\\s*(?:async\\s*)?\\(?)`,
  )
  if (!pythonSignature.test(python) || !javascriptSignature.test(javascript)) return null
  return { python, javascript }
}

export function normalizeDifficulty(value: unknown): ProblemDifficulty | null {
  if (typeof value !== 'string') return null
  const lowered = value.trim().toLowerCase()
  return PROBLEM_DIFFICULTIES.includes(lowered as ProblemDifficulty)
    ? (lowered as ProblemDifficulty)
    : null
}

export function normalizeTitleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function normalizeCodingProblem(
  raw: unknown,
  options: { recentTitles?: string[] } = {},
): ProblemValidationResult {
  if (!isPlainObject(raw)) return { ok: false, error: 'Problem must be a JSON object.' }

  const title = text(raw.title, MAX_TITLE)
  if (!title) return { ok: false, error: 'A title of at most 120 characters is required.' }

  const duplicate = (options.recentTitles ?? []).some(
    (recent) => normalizeTitleKey(recent) === normalizeTitleKey(title),
  )
  if (duplicate) return { ok: false, error: 'The generated title repeats a recent problem.' }

  const difficulty = normalizeDifficulty(raw.difficulty)
  if (!difficulty) return { ok: false, error: 'Difficulty must be easy, medium or hard.' }

  const topic = text(raw.topic, MAX_TEXT)
  if (!topic) return { ok: false, error: 'A topic is required.' }

  const statement = text(raw.statement, MAX_STATEMENT)
  if (!statement || statement.length < MIN_STATEMENT) {
    return { ok: false, error: 'A problem statement of at least 40 characters is required.' }
  }

  const inputFormat = text(raw.inputFormat, MAX_FORMAT)
  const outputFormat = text(raw.outputFormat, MAX_FORMAT)
  if (!inputFormat || !outputFormat) {
    return { ok: false, error: 'Input and output formats are required.' }
  }

  const concepts = textList(raw.concepts, 1, 8, 80)
  if (!concepts) return { ok: false, error: 'One to eight concepts are required.' }

  const constraints = textList(raw.constraints, 1, 12, MAX_CONSTRAINT)
  if (!constraints) return { ok: false, error: 'One to twelve constraints are required.' }

  const examples = normalizeExamples(raw.examples)
  if (!examples) return { ok: false, error: 'At least one valid example is required.' }

  const hints = textList(raw.hints, 1, 4, MAX_HINT)
  if (!hints) return { ok: false, error: 'One to four hints are required.' }

  const functionName = text(raw.functionName, 64)
  if (!functionName || !IDENTIFIER_RE.test(functionName)) {
    return { ok: false, error: 'functionName must be a valid identifier.' }
  }

  const parameters = normalizeParameters(raw.parameters)
  if (!parameters) return { ok: false, error: 'Function parameters are invalid.' }

  const returnType = text(raw.returnType, 30) as ProblemValueType | null
  if (!returnType || !VALUE_TYPES.has(returnType)) {
    return { ok: false, error: 'returnType is not supported.' }
  }

  const visibleTests = normalizeTests(raw.visibleTests, parameters, 1, 5)
  if (!visibleTests) return { ok: false, error: 'Visible test cases are invalid.' }

  const hiddenTests = normalizeTests(raw.hiddenTests, parameters, 1, 8)
  if (!hiddenTests) return { ok: false, error: 'Hidden test cases are invalid.' }
  if (visibleTests.length + hiddenTests.length > MAX_TESTS) {
    return { ok: false, error: 'Too many test cases.' }
  }
  for (const test of [...visibleTests, ...hiddenTests]) {
    const argsMatch = test.args.every((arg, index) => matchesType(arg, parameters[index].type))
    if (!argsMatch || !matchesType(test.expected, returnType)) {
      return { ok: false, error: 'Test values do not match the declared parameter and return types.' }
    }
  }
  const testKey = (test: ProblemTest) => JSON.stringify({ args: test.args, expected: test.expected })
  const visibleKeys = new Set(visibleTests.map(testKey))
  const hiddenKeys = new Set<string>()
  for (const test of hiddenTests) {
    const key = testKey(test)
    if (visibleKeys.has(key) || hiddenKeys.has(key)) {
      return { ok: false, error: 'Visible and hidden test cases must not repeat.' }
    }
    hiddenKeys.add(key)
  }

  const starterCode = normalizeStarterCode(raw.starterCode, functionName)
  if (!starterCode) return { ok: false, error: 'Starter code for Python and JavaScript is required.' }

  const approach = text(raw.approach, MAX_APPROACH)
  const expectedComplexity = text(raw.expectedComplexity, MAX_COMPLEXITY)
  if (!approach || !expectedComplexity) {
    return { ok: false, error: 'An expected approach and complexity are required.' }
  }

  const generationRationale = text(raw.rationale, 500) ?? ''

  return {
    ok: true,
    value: {
      title,
      difficulty,
      topic,
      concepts,
      statement,
      inputFormat,
      outputFormat,
      constraints,
      examples,
      visibleTests,
      hiddenTests,
      hints,
      approach,
      expectedComplexity,
      functionName,
      parameters,
      returnType,
      starterCode,
      generationRationale,
    },
  }
}
