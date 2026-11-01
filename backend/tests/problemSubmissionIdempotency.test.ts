import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { submitProblem, WorkspaceError } from '../src/services/problemWorkspace.service.js'
import { validateSubmissionRequest } from '../src/utils/problemValidation.js'
import type {
  ProblemQuestionRow,
  ProblemSessionRow,
  ProblemSubmissionRow,
  ProblemTopicProgressRow,
} from '../src/services/problemSolving.service.js'

process.env.PROBLEM_TEST_SECRET = 'unit-test-secret'
const { encryptHiddenTests, encryptProblemText } = await import('../src/utils/problemSecrets.js')

const NOW = '2026-01-01T10:00:00.000Z'
const KEY = '11111111-1111-4111-8111-111111111111'
const OTHER_KEY = '22222222-2222-4222-8222-222222222222'
const QUESTION_ID = '33333333-3333-4333-8333-333333333333'
const SESSION_ID = '44444444-4444-4444-8444-444444444444'

interface State {
  problem_questions: ProblemQuestionRow[]
  problem_sessions: ProblemSessionRow[]
  problem_submissions: ProblemSubmissionRow[]
  problem_topic_progress: ProblemTopicProgressRow[]
}

function question(studentId = 'student-1', overrides: Partial<ProblemQuestionRow> = {}): ProblemQuestionRow {
  return {
    id: QUESTION_ID,
    session_id: SESSION_ID,
    student_id: studentId,
    sequence: 1,
    title: 'Add two numbers',
    difficulty: 'easy',
    topic: 'Arrays',
    concepts: ['arrays'],
    statement: 'Return the sum of two numbers.',
    input_format: 'Two integers.',
    output_format: 'One integer.',
    constraints: [],
    examples: [],
    visible_tests: [{ args: [1, 2], expected: 3 }],
    hidden_tests_encrypted: encryptHiddenTests([{ args: [4, 5], expected: 9 }]),
    function_name: 'add',
    parameters: [],
    return_type: 'int',
    starter_code: {},
    hints: ['Add them.'],
    hints_revealed: 0,
    approach_encrypted: encryptProblemText('Return a + b.'),
    expected_complexity: 'O(1)',
    adaptive_reason: 'baseline',
    generation_rationale: '',
    source: 'ai',
    created_at: NOW,
    ...overrides,
  }
}

