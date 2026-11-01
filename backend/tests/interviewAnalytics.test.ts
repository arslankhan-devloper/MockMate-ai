import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildApplicationStats,
  buildInterviewAnalytics,
  isMissingColumn,
  isMissingRelation,
  normalizeAnalyticsRange,
  rangeSince,
  type AnalyticsEvaluationRow,
  type AnalyticsSessionRow,
  type AnalyticsTurnRow,
  type InterviewAnalyticsInput,
} from '../src/services/interviewAnalytics.service.js'

function session(overrides: Partial<AnalyticsSessionRow> = {}): AnalyticsSessionRow {
  return {
    id: 'session-1',
    student_id: 'student-1',
    interview_type: 'technical',
    mode: 'technical',
    difficulty: 'medium',
    status: 'completed',
    started_at: '2026-01-10T10:00:00.000Z',
    completed_at: '2026-01-10T10:30:00.000Z',
    created_at: '2026-01-10T10:00:00.000Z',
    ...overrides,
  }
}

function turn(overrides: Partial<AnalyticsTurnRow> = {}): AnalyticsTurnRow {
  return {
    session_id: 'session-1',
    question_index: 0,
    answer_text: 'A real answer',
    question_topic: 'Data Structures',
    ...overrides,
  }
}

function evaluation(overrides: Partial<AnalyticsEvaluationRow> = {}): AnalyticsEvaluationRow {
  return {
    session_id: 'session-1',
    question_index: 0,
    status: 'evaluated',
    score: 80,
    ...overrides,
  }
}

function input(overrides: Partial<InterviewAnalyticsInput> = {}): InterviewAnalyticsInput {
  return {
    scope: 'student',
    range: 'all',
    generatedAt: '2026-01-20T10:00:00.000Z',
    sessionsAvailable: true,
    sessions: [],
    turnsAvailable: true,
    topicsAvailable: true,
    turns: [],
    evaluationsAvailable: true,
    evaluations: [],
    applicationsAvailable: true,
    applications: [],
    ...overrides,
  }
}

test('normalizes supported ranges and rejects unknown values', () => {
  assert.equal(normalizeAnalyticsRange(undefined), 'all')
  assert.equal(normalizeAnalyticsRange('1M'), '1m')
  assert.equal(normalizeAnalyticsRange('3m'), '3m')
  assert.equal(normalizeAnalyticsRange('year'), null)
  assert.equal(normalizeAnalyticsRange(7), null)
})

test('rangeSince uses the requested rolling window', () => {
  const now = new Date('2026-01-31T12:00:00.000Z')
  assert.equal(rangeSince('all', now), null)
  assert.equal(rangeSince('1w', now), '2026-01-24T12:00:00.000Z')
  assert.equal(rangeSince('1m', now), '2026-01-01T12:00:00.000Z')
  assert.equal(rangeSince('3m', now), '2025-11-02T12:00:00.000Z')
})

test('missing optional relations are distinguished from real failures', () => {
  assert.equal(isMissingRelation({ code: '42P01' }), true)
  assert.equal(isMissingRelation({ message: 'relation "interview_turns" does not exist' }), true)
  assert.equal(isMissingColumn({ code: '42703' }), true)
  assert.equal(isMissingColumn({ message: 'column question_topic does not exist' }), true)
  assert.equal(isMissingColumn({ code: '42501', message: 'permission denied' }), false)
})

test('reports unavailable analytics without fabricating totals', () => {
  const result = buildInterviewAnalytics(
    input({ sessionsAvailable: false, sessions: [], turns: [], evaluations: [] }),
  )
  assert.equal(result.availability.sessions, false)
  assert.equal(result.totals.sessions, 0)
  assert.equal(result.totals.averageScore, null)
  assert.deepEqual(result.byDomain, [])
  assert.deepEqual(result.byTopic, [])
  assert.ok(result.notes.some((note) => /sessions are not available/i.test(note)))
})

