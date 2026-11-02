import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import {
  APPLICATION_STATUS_ORDER,
  CODING_ATTEMPT_ANALYTICS_COLUMNS,
  PRACTICE_ANSWER_ANALYTICS_COLUMNS,
  PRACTICE_SESSION_ANALYTICS_COLUMNS,
  PROBLEM_SUBMISSION_ANALYTICS_COLUMNS,
  READINESS_MIN_COMPONENTS,
  ROADMAP_PROGRESS_ANALYTICS_COLUMNS,
  bucketRows,
  buildAnalyticsDashboard,
  buildCodingAnalytics,
  buildDsaAnalytics,
  buildPlacementAnalytics,
  buildPracticeAnalytics,
  buildReadinessScore,
  buildRecentActivity,
  buildRoadmapAnalytics,
  chunkIds,
  percentOf,
  trendGranularity,
  type AnalyticsDashboardInput,
  type CodingAttemptAnalyticsRow,
  type PracticeAnalyticsInput,
  type PracticeAnswerAnalyticsRow,
  type PracticeQuestionAnalyticsRow,
  type PracticeSessionAnalyticsRow,
  type ProblemQuestionAnalyticsRow,
  type ProblemSubmissionAnalyticsRow,
  type RoadmapProgressAnalyticsRow,
} from '../src/services/analyticsDashboard.service.js'
import {
  buildInterviewAnalytics,
  type AnalyticsApplicationRow,
} from '../src/services/interviewAnalytics.service.js'
import { dashboardHandler } from '../src/controllers/analytics.controller.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function practiceSession(overrides: Partial<PracticeSessionAnalyticsRow> = {}): PracticeSessionAnalyticsRow {
  return {
    id: 'ps-1',
    kind: 'aptitude',
    category: 'Quantitative Aptitude',
    topic: 'Percentages',
    difficulty: 'medium',
    mode: 'practice',
    question_count: 3,
    answered_count: 2,
    correct_count: 1,
    status: 'completed',
    started_at: '2026-01-10T10:00:00.000Z',
    completed_at: '2026-01-10T10:20:00.000Z',
    ...overrides,
  }
}

function practiceAnswer(overrides: Partial<PracticeAnswerAnalyticsRow> = {}): PracticeAnswerAnalyticsRow {
  return {
    session_id: 'ps-1',
    question_id: 'q-1',
    is_correct: true,
    answered_at: '2026-01-10T10:05:00.000Z',
    ...overrides,
  }
}

function practiceQuestion(overrides: Partial<PracticeQuestionAnalyticsRow> = {}): PracticeQuestionAnalyticsRow {
  return {
    id: 'q-1',
    kind: 'aptitude',
    category: 'Quantitative Aptitude',
    topic: 'Percentages',
    difficulty: 'medium',
    ...overrides,
  }
}

function submission(overrides: Partial<ProblemSubmissionAnalyticsRow> = {}): ProblemSubmissionAnalyticsRow {
  return {
    id: 'sub-1',
    question_id: 'problem-1',
    session_id: 'session-1',
    language: 'python',
    verdict: 'accepted',
    created_at: '2026-01-11T10:00:00.000Z',
    ...overrides,
  }
}

function problemQuestion(overrides: Partial<ProblemQuestionAnalyticsRow> = {}): ProblemQuestionAnalyticsRow {
  return {
    id: 'problem-1',
    title: 'Two Sum',
    topic: 'Arrays',
    difficulty: 'easy',
    ...overrides,
  }
}

function codingAttempt(overrides: Partial<CodingAttemptAnalyticsRow> = {}): CodingAttemptAnalyticsRow {
  return {
    id: 'coding-1',
    session_id: 'session-1',
    question_index: 0,
    language: 'cpp',
    status: 'success',
    exit_code: 0,
    time_seconds: '1.5',
    created_at: '2026-01-12T10:00:00.000Z',
    ...overrides,
  }
}

function roadmapRow(overrides: Partial<RoadmapProgressAnalyticsRow> = {}): RoadmapProgressAnalyticsRow {
  return {
    domain_id: 'it',
    topic_id: 'arrays',
    completed_at: '2026-01-13T10:00:00.000Z',
    ...overrides,
  }
}