function session(studentId = 'student-1', overrides: Partial<ProblemSessionRow> = {}): ProblemSessionRow {
  return {
    id: SESSION_ID,
    student_id: studentId,
    status: 'active',
    current_difficulty: 'easy',
    current_topic: 'Arrays',
    answered_count: 0,
    accepted_count: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

function progressRow(overrides: Partial<ProblemTopicProgressRow> = {}): ProblemTopicProgressRow {
  return {
    student_id: 'student-1',
    topic: 'Arrays',
    attempts: 0,
    accepted: 0,
    partial: 0,
    wrong: 0,
    hints_used: 0,
    consecutive_failures: 0,
    current_difficulty: 'easy',
    last_outcome: null,
    updated_at: NOW,
    ...overrides,
  }
}

function state(): State {
  return {
    problem_questions: [question()],
    problem_sessions: [session()],
    problem_submissions: [],
    problem_topic_progress: [],
  }
}

function readClient(data: State): SupabaseClient {
  return {
    from(table: keyof State) {
      const rows = () => data[table] as Array<Record<string, unknown>>
      const filters: Array<[string, unknown]> = []
      const filtered = () => rows().filter((row) =>
        filters.every(([column, value]) => row[column] === value))
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (column: string, value: unknown) => {
        filters.push([column, value])
        return chain
      }
      chain.order = async () => ({ data: filtered(), error: null })
      chain.maybeSingle = async () => ({ data: filtered()[0] ?? null, error: null })
      return chain
    },
  } as unknown as SupabaseClient
}

interface WriterHooks {
  beforeRpc?: (args: Record<string, unknown>) => Promise<void>
  failRpc?: boolean
}

function writeClient(
  data: State,
  options: {
    hooks?: WriterHooks
    onCreate?: (row: ProblemSubmissionRow) => void
  } = {},
): SupabaseClient {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, 'record_problem_submission')
      await options.hooks?.beforeRpc?.(args)
      if (options.hooks?.failRpc) {
        return { data: null, error: { message: 'simulated progress failure', code: 'XX000' } }
      }

      const studentId = String(args.p_student_id)
      const questionRow = data.problem_questions.find((row) => row.id === args.p_question_id)
      const existing = data.problem_submissions.find((row) =>
        row.student_id === studentId &&
        row.question_id === args.p_question_id &&
        row.client_submission_id === args.p_client_submission_id)
      const currentSession = data.problem_sessions.find((row) =>
        row.student_id === studentId && row.status === 'active') ?? data.problem_sessions[0]
      const currentProgress = data.problem_topic_progress.find((row) =>
        row.student_id === studentId && row.topic === args.p_next_topic) ?? null

      if (existing) {
        return {
          data: {
            created: false,
            submission: existing,
            session: currentSession,
            progress: currentProgress,
          },
          error: null,
        }
      }

      if (currentSession.status !== 'active') {
        return { data: null, error: { message: 'session_completed', code: 'P0001' } }
      }

      const row: ProblemSubmissionRow = {
        id: `sub-${data.problem_submissions.length + 1}`,
        question_id: String(args.p_question_id),
        session_id: questionRow?.session_id ?? SESSION_ID,
        student_id: studentId,
        client_submission_id: String(args.p_client_submission_id),
        language: String(args.p_language),
        code: String(args.p_code),
        verdict: String(args.p_verdict),
        passed_tests: Number(args.p_passed_tests),
        total_tests: Number(args.p_total_tests),
        runtime_ms: null,
        test_summary: args.p_test_summary,
        result_details: args.p_result_details,
        all_passed: args.p_all_passed === true,
        adaptive_difficulty: String(args.p_next_difficulty),
        adaptive_focus: String(args.p_next_focus),
        adaptive_reason: String(args.p_next_reason),
        created_at: NOW,
      }
      const attemptsBefore = data.problem_submissions.filter((submission) =>
        submission.student_id === studentId && submission.question_id === row.question_id).length
      const acceptedBefore = data.problem_submissions.filter((submission) =>
        submission.student_id === studentId &&
        submission.question_id === row.question_id &&
        submission.verdict === 'accepted').length
      data.problem_submissions.push(row)

      let progress = data.problem_topic_progress.find((item) =>
        item.student_id === studentId && item.topic === args.p_next_topic)
      if (!progress) {
        progress = progressRow({ student_id: studentId })
        data.problem_topic_progress.push(progress)
      }
      const outcome = String(args.p_outcome)
      progress.attempts += 1
      progress.accepted += outcome === 'accepted' ? 1 : 0
      progress.partial += outcome === 'partial' ? 1 : 0
      progress.wrong += outcome !== 'accepted' && outcome !== 'partial' ? 1 : 0
      progress.hints_used += Number(args.p_hints_used)
      progress.consecutive_failures = outcome === 'accepted' ? 0 : progress.consecutive_failures + 1
      progress.current_difficulty = String(args.p_next_difficulty)
      progress.last_outcome = outcome
      progress.updated_at = NOW

      currentSession.answered_count += attemptsBefore === 0 ? 1 : 0
      currentSession.accepted_count +=
        outcome === 'accepted' && acceptedBefore === 0 ? 1 : 0
      currentSession.current_difficulty = String(args.p_next_difficulty)
      currentSession.current_topic = String(args.p_next_topic)
      currentSession.updated_at = NOW

      options.onCreate?.(row)
      return {
        data: {
          created: true,
          submission: row,
          session: currentSession,
          progress,
        },
        error: null,
      }
    },
  } as unknown as SupabaseClient
}

function acceptedGrade() {
  return {
    verdict: 'accepted' as const,
    passedTests: 2,
    totalTests: 2,
    provider: 'test',
    results: [
      { index: 0, passed: true, hidden: false, input: [1, 2], expected: 3, actual: 3 },
      { index: 1, passed: true, hidden: true },
    ],
  }
}

