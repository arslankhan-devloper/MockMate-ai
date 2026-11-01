import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import {
  PRACTICE_BRANCHES,
  validatePracticeAnswer,
  validatePracticeSession,
} from '../src/utils/practiceValidation.js'
import {
  buildPracticeCatalog,
  derivePracticeTotals,
  mapPracticeQuestionRow,
  mapPracticeSessionRow,
  pickRandomQuestions,
  practiceAccuracy,
  type PracticeQuestionRow,
  type PracticeSessionRow,
} from '../src/services/practice.service.js'
import {
  activeSessionHandler,
  answerHandler,
  catalogHandler,
  completeSessionHandler,
  createSessionHandler,
  getSessionHandler,
  historyHandler,
} from '../src/controllers/practice.controller.js'
import {
  getPracticeSessionView,
  listPracticeHistory,
} from '../src/services/practice.service.js'

function response(): Response & { statusCode: number; payload: unknown } {
  const res = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.payload = payload
      return this
    },
    setHeader() {
      return this
    },
  }
  return res as unknown as Response & { statusCode: number; payload: unknown }
}

function request(options: {
  role?: 'student' | 'placement-officer'
  authenticated?: boolean
  params?: Record<string, string>
  query?: Record<string, string>
  body?: unknown
  writer?: unknown
} = {}): Request {
  const req = {
    auth: options.authenticated === false
      ? undefined
      : {
          userId: '11111111-1111-4111-8111-111111111111',
          email: 'student@example.com',
          role: options.role ?? 'student',
          collegeId: 'college-1',
          accessToken: 'token',
        },
    supabase: {},
    supabaseWrite: options.writer,
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body,
  }
  return req as unknown as Request
}