function practiceInput(overrides: Partial<PracticeAnalyticsInput> = {}): PracticeAnalyticsInput {
  return {
    available: true,
    answersAvailable: true,
    sessions: [practiceSession()],
    answers: [practiceAnswer()],
    questions: [practiceQuestion()],
    range: 'all',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Percentages and ranges
// ---------------------------------------------------------------------------

test('percentOf never divides by zero and rounds to one decimal', () => {
  assert.equal(percentOf(0, 0), null)
  assert.equal(percentOf(3, 0), null)
  assert.equal(percentOf(1, 3), 33.3)
  assert.equal(percentOf(2, 3), 66.7)
  assert.equal(percentOf(3, 3), 100)
})

test('trend granularity is daily for one week and monthly otherwise', () => {
  assert.equal(trendGranularity('1w'), 'day')
  assert.equal(trendGranularity('1m'), 'month')
  assert.equal(trendGranularity('3m'), 'month')
  assert.equal(trendGranularity('all'), 'month')
})

test('bucketRows only creates buckets that contain real rows', () => {
  const weekly = bucketRows(
    [
      { at: '2026-01-10T10:00:00.000Z' },
      { at: '2026-01-10T18:00:00.000Z' },
      { at: '2026-01-12T09:00:00.000Z' },
    ],
    '1w',
    (row) => row.at,
  )
  assert.equal(weekly.length, 2)
  assert.equal(weekly[0].periodStart, '2026-01-10')
  assert.equal(weekly[0].rows.length, 2)
  assert.equal(weekly[1].periodStart, '2026-01-12')

  const monthly = bucketRows([{ at: '2026-02-15T00:00:00.000Z' }], '3m', (row) => row.at)
  assert.equal(monthly[0].periodStart, '2026-02-01')
  assert.equal(monthly[0].label, 'Feb 2026')
})

// ---------------------------------------------------------------------------
// Practice Hub
// ---------------------------------------------------------------------------

test('practice accuracy counts only recorded answers and ignores unfinished sessions as completed', () => {
  const result = buildPracticeAnalytics(
    practiceInput({
      sessions: [
        practiceSession({ id: 'ps-1', status: 'completed' }),
        practiceSession({ id: 'ps-2', status: 'active', started_at: '2026-01-11T10:00:00.000Z' }),
        practiceSession({ id: 'ps-3', status: 'abandoned', started_at: '2026-01-12T10:00:00.000Z' }),
      ],
      answers: [
        practiceAnswer({ session_id: 'ps-1', question_id: 'q-1', is_correct: true }),
        practiceAnswer({ session_id: 'ps-1', question_id: 'q-2', is_correct: false }),
        practiceAnswer({ session_id: 'ps-2', question_id: 'q-3', is_correct: true }),
      ],
      questions: [
        practiceQuestion({ id: 'q-1' }),
        practiceQuestion({ id: 'q-2', topic: 'Profit and Loss' }),
        practiceQuestion({ id: 'q-3' }),
      ],
    }),
  )
  assert.ok(result)
  assert.equal(result.sessionsAttempted, 3)
  assert.equal(result.sessionsCompleted, 1)
  assert.equal(result.sessionsInProgress, 1)
  assert.equal(result.sessionsAbandoned, 1)
  assert.equal(result.questionsAnswered, 3)
  assert.equal(result.correctAnswers, 2)
  assert.equal(result.incorrectAnswers, 1)
  assert.equal(result.accuracy, 66.7)
})

test('practice deduplicates repeated answers for the same question', () => {
  const result = buildPracticeAnalytics(
    practiceInput({
      answers: [
        practiceAnswer({ question_id: 'q-1', is_correct: true }),
        practiceAnswer({ question_id: 'q-1', is_correct: false }),
      ],
    }),
  )
  assert.ok(result)
  assert.equal(result.questionsAnswered, 1)
  assert.equal(result.correctAnswers, 1)
  assert.equal(result.accuracy, 100)
})

test('practice answers outside the loaded sessions never affect accuracy', () => {
  const result = buildPracticeAnalytics(
    practiceInput({
      answers: [
        practiceAnswer({ session_id: 'ps-1', question_id: 'q-1', is_correct: true }),
        practiceAnswer({ session_id: 'other-session', question_id: 'q-2', is_correct: false }),
      ],
    }),
  )
  assert.ok(result)
  assert.equal(result.questionsAnswered, 1)
  assert.equal(result.accuracy, 100)
})

test('practice breakdowns split category, difficulty, mode and kind', () => {
  const result = buildPracticeAnalytics(
    practiceInput({
      sessions: [
        practiceSession({ id: 'ps-1', mode: 'timed', kind: 'aptitude' }),
        practiceSession({
          id: 'ps-2',
          mode: 'practice',
          kind: 'branch_mcq',
          category: 'DBMS',
          topic: 'Normalization',
          difficulty: 'hard',
          started_at: '2026-01-12T10:00:00.000Z',
        }),
      ],
      answers: [
        practiceAnswer({ session_id: 'ps-1', question_id: 'q-1', is_correct: true }),
        practiceAnswer({ session_id: 'ps-2', question_id: 'q-2', is_correct: false }),
      ],
      questions: [
        practiceQuestion({ id: 'q-1', kind: 'aptitude', category: 'Quantitative Aptitude', difficulty: 'easy' }),
        practiceQuestion({ id: 'q-2', kind: 'branch_mcq', category: 'DBMS', topic: 'Normalization', difficulty: 'hard' }),
      ],
    }),
  )
  assert.ok(result)
  assert.equal(result.byMode.find((group) => group.key === 'timed')?.accuracy, 100)
  assert.equal(result.byMode.find((group) => group.key === 'practice')?.accuracy, 0)
  assert.equal(result.byKind.find((group) => group.key === 'branch_mcq')?.answered, 1)
  assert.equal(result.byCategory.find((group) => group.key === 'DBMS')?.accuracy, 0)
  assert.equal(result.byDifficulty.length, 2)
})

test('practice returns an honest empty module state', () => {
  const result = buildPracticeAnalytics(practiceInput({ sessions: [], answers: [], questions: [] }))
  assert.ok(result)
  assert.equal(result.sessionsAttempted, 0)
  assert.equal(result.accuracy, null)
  assert.deepEqual(result.trend, [])
  assert.deepEqual(result.byCategory, [])
})

test('practice reports session counts but no accuracy when answers are unavailable', () => {
  const result = buildPracticeAnalytics(practiceInput({ answersAvailable: false, answers: [] }))
  assert.ok(result)
  assert.equal(result.sessionsCompleted, 1)
  assert.equal(result.questionsAnswered, 0)
  assert.equal(result.accuracy, null)
})

test('practice module is null when the table is unavailable', () => {
  assert.equal(buildPracticeAnalytics(practiceInput({ available: false })), null)
})

// ---------------------------------------------------------------------------
// DSA
// ---------------------------------------------------------------------------

test('unique solved problems are counted once across repeated accepted submissions', () => {
  const result = buildDsaAnalytics({
    available: true,
    range: 'all',
    submissions: [
      submission({ id: 'sub-1', question_id: 'problem-1', verdict: 'wrong_answer' }),
      submission({ id: 'sub-2', question_id: 'problem-1', verdict: 'accepted' }),
      submission({ id: 'sub-3', question_id: 'problem-1', verdict: 'accepted' }),
      submission({ id: 'sub-4', question_id: 'problem-2', verdict: 'accepted', language: 'javascript' }),
      submission({ id: 'sub-5', question_id: 'problem-3', verdict: 'runtime_error' }),
      submission({ id: 'sub-5', question_id: 'problem-3', verdict: 'runtime_error' }),
    ],
    questions: [
      problemQuestion({ id: 'problem-1', topic: 'Arrays' }),
      problemQuestion({ id: 'problem-2', topic: 'Strings', difficulty: 'medium' }),
      problemQuestion({ id: 'problem-3', topic: 'Arrays', difficulty: 'hard' }),
    ],
  })
  assert.ok(result)
  assert.equal(result.problemsAttempted, 3)
  assert.equal(result.problemsSolved, 2)
  assert.equal(result.solveRate, 66.7)
  assert.equal(result.submissions, 5)
  assert.equal(result.acceptedSubmissions, 3)
  assert.equal(result.failedSubmissions, 2)
  assert.equal(result.successRate, 60)
  assert.equal(result.byLanguage.find((group) => group.key === 'javascript')?.count, 1)
  const arrays = result.byTopic.find((group) => group.key === 'Arrays')
  assert.equal(arrays?.attempts, 4)
  // problem-3 only ever hit runtime_error, so Arrays has exactly one solved problem.
  assert.equal(arrays?.solved, 1)
  assert.equal(arrays?.accuracy, 50)
})

test('an accepted resubmission of an already solved problem does not inflate solved count', () => {
  const result = buildDsaAnalytics({
    available: true,
    range: 'all',
    submissions: [
      submission({ id: 'a', question_id: 'problem-1', verdict: 'accepted', created_at: '2026-01-01T00:00:00.000Z' }),
      submission({ id: 'b', question_id: 'problem-1', verdict: 'accepted', created_at: '2026-01-02T00:00:00.000Z' }),
    ],
    questions: [problemQuestion()],
  })
  assert.ok(result)
  assert.equal(result.problemsSolved, 1)
  assert.equal(result.acceptedSubmissions, 2)
  assert.equal(result.solveRate, 100)
})

test('DSA empty dataset is honest and unavailable data returns null', () => {
  const empty = buildDsaAnalytics({ available: true, range: 'all', submissions: [], questions: [] })
  assert.ok(empty)
  assert.equal(empty.problemsSolved, 0)
  assert.equal(empty.successRate, null)
  assert.equal(empty.solveRate, null)
  assert.deepEqual(empty.trend, [])

  assert.equal(buildDsaAnalytics({ available: false, range: 'all', submissions: [], questions: [] }), null)
})

// ---------------------------------------------------------------------------
// Interview coding
// ---------------------------------------------------------------------------

test('coding analytics reports execution success rate and average duration', () => {
  const result = buildCodingAnalytics({
    available: true,
    range: 'all',
    attempts: [
      codingAttempt({ id: 'a', status: 'success', time_seconds: '1.0' }),
      codingAttempt({ id: 'b', status: 'error', time_seconds: '3.0', language: 'python' }),
      codingAttempt({ id: 'c', status: 'success', time_seconds: null }),
    ],
  })
  assert.ok(result)
  assert.equal(result.attempts, 3)
  assert.equal(result.successes, 2)
  assert.equal(result.failures, 1)
  assert.equal(result.successRate, 66.7)
  assert.equal(result.averageSeconds, 2)
  assert.equal(result.byLanguage.length, 2)
})

test('coding analytics tolerates missing duration data', () => {
  const result = buildCodingAnalytics({
    available: true,
    range: 'all',
    attempts: [codingAttempt({ time_seconds: null })],
  })
  assert.ok(result)
  assert.equal(result.averageSeconds, null)
})

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

test('roadmap reports persisted completions and refuses to invent in-progress or pending counts', () => {
  const result = buildRoadmapAnalytics({
    available: true,
    progress: [
      roadmapRow({ domain_id: 'it', topic_id: 'arrays', completed_at: '2026-01-10T00:00:00.000Z' }),
      roadmapRow({ domain_id: 'it', topic_id: 'graphs', completed_at: '2026-01-12T00:00:00.000Z' }),
      roadmapRow({ domain_id: 'mechanical', topic_id: 'thermo', completed_at: '2025-12-01T00:00:00.000Z' }),
      roadmapRow({ domain_id: 'it', topic_id: 'arrays' }),
    ],
    plan: { tasks: 10, generatedAt: '2026-01-01T00:00:00.000Z' },
    since: '2026-01-05T00:00:00.000Z',
  })
  assert.ok(result)
  assert.equal(result.topicsCompleted, 3)
  assert.equal(result.topicsCompletedInRange, 2)
  assert.equal(result.topicsPlanned, 10)
  assert.equal(result.topicsInProgress, null)
  assert.equal(result.topicsPending, null)
  assert.equal(result.progressPercent, null)
  assert.equal(result.byDomain.find((domain) => domain.key === 'it')?.completed, 2)
  assert.equal(result.byDomain.find((domain) => domain.key === 'mechanical')?.label, 'Mechanical')
  assert.equal(result.recentlyCompleted[0].topicId, 'graphs')
})

test('roadmap without a saved plan keeps planned count null', () => {
  const result = buildRoadmapAnalytics({ available: true, progress: [], plan: null, since: null })
  assert.ok(result)
  assert.equal(result.topicsPlanned, null)
  assert.equal(result.topicsCompleted, 0)
})

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

test('placement analytics always lists the four canonical statuses and appends unknown ones', () => {
  const applications: AnalyticsApplicationRow[] = [
    { id: 'a1', status: 'Applied', applied_at: '2026-01-02T00:00:00.000Z' },
    { id: 'a2', status: 'Shortlisted', applied_at: '2026-01-03T00:00:00.000Z' },
    { id: 'a3', status: 'Shortlisted', applied_at: '2026-02-03T00:00:00.000Z' },
    { id: 'a4', status: 'Offer', applied_at: '2026-02-04T00:00:00.000Z' },
  ]
  const result = buildPlacementAnalytics({
    available: true,
    applications,
    range: 'all',
    stats: {
      total: 4,
      inRange: 4,
      byStatus: [
        { status: 'Applied', count: 1 },
        { status: 'Shortlisted', count: 2 },
        { status: 'Offer', count: 1 },
      ],
    },
  })
  assert.ok(result)
  assert.equal(result.total, 4)
  for (const status of APPLICATION_STATUS_ORDER) {
    assert.ok(result.byStatus.some((entry) => entry.status === status))
  }
  assert.equal(result.byStatus.find((entry) => entry.status === 'Rejected')?.count, 0)
  assert.equal(result.byStatus.find((entry) => entry.status === 'Offer')?.count, 1)
  assert.equal(result.trend.length, 2)
  assert.equal(result.trend[1].applications, 2)
})

test('placement analytics is null when the applications table is unavailable', () => {
  assert.equal(
    buildPlacementAnalytics({
      available: false,
      applications: [],
      range: 'all',
      stats: { total: 0, inRange: 0, byStatus: [] },
    }),
    null,
  )
})

// ---------------------------------------------------------------------------
// Readiness score
// ---------------------------------------------------------------------------

test('readiness requires at least two modules with real data', () => {
  const notEnough = buildReadinessScore({ interviewAverage: 80, practiceAccuracy: null, dsaSolveRate: null })
  assert.equal(notEnough.available, false)
  assert.equal(notEnough.score, null)
  assert.match(notEnough.reason ?? '', /Not enough data/)
  assert.equal(notEnough.components.filter((component) => component.included).length, 1)

  const enough = buildReadinessScore({ interviewAverage: 80, practiceAccuracy: 60, dsaSolveRate: null })
  assert.equal(enough.available, true)
  // (80*40 + 60*30) / 70 = 71.4
  assert.equal(enough.score, 71.4)
  assert.equal(enough.coverage, 70)
  assert.match(enough.reason ?? '', /excluded/)
  assert.equal(enough.components.length, 3)
  assert.equal(READINESS_MIN_COMPONENTS, 2)
})

test('readiness with all modules uses the documented weights', () => {
  const result = buildReadinessScore({ interviewAverage: 90, practiceAccuracy: 80, dsaSolveRate: 70 })
  assert.equal(result.score, 81)
  assert.equal(result.coverage, 100)
  assert.equal(result.reason, null)
  assert.match(result.formula, /40/)
})

test('readiness ignores non-finite values instead of scoring them', () => {
  const result = buildReadinessScore({ interviewAverage: Number.NaN, practiceAccuracy: 50, dsaSolveRate: 50 })
  assert.equal(result.components.find((component) => component.key === 'interview')?.included, false)
  assert.equal(result.available, true)
  assert.equal(result.score, 50)
  assert.equal(result.coverage, 60)
})

// ---------------------------------------------------------------------------
// Dashboard assembly
// ---------------------------------------------------------------------------

function emptyInterviews(scope: 'student' | 'college' = 'student') {
  return buildInterviewAnalytics({
    scope,
    range: 'all',
    generatedAt: '2026-01-20T00:00:00.000Z',
    sessionsAvailable: true,
    sessions: [],
    turnsAvailable: false,
    topicsAvailable: false,
    turns: [],
    evaluationsAvailable: false,
    evaluations: [],
    applicationsAvailable: true,
    applications: [],
  })
}

function dashboardInput(overrides: Partial<AnalyticsDashboardInput> = {}): AnalyticsDashboardInput {
  return {
    scope: 'student',
    range: 'all',
    generatedAt: '2026-01-20T00:00:00.000Z',
    since: null,
    interviews: emptyInterviews(),
    practice: null,
    dsa: null,
    coding: null,
    roadmap: null,
    applications: null,
    activity: {
      interviews: [],
      practice: null,
      dsa: null,
      coding: null,
      applications: [],
    },
    ...overrides,
  }
}

test('unavailable modules stay null instead of being reported as zero', () => {
  const dashboard = buildAnalyticsDashboard(dashboardInput())
  assert.equal(dashboard.overview.practiceTestsAttempted, null)
  assert.equal(dashboard.overview.dsaProblemsSolved, null)
  assert.equal(dashboard.overview.applicationsTotal, null)
  assert.equal(dashboard.availability.practice, false)
  assert.equal(dashboard.availability.resume, false)
  assert.equal(dashboard.overview.resumeAtsScore, null)
  assert.equal(dashboard.practice, null)
  assert.ok(dashboard.notes.some((note) => /Resume analysis is saved in this browser only/.test(note)))
})

test('college scope never emits per-record recent activity', () => {
  const dashboard = buildAnalyticsDashboard(
    dashboardInput({
      scope: 'college',
      interviews: emptyInterviews('college'),
      activity: {
        interviews: [],
        practice: null,
        dsa: null,
        coding: null,
        applications: [],
      },
    }),
  )
  assert.deepEqual(dashboard.recentActivity, [])
  assert.ok(dashboard.notes.some((note) => /student-private/.test(note)))
})

test('recent activity merges modules newest first and caps the list', () => {
  const items = buildRecentActivity({
    interviews: [
      {
        id: 's1',
        interviewType: 'technical',
        mode: 'technical',
        difficulty: 'medium',
        status: 'completed',
        startedAt: '2026-01-10T10:00:00.000Z',
        completedAt: null,
        answeredQuestions: 3,
        questionCount: 3,
        evaluatedAnswers: 3,
        averageScore: 80,
      },
    ],
    practice: null,
    dsa: null,
    coding: null,
    applications: [
      { id: 'a1', status: 'Applied', applied_at: '2026-01-15T10:00:00.000Z' },
      { id: 'a2', status: 'Shortlisted', applied_at: '2026-01-14T10:00:00.000Z' },
    ],
  })
  assert.equal(items[0].kind, 'application')
  assert.equal(items.length, 3)
})

test('analytics selects never include answer, code or transcript columns', () => {
  const forbidden = [
    'answer_text',
    'code',
    'stdin',
    'stdout',
    'stderr',
    'test_summary',
    'statement',
    'hidden_tests',
    'approach',
    'prompt',
    'options',
    'explanation',
    'feedback',
    'summary',
  ]
  const columns = [
    PRACTICE_SESSION_ANALYTICS_COLUMNS,
    PRACTICE_ANSWER_ANALYTICS_COLUMNS,
    PROBLEM_SUBMISSION_ANALYTICS_COLUMNS,
    CODING_ATTEMPT_ANALYTICS_COLUMNS,
    ROADMAP_PROGRESS_ANALYTICS_COLUMNS,
  ]
  for (const columnList of columns) {
    for (const name of forbidden) {
      assert.equal(
        columnList.split(',').map((entry) => entry.trim()).includes(name),
        false,
        `${name} must not be selected`,
      )
    }
  }
})

// ---------------------------------------------------------------------------
// Handler security
// ---------------------------------------------------------------------------

function response(): Response & { statusCode: number; payload: unknown; headers: Record<string, string> } {
  const res = {
    statusCode: 200,
    payload: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.payload = payload
      return this
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value
      return this
    },
  }
  return res as unknown as Response & {
    statusCode: number
    payload: unknown
    headers: Record<string, string>
  }
}

interface FakeTable {
  rows: Record<string, unknown>[]
  error?: { code?: string; message?: string }
}

function fakeClient(tables: Record<string, FakeTable>) {
  const queries: { table: string; filters: Array<[string, unknown]> }[] = []

  function build(table: string) {
    const entry = tables[table] ?? { rows: [] }
    const record = { table, filters: [] as Array<[string, unknown]> }
    queries.push(record)

    const apply = () => {
      if (entry.error) return entry.rows
      return entry.rows.filter((row) =>
        record.filters.every(([column, value]) => {
          if (column.startsWith('gte:')) {
            const field = column.slice(4)
            const rowTime = Date.parse(String(row[field] ?? ''))
            const bound = Date.parse(String(value))
            return Number.isFinite(rowTime) && Number.isFinite(bound) && rowTime >= bound
          }
          if (Array.isArray(value)) return value.includes(row[column])
          return row[column] === value
        }),
      )
    }

    const chain: Record<string, unknown> = {
      select() {
        return chain
      },
      eq(column: string, value: unknown) {
        record.filters.push([column, value])
        return chain
      },
      gte(column: string, value: unknown) {
        record.filters.push([`gte:${column}`, value])
        return chain
      },
      in(column: string, value: unknown[]) {
        record.filters.push([column, value])
        return chain
      },
      order() {
        return chain
      },
      range(from: number, to: number) {
        return Promise.resolve({ data: apply().slice(from, to + 1), error: entry.error ?? null })
      },
      maybeSingle() {
        return Promise.resolve({ data: apply()[0] ?? null, error: entry.error ?? null })
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: apply(), error: entry.error ?? null }).then(resolve)
      },
    }
    return chain
  }

  return {
    client: { from: build } as never,
    queries,
  }
}