test('deduplicates evaluations and averages only completed, valid scores', () => {
  const result = buildInterviewAnalytics(
    input({
      sessions: [
        session({ id: 'session-1', status: 'completed' }),
        session({ id: 'session-1', status: 'completed' }),
        session({ id: 'session-2', status: 'in_progress', started_at: '2026-01-12T10:00:00.000Z' }),
      ],
      evaluations: [
        evaluation({ session_id: 'session-1', question_index: 0, score: 80 }),
        evaluation({ session_id: 'session-1', question_index: 0, score: 90 }),
        evaluation({ session_id: 'session-1', question_index: 1, status: 'failed', score: 10 }),
        evaluation({ session_id: 'session-1', question_index: 2, status: 'unanswered', score: 100 }),
        evaluation({ session_id: 'session-2', question_index: 0, score: '70' }),
      ],
    }),
  )

  assert.equal(result.totals.sessions, 2)
  assert.equal(result.totals.completed, 1)
  assert.equal(result.totals.inProgress, 1)
  assert.equal(result.totals.evaluatedAnswers, 1)
  assert.equal(result.totals.averageScore, 80)
  assert.equal(result.recentSessions.length, 2)
  assert.equal(result.recentSessions[0].id, 'session-2')
  assert.equal(result.recentSessions[0].averageScore, 70)
})

test('shows no average when only unfinished interviews have scores', () => {
  const result = buildInterviewAnalytics(
    input({
      sessions: [session({ id: 'session-1', status: 'in_progress' })],
      evaluations: [evaluation({ session_id: 'session-1', question_index: 0, score: 92 })],
    }),
  )

  assert.equal(result.totals.evaluatedAnswers, 0)
  assert.equal(result.totals.averageScore, null)
  assert.equal(result.recentSessions[0].averageScore, 92)
  assert.ok(result.notes.some((note) => /no completed interview answers/i.test(note)))
})

test('groups topic performance only from evaluated, tagged questions', () => {
  const result = buildInterviewAnalytics(
    input({
      sessions: [
        session({ id: 'session-1' }),
        session({ id: 'session-2', started_at: '2026-01-11T10:00:00.000Z' }),
      ],
      turns: [
        turn({ session_id: 'session-1', question_index: 0, question_topic: 'Data Structures' }),
        turn({ session_id: 'session-1', question_index: 1, question_topic: 'Data Structures' }),
        turn({ session_id: 'session-1', question_index: 2, question_topic: 'SQL' }),
        turn({ session_id: 'session-2', question_index: 0, question_topic: 'SQL' }),
        turn({ session_id: 'session-2', question_index: 1, question_topic: '' }),
      ],
      evaluations: [
        evaluation({ session_id: 'session-1', question_index: 0, score: 60 }),
        evaluation({ session_id: 'session-1', question_index: 1, score: 80 }),
        evaluation({ session_id: 'session-1', question_index: 2, score: 90 }),
        evaluation({ session_id: 'session-2', question_index: 0, score: 70 }),
        evaluation({ session_id: 'session-2', question_index: 1, score: 100 }),
      ],
    }),
  )

  assert.deepEqual(result.byTopic, [
    {
      key: 'Data Structures',
      label: 'Data Structures',
      sessions: 1,
      evaluatedAnswers: 2,
      averageScore: 70,
    },
    {
      key: 'SQL',
      label: 'SQL',
      sessions: 2,
      evaluatedAnswers: 2,
      averageScore: 80,
    },
  ])
})

test('topic metrics stay empty when the optional column is unavailable', () => {
  const result = buildInterviewAnalytics(
    input({
      topicsAvailable: false,
      sessions: [session()],
      turns: [turn()],
      evaluations: [evaluation()],
    }),
  )

  assert.equal(result.availability.topics, false)
  assert.deepEqual(result.byTopic, [])
  assert.ok(result.notes.some((note) => /topic performance is not available/i.test(note)))
})

test('application stats group persisted statuses without inventing rows', () => {
  const stats = buildApplicationStats([
    { id: 'app-1', status: 'Applied', applied_at: '2026-01-10T10:00:00.000Z' },
    { id: 'app-2', status: 'Applied', applied_at: '2026-01-11T10:00:00.000Z' },
    { id: 'app-3', status: 'Shortlisted', applied_at: '2026-01-12T10:00:00.000Z' },
  ])

  assert.equal(stats.total, 3)
  assert.equal(stats.inRange, 3)
  assert.deepEqual(stats.byStatus, [
    { status: 'Applied', count: 2 },
    { status: 'Shortlisted', count: 1 },
  ])
})

test('college scope never returns recent session rows', () => {
  const result = buildInterviewAnalytics(
    input({
      scope: 'college',
      sessions: [session(), session({ id: 'session-2', student_id: 'student-2' })],
    }),
  )

  assert.equal(result.scope, 'college')
  assert.deepEqual(result.recentSessions, [])
  assert.ok(result.notes.some((note) => /only aggregated totals/i.test(note)))
})
