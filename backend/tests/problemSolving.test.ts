import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeCodingProblem,
  normalizeDifficulty,
  normalizeTitleKey,
  type NormalizedCodingProblem,
} from '../src/utils/problemGenerationValidation.js'
import {
  decideNextProblem,
  outcomeFromVerdict,
  type AdaptiveInput,
} from '../src/utils/problemAdaptive.js'
import {
  getQuestion,
  mapPublicProblem,
  saveQuestion,
  type ProblemQuestionRow,
} from '../src/services/problemSolving.service.js'
import { buildHarness } from '../src/services/problemExecution.service.js'
import { validateCodeRequest } from '../src/utils/problemValidation.js'

process.env.PROBLEM_TEST_SECRET = 'unit-test-secret'
const { encryptHiddenTests, decryptHiddenTests, encryptProblemText, decryptProblemText } =
  await import('../src/utils/problemSecrets.js')

function rawProblem(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Pair Sum Indexes',
    difficulty: 'easy',
    topic: 'Arrays',
    concepts: ['hash map', 'arrays'],
    statement: 'Given an array of integers and a target, return the indexes of two values that add up to the target.',
    inputFormat: 'An array of integers and one target integer.',
    outputFormat: 'An array with two indexes, or an empty array when no pair exists.',
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9'],
    examples: [
      { input: 'nums = [2, 7, 11, 15], target = 9', output: '[0, 1]', explanation: '2 + 7 = 9.' },
    ],
    visibleTests: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[3, 2, 4], 6], expected: [1, 2] },
    ],
    hiddenTests: [
      { args: [[3, 3], 6], expected: [0, 1] },
      { args: [[1, 2], 8], expected: [] },
      { args: [[-3, 4, 3, 90], 0], expected: [0, 2] },
    ],
    hints: ['Think about what value you need to complete the pair.', 'Can a hash map remember earlier values?'],
    approach: 'Store each value and its index in a hash map, then look for target - value.',
    expectedComplexity: 'O(n) time, O(n) space',
    functionName: 'pairSumIndexes',
    parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
    returnType: 'int[]',
    starterCode: {
      python: 'def pairSumIndexes(nums, target):\n    # Write your solution here\n    pass',
      javascript: 'function pairSumIndexes(nums, target) {\n  // Write your solution here\n}',
    },
    rationale: 'A baseline arrays problem for an easy adaptive step.',
    ...overrides,
  }
}

test('normalizes a valid generated problem', () => {
  const result = normalizeCodingProblem(rawProblem())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.title, 'Pair Sum Indexes')
  assert.equal(result.value.parameters.length, 2)
  assert.equal(result.value.visibleTests.length, 2)
  assert.equal(result.value.hiddenTests.length, 3)
})

test('normalizes difficulty case-insensitively', () => {
  assert.equal(normalizeDifficulty(' Medium '), 'medium')
  assert.equal(normalizeDifficulty('impossible'), null)
})

test('normalizes title keys for repetition checks', () => {
  assert.equal(normalizeTitleKey('Pair-Sum: Indexes!'), 'pair sum indexes')
})