function request(options: {
  role?: 'student' | 'placement-officer'
  authenticated?: boolean
  collegeId?: string | null
  query?: Record<string, string>
  client?: unknown
}): Request {
  return {
    auth:
      options.authenticated === false
        ? undefined
        : {
            userId: 'student-self',
            email: 'self@example.com',
            role: options.role ?? 'student',
            collegeId: 'collegeId' in options ? options.collegeId ?? null : 'college-1',
            accessToken: 'token',
          },
    supabase: options.client,
    query: { range: 'all', ...(options.query ?? {}) },
    params: {},
    body: {},
  } as unknown as Request
}

function baseTables(): Record<string, FakeTable> {
  return {
    interview_sessions: {
      rows: [
        {
          id: 'session-1',
          student_id: 'student-self',
          interview_type: 'technical',
          mode: 'technical',
          difficulty: 'medium',
          status: 'completed',
          started_at: '2026-01-10T10:00:00.000Z',
          completed_at: '2026-01-10T10:30:00.000Z',
          created_at: '2026-01-10T10:00:00.000Z',
        },
      ],
    },
    interview_turns: { rows: [] },
    interview_turn_evaluations: { rows: [] },
    job_applications: {
      rows: [{ id: 'app-1', status: 'Applied', applied_at: '2026-01-15T10:00:00.000Z' }],
    },
    practice_sessions: {
      rows: [{ ...practiceSession(), student_id: 'student-self' }],
    },
    practice_answers: {
      rows: [{ ...practiceAnswer(), student_id: 'student-self' }],
    },
    practice_questions: { rows: [{ ...practiceQuestion() }] },
    problem_submissions: {
      rows: [{ ...submission(), student_id: 'student-self' }],
    },
    problem_questions: { rows: [{ ...problemQuestion() }] },
    interview_coding_attempts: {
      rows: [{ ...codingAttempt(), student_id: 'student-self' }],
    },
    roadmap_topic_progress: {
      rows: [{ ...roadmapRow(), student_id: 'student-self' }],
    },
    roadmap_ai_plans: {
      rows: [{ plan: { tasks: [{ id: 'a' }, { id: 'b' }] }, generated_at: '2026-01-01T00:00:00.000Z' }],
    },
  }
}