function errorCode(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const code = (payload as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

test('practice session validation accepts a bounded branch selection', () => {
  const parsed = validatePracticeSession({
    kind: 'branch_mcq',
    branch: 'cse',
    category: 'DBMS',
    topic: 'Normalization',
    difficulty: 'medium',
    mode: 'practice',
    count: 10,
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value.branch, 'cse')
  assert.equal(parsed.value.questionCount, 10)
  assert.equal(parsed.value.timeLimitSeconds, null)
})

test('practice session validation applies safe defaults', () => {
  const parsed = validatePracticeSession({ kind: 'aptitude', branch: 'ignored' })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value.branch, null)
  assert.equal(parsed.value.difficulty, 'mixed')
  assert.equal(parsed.value.mode, 'practice')
  assert.equal(parsed.value.questionCount, 10)
})

test('practice session validation computes a bounded timed limit', () => {
  const parsed = validatePracticeSession({ kind: 'aptitude', mode: 'timed', count: 15 })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value.timeLimitSeconds, 900)

  const capped = validatePracticeSession({ kind: 'aptitude', mode: 'timed', count: 30 })
  assert.equal(capped.ok, true)
  if (!capped.ok) return
  assert.equal(capped.value.timeLimitSeconds, 1800)
})

test('practice session validation rejects unknown kinds, branches and filters', () => {
  const unknownKind = validatePracticeSession({ kind: 'quiz', branch: 'cse' })
  assert.equal(unknownKind.ok, false)
  if (!unknownKind.ok) assert.match(unknownKind.fields.kind, /branch_mcq/)

  const unknownBranch = validatePracticeSession({ kind: 'branch_mcq', branch: 'law' })
  assert.equal(unknownBranch.ok, false)
  if (!unknownBranch.ok) assert.match(unknownBranch.fields.branch, /cse/)

  const missingBranch = validatePracticeSession({ kind: 'branch_mcq' })
  assert.equal(missingBranch.ok, false)
  if (!missingBranch.ok) assert.ok(missingBranch.fields.branch)

  const badDifficulty = validatePracticeSession({ kind: 'aptitude', difficulty: 'extreme' })
  assert.equal(badDifficulty.ok, false)
  if (!badDifficulty.ok) assert.match(badDifficulty.fields.difficulty, /easy/)

  const badCount = validatePracticeSession({ kind: 'aptitude', count: 99 })
  assert.equal(badCount.ok, false)
  if (!badCount.ok) assert.match(badCount.fields.count, /1 to 30/)
})

test('aptitude categories are restricted to the documented set', () => {
  const valid = validatePracticeSession({
    kind: 'aptitude',
    category: 'Quantitative Aptitude',
  })
  assert.equal(valid.ok, true)

  const invalid = validatePracticeSession({ kind: 'aptitude', category: 'Astrology' })
  assert.equal(invalid.ok, false)
  if (!invalid.ok) assert.match(invalid.fields.category, /Quantitative Aptitude/)
})

test('practice answer validation accepts only a 0-3 option and a UUID', () => {
  const questionId = '22222222-2222-4222-8222-222222222222'
  const valid = validatePracticeAnswer({ questionId, selectedIndex: 3 })
  assert.equal(valid.ok, true)
  if (!valid.ok) return
  assert.equal(valid.value.selectedIndex, 3)

  for (const selectedIndex of [-1, 4, 1.5, '2', undefined]) {
    const parsed = validatePracticeAnswer({ questionId, selectedIndex })
    assert.equal(parsed.ok, false)
  }
  const badId = validatePracticeAnswer({ questionId: 'nope', selectedIndex: 0 })
  assert.equal(badId.ok, false)
})

test('practice catalog aggregates topics and keeps empty canonical aptitude categories', () => {
  const branchCatalog = buildPracticeCatalog(
    [
      { branch: 'cse', category: 'DBMS', topic: 'Normalization', difficulty: 'easy' },
      { branch: 'cse', category: 'DBMS', topic: 'Normalization', difficulty: 'hard' },
      { branch: 'mechanical', category: 'Thermodynamics', topic: 'Laws', difficulty: 'medium' },
    ],
    'branch_mcq',
    'cse',
  )
  assert.equal(branchCatalog.total, 2)
  assert.equal(branchCatalog.categories.length, 1)
  assert.equal(branchCatalog.categories[0].name, 'DBMS')
  assert.equal(branchCatalog.categories[0].topics[0].name, 'Normalization')
  assert.deepEqual(branchCatalog.categories[0].topics[0].counts, { easy: 1, medium: 0, hard: 1 })
  assert.equal(branchCatalog.branches.find((branch) => branch.id === 'cse')?.total, 2)
  assert.equal(branchCatalog.branches.find((branch) => branch.id === 'mechanical')?.total, 1)

  const aptitudeCatalog = buildPracticeCatalog(
    [{ branch: null, category: 'Quantitative Aptitude', topic: 'Percentages', difficulty: 'easy' }],
    'aptitude',
    null,
  )
  assert.equal(aptitudeCatalog.categories.length, 5)
  assert.equal(aptitudeCatalog.categories[0].name, 'Quantitative Aptitude')
  assert.equal(aptitudeCatalog.categories[0].total, 1)
  assert.ok(aptitudeCatalog.categories.some((category) => category.name === 'Puzzles' && category.total === 0))
})

test('random question selection does not mutate input and is bounded', () => {
  const rows = [1, 2, 3, 4, 5]
  const picked = pickRandomQuestions(rows, 3, () => 0.5)
  assert.equal(picked.length, 3)
  assert.equal(new Set(picked).size, 3)
  assert.deepEqual(rows, [1, 2, 3, 4, 5])

  const all = pickRandomQuestions(rows, 99)
  assert.equal(all.length, rows.length)
  assert.deepEqual([...all].sort(), rows)
})

test('unanswered questions never expose the correct answer or explanation', () => {
  const row: PracticeQuestionRow = {
    id: 'q1',
    kind: 'branch_mcq',
    branch: 'cse',
    category: 'DBMS',
    topic: 'Normalization',
    difficulty: 'medium',
    prompt: 'Which normal form removes transitive dependencies?',
    options: ['1NF', '2NF', '3NF', 'BCNF'],
    correct_index: 2,
    explanation: '3NF removes transitive dependencies.',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  }

  const unanswered = mapPracticeQuestionRow(row, 0, undefined)
  assert.equal(unanswered.answer, null)
  assert.equal('correctIndex' in unanswered, false)
  assert.equal('explanation' in unanswered, false)
  assert.deepEqual(unanswered.options, row.options)

  const answered = mapPracticeQuestionRow(row, 0, {
    id: 'a1',
    session_id: 's1',
    question_id: 'q1',
    student_id: 'u1',
    selected_index: 2,
    is_correct: true,
    answered_at: '2026-01-01T00:01:00.000Z',
  })
  assert.equal(answered.answer?.correctIndex, 2)
  assert.equal(answered.answer?.isCorrect, true)
  assert.match(answered.answer?.explanation ?? '', /3NF/)
})

test('session mapping derives score, accuracy and expiry on the server', () => {
  const row: PracticeSessionRow = {
    id: 's1',
    student_id: 'u1',
    kind: 'branch_mcq',
    branch: 'cse',
    category: 'DBMS',
    topic: null,
    difficulty: 'mixed',
    mode: 'timed',
    question_count: 10,
    answered_count: 4,
    correct_count: 3,
    status: 'active',
    time_limit_seconds: 600,
    expires_at: '2026-01-01T00:10:00.000Z',
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
  const mapped = mapPracticeSessionRow(row, Date.parse('2026-01-01T00:05:00.000Z'))
  assert.equal(mapped.score, 3)
  assert.equal(mapped.accuracy, 75)
  assert.equal(mapped.remainingSeconds, 300)
  assert.equal(mapped.expired, false)

  const expired = mapPracticeSessionRow(row, Date.parse('2026-01-01T00:11:00.000Z'))
  assert.equal(expired.expired, true)
  assert.equal(expired.remainingSeconds, 0)
  assert.equal(practiceAccuracy(0, 0), 0)
})

test('practice totals are derived only from stored answers', () => {
  assert.deepEqual(
    derivePracticeTotals([{ is_correct: true }, { is_correct: false }, { is_correct: true }]),
    { answered: 3, correct: 2 },
  )
})

test('practice handlers reject unauthenticated and non-student calls', async () => {
  const handlers = [
    catalogHandler,
    createSessionHandler,
    activeSessionHandler,
    historyHandler,
    getSessionHandler,
    answerHandler,
    completeSessionHandler,
  ]
  for (const handler of handlers) {
    const res = response()
    await handler(request({ authenticated: false }), res)
    assert.equal(res.statusCode, 401)
    assert.equal(errorCode(res.payload), 'not_authenticated')
  }

  for (const handler of handlers) {
    const res = response()
    await handler(request({ role: 'placement-officer' }), res)
    assert.equal(res.statusCode, 403)
    assert.equal(errorCode(res.payload), 'forbidden')
  }
})

test('practice handlers validate input before touching storage', async () => {
  const invalidKind = response()
  await catalogHandler(request({ query: { kind: 'quiz' } }), invalidKind)
  assert.equal(invalidKind.statusCode, 400)
  assert.equal(errorCode(invalidKind.payload), 'invalid_kind')

  const missingBranch = response()
  await catalogHandler(request({ query: { kind: 'branch_mcq' } }), missingBranch)
  assert.equal(missingBranch.statusCode, 400)
  assert.equal(errorCode(missingBranch.payload), 'invalid_branch')

  const badSession = response()
  await getSessionHandler(request({ params: { id: 'nope' } }), badSession)
  assert.equal(badSession.statusCode, 400)
  assert.equal(errorCode(badSession.payload), 'invalid_session')

  const badAnswer = response()
  await answerHandler(
    request({
      params: { id: '33333333-3333-4333-8333-333333333333' },
      body: { questionId: '44444444-4444-4444-8444-444444444444', selectedIndex: 9 },
    }),
    badAnswer,
  )
  assert.equal(badAnswer.statusCode, 400)
  assert.equal(errorCode(badAnswer.payload), 'validation_error')

  const badCreate = response()
  await createSessionHandler(
    request({ body: { kind: 'branch_mcq', branch: 'law', count: 10 } }),
    badCreate,
  )
  assert.equal(badCreate.statusCode, 400)
  assert.equal(errorCode(badCreate.payload), 'validation_error')
})

test('practice storage is never bypassed when the service client is missing', async () => {
  const res = response()
  await catalogHandler(request({ query: { kind: 'aptitude' } }), res)
  assert.equal(res.statusCode, 503)
  assert.equal(errorCode(res.payload), 'practice_not_configured')
})

test('starting practice with an empty question bank returns an honest 409', async () => {
  const chain: Record<string, unknown> = {
    select() {
      return chain
    },
    eq() {
      return chain
    },
    async limit() {
      return { data: [], error: null }
    },
  }
  const writer = {
    from() {
      return chain
    },
  }
  const res = response()
  await createSessionHandler(
    request({
      writer,
      body: { kind: 'aptitude', category: 'Quantitative Aptitude', count: 5 },
    }),
    res,
  )
  assert.equal(res.statusCode, 409)
  assert.equal(errorCode(res.payload), 'practice_no_questions')
})

test('all documented branches are exposed to the client', () => {
  assert.deepEqual(
    PRACTICE_BRANCHES.map((branch) => branch.id),
    ['cse', 'it', 'mechanical', 'civil', 'electrical', 'ece', 'ai-ds', 'other'],
  )
})

test('session reads are always scoped to the verified student', async () => {
  const filters: Array<[string, unknown]> = []
  const chain = {
    select() {
      return chain
    },
    eq(column: string, value: unknown) {
      filters.push([column, value])
      return chain
    },
    async maybeSingle() {
      return { data: null, error: null }
    },
  }
  const client = {
    from(table: string) {
      assert.equal(table, 'practice_sessions')
      return chain
    },
  } as unknown as Parameters<typeof getPracticeSessionView>[0]

  const view = await getPracticeSessionView(
    client,
    '33333333-3333-4333-8333-333333333333',
    'verified-student-id',
  )
  assert.equal(view, null)
  assert.deepEqual(filters, [
    ['id', '33333333-3333-4333-8333-333333333333'],
    ['student_id', 'verified-student-id'],
  ])
})

test('practice history only lists the verified student rows', async () => {
  const filters: Array<[string, unknown]> = []
  const chain = {
    select() {
      return chain
    },
    eq(column: string, value: unknown) {
      filters.push([column, value])
      return chain
    },
    order() {
      return chain
    },
    async limit() {
      return { data: [], error: null }
    },
  }
  const client = {
    from(table: string) {
      assert.equal(table, 'practice_sessions')
      return chain
    },
  } as unknown as Parameters<typeof listPracticeHistory>[0]

  const history = await listPracticeHistory(client, 'verified-student-id', 'aptitude')
  assert.deepEqual(history, [])
  assert.deepEqual(filters, [
    ['student_id', 'verified-student-id'],
    ['kind', 'aptitude'],
  ])
})