test('retrying a stored submission returns it without grading or writing again', async () => {
  const data = state()
  const stored: ProblemSubmissionRow = {
    id: 'sub-existing',
    question_id: QUESTION_ID,
    session_id: SESSION_ID,
    student_id: 'student-1',
    client_submission_id: KEY,
    language: 'python',
    code: 'def add(a, b): return a + b',
    verdict: 'accepted',
    passed_tests: 2,
    total_tests: 2,
    runtime_ms: null,
    test_summary: [{ index: 0, passed: true, hidden: false }],
    result_details: [{ index: 0, passed: true, hidden: false, input: [1, 2], expected: 3, actual: 3 }],
    all_passed: true,
    adaptive_difficulty: 'medium',
    adaptive_focus: 'harder',
    adaptive_reason: 'Stored reason.',
    created_at: NOW,
  }
  data.problem_submissions.push(stored)
  data.problem_topic_progress.push(progressRow({ attempts: 1, accepted: 1 }))
  data.problem_sessions[0].answered_count = 1
  data.problem_sessions[0].accepted_count = 1

  let rpcCalls = 0
  const result = await submitProblem(
    readClient(data),
    {
      async rpc() {
        rpcCalls += 1
        throw new Error('RPC must not run for an existing submission')
      },
    } as unknown as SupabaseClient,
    'student-1',
    QUESTION_ID,
    'python',
    'def add(a, b): return a + b',
    KEY,
    {
      grade: async () => {
        throw new Error('grader must not run for an existing submission')
      },
    },
  )

  assert.equal(rpcCalls, 0)
  assert.equal(result.submission.id, 'sub-existing')
  assert.equal(result.submission.verdict, 'accepted')
  assert.equal(result.adaptive.difficulty, 'medium')
  assert.equal(result.adaptive.focus, 'harder')
  assert.equal(result.adaptive.reason, 'Stored reason.')
  assert.equal(result.progress.attempts, 1)
})

test('concurrent retries with one key create one submission and one progress increment', async () => {
  const data = state()
  let graders = 0
  let release!: () => void
  const bothGrading = new Promise<void>((resolve) => {
    release = resolve
  })
  const grade = async () => {
    graders += 1
    if (graders === 2) release()
    await bothGrading
    return acceptedGrade()
  }
  let rpcCalls = 0
  const writer = writeClient(data, {
    hooks: {
      async beforeRpc() {
        rpcCalls += 1
      },
    },
  })

  const [first, second] = await Promise.all([
    submitProblem(readClient(data), writer, 'student-1', QUESTION_ID, 'python', 'def add(a, b): return a + b', KEY, { grade }),
    submitProblem(readClient(data), writer, 'student-1', QUESTION_ID, 'python', 'def add(a, b): return a + b', KEY, { grade }),
  ])

  assert.equal(graders, 2)
  assert.equal(rpcCalls, 2)
  assert.equal(data.problem_submissions.length, 1)
  assert.equal(data.problem_topic_progress[0].attempts, 1)
  assert.equal(data.problem_sessions[0].answered_count, 1)
  assert.equal(first.submission.id, second.submission.id)
})

test('retrying a stored submission still works after its session is completed', async () => {
  const data = state()
  data.problem_submissions.push({
    id: 'sub-existing',
    question_id: QUESTION_ID,
    session_id: SESSION_ID,
    student_id: 'student-1',
    client_submission_id: KEY,
    language: 'python',
    code: 'def add(a, b): return a + b',
    verdict: 'accepted',
    passed_tests: 2,
    total_tests: 2,
    runtime_ms: null,
    test_summary: [],
    result_details: [],
    all_passed: true,
    adaptive_difficulty: 'medium',
    adaptive_focus: 'harder',
    adaptive_reason: 'Stored reason.',
    created_at: NOW,
  })
  data.problem_topic_progress.push(progressRow({ attempts: 1, accepted: 1 }))
  data.problem_sessions[0].status = 'completed'
  data.problem_sessions[0].answered_count = 1
  data.problem_sessions[0].accepted_count = 1

  const result = await submitProblem(
    readClient(data),
    { async rpc() { throw new Error('RPC must not run for a stored submission') } } as unknown as SupabaseClient,
    'student-1',
    QUESTION_ID,
    'python',
    'def add(a, b): return a + b',
    KEY,
    { grade: async () => { throw new Error('grader must not run after completion') } },
  )

  assert.equal(result.submission.id, 'sub-existing')
  assert.equal(data.problem_sessions[0].answered_count, 1)
})

test('different keys remain distinct submissions even with identical code', async () => {
  const data = state()
  const writer = writeClient(data)

  const first = await submitProblem(
    readClient(data), writer, 'student-1', QUESTION_ID,
    'python', 'def add(a, b): return a + b', KEY, { grade: async () => acceptedGrade() },
  )
  const second = await submitProblem(
    readClient(data), writer, 'student-1', QUESTION_ID,
    'python', 'def add(a, b): return a + b', OTHER_KEY, { grade: async () => acceptedGrade() },
  )

  assert.notEqual(first.submission.id, second.submission.id)
  assert.equal(data.problem_submissions.length, 2)
  assert.equal(data.problem_topic_progress[0].attempts, 2)
  assert.equal(data.problem_sessions[0].answered_count, 1)
  assert.equal(data.problem_sessions[0].accepted_count, 1)
})