test('rejects malformed AI problems', () => {
  const cases: Array<Record<string, unknown>> = [
    { difficulty: 'extreme' },
    { title: '' },
    { hiddenTests: [] },
    { visibleTests: [{ args: [[1], 2, 3], expected: 3 }] },
    { parameters: [{ name: 'nums', type: 'map' }] },
    { returnType: 'void' },
    { visibleTests: [{ args: [[1, 2], 'nine'], expected: [0, 1] }] },
    { visibleTests: [{ args: [[1, 2], 9], expected: 'not-an-array' }] },
    { starterCode: { python: 'def other():\n  pass', javascript: 'function other() {}' } },
    { starterCode: { python: '# pairSumIndexes mentioned only in a comment', javascript: '// pairSumIndexes mentioned only in a comment' } },
    { statement: 'too short' },
    { hiddenTests: [{ args: [[1]], expected: 'not valid for this signature' }] },
    { examples: [] },
  ]
  for (const overrides of cases) {
    const result = normalizeCodingProblem(rawProblem(overrides))
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(overrides)}`)
  }
})

test('rejects duplicate recent titles', () => {
  const result = normalizeCodingProblem(rawProblem(), { recentTitles: ['pair sum indexes'] })
  assert.equal(result.ok, false)
})

test('rejects duplicated tests across visible and hidden cases', () => {
  const shared = { args: [[3, 3], 6], expected: [0, 1] }
  const result = normalizeCodingProblem(rawProblem({
    hiddenTests: [shared, { args: [[1, 2], 8], expected: [] }, { args: [[3, 3], 6], expected: [0, 1] }],
  }))
  assert.equal(result.ok, false)
})

test('rejects oversized test payloads', () => {
  const huge = 'x'.repeat(5000)
  const result = normalizeCodingProblem(rawProblem({
    hiddenTests: [{ args: [[huge]], expected: [] }],
  }))
  assert.equal(result.ok, false)
})

test('encrypts hidden tests and rejects tampering', () => {
  const tests = [{ args: [[1, 2], 3], expected: 3 }]
  const payload = encryptHiddenTests(tests)
  assert.ok(payload.split('.').length === 3)
  assert.equal(payload.includes('expected'), false)
  assert.deepEqual(decryptHiddenTests(payload), tests)

  const parts = payload.split('.')
  const tampered = [parts[0], parts[1], `${parts[2].slice(0, -2)}AA`].join('.')
  assert.throws(() => decryptHiddenTests(tampered))
})

test('encrypts the reference approach and rejects tampering', () => {
  const approach = 'Use a hash map and scan the array once.'
  const payload = encryptProblemText(approach)
  assert.equal(payload.includes('hash map'), false)
  assert.equal(decryptProblemText(payload), approach)
  const parts = payload.split('.')
  parts[1] = `${parts[1][0] === 'A' ? 'B' : 'A'}${parts[1].slice(1)}`
  assert.throws(() => decryptProblemText(parts.join('.')))
})

test('persisting a question encrypts the approach and scopes it to the student', async () => {
  const normalized = normalizeCodingProblem(rawProblem())
  assert.equal(normalized.ok, true)
  if (!normalized.ok) return
  const problem: NormalizedCodingProblem = normalized.value
  let inserted: Record<string, unknown> | null = null
  const client = {
    from(table: string) {
      assert.equal(table, 'problem_questions')
      return {
        insert(payload: Record<string, unknown>) {
          inserted = payload
          return {
            select() {
              return {
                async single() {
                  return { data: { id: 'q1', ...payload }, error: null }
                },
              }
            },
          }
        },
      }
    },
  }

  const row = await saveQuestion(client as never, {
    sessionId: 's1',
    studentId: 'student-1',
    sequence: 1,
    problem,
    hiddenTestsEncrypted: 'hidden-ciphertext',
    adaptiveReason: 'baseline',
  })

  assert.ok(inserted)
  const payload = inserted as Record<string, unknown>
  assert.equal(payload.student_id, 'student-1')
  assert.equal(payload.hints_revealed, 0)
  assert.equal(payload.hidden_tests_encrypted, 'hidden-ciphertext')
  assert.equal(typeof payload.approach_encrypted, 'string')
  assert.equal((payload.approach_encrypted as string).includes(problem.approach), false)
  assert.equal(decryptProblemText(payload.approach_encrypted as string), problem.approach)
  assert.equal(row.student_id, 'student-1')
})

test('question reads always filter by the authenticated student', async () => {
  const filters: Array<[string, unknown]> = []
  const chain = {
    select() { return chain },
    eq(column: string, value: unknown) {
      filters.push([column, value])
      return chain
    },
    async maybeSingle() { return { data: null, error: null } },
  }
  const client = { from(table: string) { assert.equal(table, 'problem_questions'); return chain } }

  const row = await getQuestion(client as never, 'student-1', 'question-1')
  assert.equal(row, null)
  assert.deepEqual(filters, [
    ['id', 'question-1'],
    ['student_id', 'student-1'],
  ])
})

test('public problem mapping never includes hidden tests or private approach', () => {
  const normalized = normalizeCodingProblem(rawProblem())
  assert.equal(normalized.ok, true)
  if (!normalized.ok) return
  const problem: NormalizedCodingProblem = normalized.value
  const row: ProblemQuestionRow = {
    id: 'q1',
    session_id: 's1',
    student_id: 'student-1',
    sequence: 1,
    title: problem.title,
    difficulty: problem.difficulty,
    topic: problem.topic,
    concepts: problem.concepts,
    statement: problem.statement,
    input_format: problem.inputFormat,
    output_format: problem.outputFormat,
    constraints: problem.constraints,
    examples: problem.examples,
    visible_tests: problem.visibleTests,
    hidden_tests_encrypted: 'ciphertext',
    function_name: problem.functionName,
    parameters: problem.parameters,
    return_type: problem.returnType,
    starter_code: problem.starterCode,
    hints: problem.hints,
    hints_revealed: 1,
    approach_encrypted: encryptProblemText(problem.approach),
    expected_complexity: problem.expectedComplexity,
    adaptive_reason: 'baseline',
    generation_rationale: problem.generationRationale,
    source: 'ai',
    created_at: '2026-01-01T00:00:00.000Z',
  }

  const mapped = mapPublicProblem(row)
  const serialized = JSON.stringify(mapped)
  assert.equal(mapped.hintsRevealed, 1)
  assert.equal(mapped.hints.length, 1)
  assert.equal(mapped.hintsTotal, 2)
  assert.equal(serialized.includes(problem.hints[1]), false)
  assert.equal(serialized.includes('hidden'), false)
  assert.equal(serialized.includes(problem.approach), false)
  assert.equal(serialized.includes('ciphertext'), false)
  assert.equal(mapped.visibleTests.length, 2)
})

function adaptive(overrides: Partial<AdaptiveInput> = {}) {
  return decideNextProblem({
    currentDifficulty: 'easy',
    outcome: 'accepted',
    allTestsPassed: true,
    attemptsOnProblem: 1,
    consecutiveFailures: 0,
    hintsUsed: 0,
    topic: 'Arrays',
    inefficient: false,
    ...overrides,
  })
}

test('accepted without hints raises difficulty by one level', () => {
  assert.equal(adaptive().difficulty, 'medium')
  assert.equal(adaptive().focus, 'harder')
})

test('accepted with hints stays at the same level and topic', () => {
  const decision = adaptive({ hintsUsed: 1 })
  assert.equal(decision.difficulty, 'easy')
  assert.equal(decision.topic, 'Arrays')
  assert.match(decision.reason, /hint/)
})

test('accepted at hard stays hard', () => {
  assert.equal(adaptive({ currentDifficulty: 'hard' }).difficulty, 'hard')
})

test('partial success stays at the same difficulty with an edge-case focus', () => {
  const decision = adaptive({ outcome: 'partial', allTestsPassed: false })
  assert.equal(decision.difficulty, 'easy')
  assert.equal(decision.focus, 'edge_case')
})

test('one failure does not drop difficulty', () => {
  const decision = adaptive({
    outcome: 'wrong',
    allTestsPassed: false,
    consecutiveFailures: 1,
  })
  assert.equal(decision.difficulty, 'easy')
  assert.equal(decision.focus, 'prerequisite')
})

test('repeated failures drop exactly one level', () => {
  const decision = adaptive({
    currentDifficulty: 'hard',
    outcome: 'wrong',
    allTestsPassed: false,
    consecutiveFailures: 2,
  })
  assert.equal(decision.difficulty, 'medium')
  assert.equal(decision.focus, 'prerequisite')
})

test('repeated failures at easy stay easy', () => {
  assert.equal(
    adaptive({ currentDifficulty: 'easy', outcome: 'runtime_error', allTestsPassed: false, consecutiveFailures: 4 }).difficulty,
    'easy',
  )
})

test('solving the same problem across multiple submissions holds difficulty', () => {
  assert.equal(adaptive({ attemptsOnProblem: 2 }).difficulty, 'easy')
  assert.equal(adaptive({ attemptsOnProblem: 3 }).difficulty, 'easy')
})

test('inefficient accepted answers target optimization without a difficulty jump', () => {
  const decision = adaptive({ inefficient: true })
  assert.equal(decision.difficulty, 'easy')
  assert.equal(decision.focus, 'optimization')
})

test('outcome mapping uses the real test counts', () => {
  assert.deepEqual(outcomeFromVerdict('accepted', 5, 5), { outcome: 'accepted', allTestsPassed: true })
  assert.deepEqual(outcomeFromVerdict('wrong_answer', 2, 5), { outcome: 'partial', allTestsPassed: false })
  assert.deepEqual(outcomeFromVerdict('wrong_answer', 0, 5), { outcome: 'wrong', allTestsPassed: false })
  assert.deepEqual(outcomeFromVerdict('runtime_error', 0, 5), { outcome: 'runtime_error', allTestsPassed: false })
})

test('Python harness calls the generated function with JSON args', () => {
  const harness = buildHarness('python', 'pairSumIndexes', 'def pairSumIndexes(nums, target):\n  return []', [[1, 2], 3])
  assert.match(harness, /__mockmate_args = __mockmate_json\.loads/)
  assert.match(harness, /pairSumIndexes\(\*__mockmate_args\)/)
  assert.match(harness, /print\(__mockmate_json\.dumps/)
  assert.match(harness, /\[\[1,2\],3\]/)
})

test('JavaScript harness calls the generated function with JSON args', () => {
  const harness = buildHarness('javascript', 'pairSumIndexes', 'function pairSumIndexes(nums, target) { return [] }', [[1, 2], 3])
  assert.match(harness, /JSON\.parse/)
  assert.match(harness, /pairSumIndexes\(\.\.\.__mockmateArgs\)/)
  assert.match(harness, /console\.log\(JSON\.stringify/)
})

test('code request validation only allows supported languages', () => {
  assert.equal(validateCodeRequest({ language: 'c++', code: 'x' }).ok, false)
  assert.equal(validateCodeRequest({ language: 'python', code: '   ' }).ok, false)
  assert.equal(validateCodeRequest({ language: 'python', code: 'x'.repeat(20_001) }).ok, false)
  const valid = validateCodeRequest({ language: 'javascript', code: 'function f() {}' })
  assert.equal(valid.ok, true)
})