test('dashboard rejects an unauthenticated caller', async () => {
  const res = response()
  await dashboardHandler(request({ authenticated: false }), res)
  assert.equal(res.statusCode, 401)
})

test('dashboard rejects an unsupported range', async () => {
  const res = response()
  await dashboardHandler(
    request({ query: { range: 'year' }, client: fakeClient(baseTables()).client }),
    res,
  )
  assert.equal(res.statusCode, 400)
})

test('a student dashboard is scoped to the caller and never cached', async () => {
  const { client, queries } = fakeClient(baseTables())
  const res = response()
  await dashboardHandler(request({ client }), res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0')

  // Every student-owned read is pinned to the verified user id.
  for (const table of ['practice_sessions', 'practice_answers', 'problem_submissions', 'interview_coding_attempts', 'roadmap_topic_progress']) {
    const query = queries.find((entry) => entry.table === table)
    assert.ok(query, `${table} should be queried`)
    assert.ok(
      query.filters.some(([column, value]) => column === 'student_id' && value === 'student-self'),
      `${table} must filter by the caller's own id`,
    )
  }

  const payload = res.payload as { overview: { practiceTestsCompleted: number | null; dsaProblemsSolved: number | null } }
  assert.equal(payload.overview.practiceTestsCompleted, 1)
  assert.equal(payload.overview.dsaProblemsSolved, 1)
})

test('a placement officer without a college is refused', async () => {
  const res = response()
  await dashboardHandler(
    request({ role: 'placement-officer', collegeId: null, client: fakeClient(baseTables()).client }),
    res,
  )
  assert.equal(res.statusCode, 403)
})

test('a placement officer gets college aggregates and no student-owned module reads', async () => {
  const { client, queries } = fakeClient(baseTables())
  const res = response()
  await dashboardHandler(request({ role: 'placement-officer', client }), res)

  assert.equal(res.statusCode, 200)
  const tables = queries.map((entry) => entry.table)
  for (const table of ['practice_sessions', 'practice_answers', 'problem_submissions', 'interview_coding_attempts', 'roadmap_topic_progress', 'interview_turns']) {
    assert.equal(tables.includes(table), false, `${table} must not be read for a college scope`)
  }
  const applications = queries.find((entry) => entry.table === 'job_applications')
  assert.ok(applications?.filters.some(([column, value]) => column === 'job.job.college_id' || (column === 'job.college_id' && value === 'college-1')))

  const payload = res.payload as {
    scope: string
    practice: unknown
    dsa: unknown
    recentActivity: unknown[]
    overview: { practiceTestsAttempted: number | null }
  }
  assert.equal(payload.scope, 'college')
  assert.equal(payload.practice, null)
  assert.equal(payload.dsa, null)
  assert.deepEqual(payload.recentActivity, [])
  assert.equal(payload.overview.practiceTestsAttempted, null)
})

test('missing optional tables degrade to unavailable modules instead of a failure', async () => {
  const tables = baseTables()
  tables.practice_sessions = { rows: [], error: { code: '42P01', message: 'relation does not exist' } }
  tables.problem_submissions = { rows: [], error: { code: '42P01', message: 'relation does not exist' } }
  tables.interview_coding_attempts = { rows: [], error: { code: '42P01', message: 'relation does not exist' } }
  tables.roadmap_topic_progress = { rows: [], error: { code: '42P01', message: 'relation does not exist' } }

  const res = response()
  await dashboardHandler(request({ client: fakeClient(tables).client }), res)

  assert.equal(res.statusCode, 200)
  const payload = res.payload as {
    practice: unknown
    dsa: unknown
    coding: unknown
    roadmap: unknown
    overview: { dsaProblemsSolved: number | null }
  }
  assert.equal(payload.practice, null)
  assert.equal(payload.dsa, null)
  assert.equal(payload.coding, null)
  assert.equal(payload.roadmap, null)
  assert.equal(payload.overview.dsaProblemsSolved, null)
})

test('chunkIds dedupes ids and keeps request batches bounded', () => {
  assert.deepEqual(chunkIds(['a', 'b', 'a'], 2), [['a', 'b']])
  assert.deepEqual(chunkIds(['a', 'b', 'c'], 2), [['a', 'b'], ['c']])
  assert.deepEqual(chunkIds([], 2), [])
})