test('reusing a key with different code is rejected without a second write', async () => {
  const data = state()
  const stored: ProblemSubmissionRow = {
    id: 'sub-existing',
    question_id: QUESTION_ID,
    session_id: SESSION_ID,
    student_id: 'student-1',
    client_submission_id: KEY,
    language: 'python',
    code: 'def add(a, b): return a + b',
    verdict: 'accepted',
    passed_tests: 2,
    total_tests: 2,
    runtime_ms: null,
    test_summary: [],
    result_details: [],
    all_passed: true,
    adaptive_difficulty: 'medium',
    adaptive_focus: 'harder',
    adaptive_reason: 'Stored reason.',
    created_at: NOW,
  }
  data.problem_submissions.push(stored)
  data.problem_topic_progress.push(progressRow({ attempts: 1, accepted: 1 }))

  await assert.rejects(
    submitProblem(
      readClient(data),
      writeClient(data),
      'student-1',
      QUESTION_ID,
      'python',
      'print("different")',
      KEY,
      { grade: async () => acceptedGrade() },
    ),
    (err: unknown) => err instanceof WorkspaceError && err.code === 'idempotency_conflict',
  )
  assert.equal(data.problem_submissions.length, 1)
  assert.equal(data.problem_topic_progress[0].attempts, 1)
})

test('an RPC-level key/code conflict is reported without changing progress', async () => {
  const data = state()
  const writer = {
    async rpc() {
      return {
        data: null,
        error: { message: 'idempotency_conflict', code: 'P0001' },
      }
    },
  } as unknown as SupabaseClient

  await assert.rejects(
    submitProblem(
      readClient(data), writer, 'student-1', QUESTION_ID,
      'python', 'print("different")', KEY, { grade: async () => acceptedGrade() },
    ),
    (err: unknown) => err instanceof WorkspaceError && err.code === 'idempotency_conflict',
  )

  assert.equal(data.problem_submissions.length, 0)
  assert.equal(data.problem_topic_progress.length, 0)
  assert.equal(data.problem_sessions[0].answered_count, 0)
})

test('submission validation drops forged identity, verdict and result fields', () => {
  const parsed = validateSubmissionRequest({
    language: 'python',
    code: 'def add(a, b): return a + b',
    idempotencyKey: KEY,
    student_id: 'student-2',
    session_id: SESSION_ID,
    verdict: 'accepted',
    passed_tests: 999,
    hidden: 'secret',
  })

  assert.deepEqual(parsed, {
    ok: true,
    language: 'python',
    code: 'def add(a, b): return a + b',
    idempotencyKey: KEY,
  })
})

test('the same key may be reused by a different student', async () => {
  const data = state()
  data.problem_questions.push(question('student-2', { id: '55555555-5555-4555-8555-555555555555' }))
  data.problem_sessions.push(session('student-2', { id: '66666666-6666-4666-8666-666666666666' }))
  data.problem_questions[1].session_id = data.problem_sessions[1].id
  const writer = writeClient(data)

  const first = await submitProblem(
    readClient(data), writer, 'student-1', QUESTION_ID,
    'python', 'def add(a, b): return a + b', KEY, { grade: async () => acceptedGrade() },
  )
  const second = await submitProblem(
    readClient(data), writer, 'student-2', data.problem_questions[1].id,
    'python', 'def add(a, b): return a + b', KEY, { grade: async () => acceptedGrade() },
  )

  assert.notEqual(first.submission.id, second.submission.id)
  assert.equal(data.problem_submissions.length, 2)
  assert.equal(new Set(data.problem_submissions.map((row) => row.student_id)).size, 2)
})

test('an RPC failure does not fabricate a result or fall back to direct writes', async () => {
  const data = state()
  const writer = writeClient(data, { hooks: { failRpc: true } })

  await assert.rejects(
    submitProblem(
      readClient(data), writer, 'student-1', QUESTION_ID,
      'python', 'def add(a, b): return a + b', KEY, { grade: async () => acceptedGrade() },
    ),
    (err: unknown) =>
      typeof err === 'object' &&
      err !== null &&
      (err as { message?: unknown }).message === 'simulated progress failure',
  )

  assert.equal(data.problem_submissions.length, 0)
  assert.equal(data.problem_topic_progress.length, 0)
  assert.equal(data.problem_sessions[0].answered_count, 0)
})
