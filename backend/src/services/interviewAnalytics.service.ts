import type { SupabaseClient } from '@supabase/supabase-js'
import {
  asEvaluationStatus,
  asSessionStatus,
  type SessionStatus,
} from './interviews.service.js'

// Interview analytics aggregation (Item 5).
//
// Aggregation runs on the server so the browser never receives another
// student's answers. Only pre-aggregated, non-identifying numbers are returned:
//   * students  — totals for their own sessions only.
//   * officers  — totals for the sessions in their own college (enforced by RLS).
//
// Averages are computed ONLY from answers that a real evaluation scored; an
// unanswered, too-short, failed or never-evaluated answer is excluded rather
// than counted as zero. Every optional source table is tolerated: in a
// pre-migration environment the turn/evaluation tables may not exist yet, so
// their metrics are reported as unavailable (null) instead of being invented.

// Only base-schema columns are selected here. `experience` / `config` /
// `client_session_id` arrive with the Item 1 migration and must not be assumed
// present by analytics.
export const ANALYTICS_SESSION_COLUMNS =
  'id, student_id, interview_type, mode, difficulty, status, started_at, completed_at, created_at'

export const ANALYTICS_TURN_COLUMNS = 'session_id, question_index, answer_text'
export const ANALYTICS_TURN_COLUMNS_WITH_TOPIC =
  `${ANALYTICS_TURN_COLUMNS}, question_topic`
export const ANALYTICS_EVALUATION_COLUMNS = 'session_id, question_index, status, score'

export const ANALYTICS_APPLICATION_COLUMNS = 'id, status, applied_at'

export type AnalyticsRangeKey = '1w' | '1m' | '3m' | 'all'

export const ANALYTICS_RANGE_KEYS: AnalyticsRangeKey[] = ['1w', '1m', '3m', 'all']

const RANGE_DAYS: Record<Exclude<AnalyticsRangeKey, 'all'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
}

export const RECENT_SESSION_LIMIT = 5
const MIN_TREND_EVALUATIONS = 4
const MIN_TREND_BUCKETS = 2
// Topic insights need more than one answer so a single lucky/unlucky score does
// not label a topic a strength or weakness.
const MIN_TOPIC_INSIGHT_EVALUATIONS = 2
const TOPIC_INSIGHT_SCORE = 70
const TOPIC_INSIGHT_LIMIT = 3

// PostgREST caps a single response at a fixed number of rows, so long result
// sets are paged. The cap bounds worst-case work for a very large college.
const PAGE_SIZE = 1000
const MAX_PAGES = 20

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export interface AnalyticsSessionRow {
  id: string
  student_id: string
  interview_type: string
  mode: string | null
  difficulty: string | null
  status: string
  started_at: string
  completed_at: string | null
  created_at: string
}

export interface AnalyticsTurnRow {
  session_id: string
  question_index: number
  answer_text: string | null
  question_topic?: string | null
}

export interface AnalyticsEvaluationRow {
  session_id: string
  question_index: number
  status: string
  score: number | string | null
}

export interface AnalyticsApplicationRow {
  id: string
  status: string
  applied_at: string
}

export interface AnalyticsApplicationStatusCount {
  status: string
  count: number
}

export interface AnalyticsApplicationStats {
  total: number
  /** Applications submitted inside the selected range. */
  inRange: number
  byStatus: AnalyticsApplicationStatusCount[]
}

export interface AnalyticsAvailability {
  sessions: boolean
  turns: boolean
  topics: boolean
  evaluations: boolean
  applications: boolean
}

export interface AnalyticsTotals {
  sessions: number
  completed: number
  inProgress: number
  abandoned: number
  /** Saved answers with text. Null when the turn table is unavailable. */
  answeredQuestions: number | null
  /** Saved answers that were left empty. Null when the turn table is unavailable. */
  unansweredQuestions: number | null
  /** Answers that produced a real, valid score. */
  evaluatedAnswers: number
  /** Mean of valid evaluated scores (one decimal), or null when there are none. */
  averageScore: number | null
}

export interface AnalyticsGroup {
  key: string
  label: string
  sessions: number
  evaluatedAnswers: number
  averageScore: number | null
}

export interface AnalyticsRecentSession {
  id: string
  interviewType: string
  mode: string | null
  difficulty: string | null
  status: SessionStatus
  startedAt: string
  completedAt: string | null
  answeredQuestions: number | null
  questionCount: number | null
  evaluatedAnswers: number
  averageScore: number | null
}

export interface AnalyticsTrendBucket {
  periodStart: string
  label: string
  evaluatedAnswers: number
  averageScore: number
}

export interface AnalyticsTrend {
  granularity: 'month'
  buckets: AnalyticsTrendBucket[]
}

export interface InterviewAnalyticsResponse {
  scope: 'student' | 'college'
  range: AnalyticsRangeKey
  generatedAt: string
  availability: AnalyticsAvailability
  totals: AnalyticsTotals
  byDomain: AnalyticsGroup[]
  byDifficulty: AnalyticsGroup[]
  /** Grouped by the stored question topic. Empty until topics are tagged. */
  byTopic: AnalyticsGroup[]
  /** Topics with the strongest average score (only topics with enough evidence). */
  strengths: AnalyticsGroup[]
  /** Topics with the weakest average score (only topics with enough evidence). */
  weaknesses: AnalyticsGroup[]
  /** Job application activity. Null when the applications table is unavailable. */
  applications: AnalyticsApplicationStats | null
  /** Only populated for the student's own scope; never other students' rows. */
  recentSessions: AnalyticsRecentSession[]
  /** Only present when the data genuinely supports a trend. */
  trend: AnalyticsTrend | null
  notes: string[]
}

export interface QueryError {
  code?: string
  message?: string
}

interface QueryResult {
  data: unknown
  error: QueryError | null
}

// A relation that does not exist yet (a migration is not applied) is not a hard
// failure for analytics — it just means a metric is unavailable.
export function isMissingRelation(error: QueryError | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')
}

// An optional column arrives with a later additive migration. Treat its absence
// as "topic metrics unavailable" rather than failing the whole analytics page.
export function isMissingColumn(error: QueryError | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

export function normalizeAnalyticsRange(value: unknown): AnalyticsRangeKey | null {
  if (value === undefined || value === null || value === '') return 'all'
  if (typeof value !== 'string') return null
  const lowered = value.toLowerCase()
  return (ANALYTICS_RANGE_KEYS as string[]).includes(lowered)
    ? (lowered as AnalyticsRangeKey)
    : null
}

export function rangeSince(key: AnalyticsRangeKey, now = new Date()): string | null {
  if (key === 'all') return null
  const days = RANGE_DAYS[key]
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

async function paginate(
  build: (from: number, to: number) => PromiseLike<QueryResult>,
): Promise<{ rows: unknown[]; error: QueryError | null }> {
  const rows: unknown[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await build(from, to)
    if (error) return { rows, error }
    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return { rows, error: null }
  }
  return { rows, error: null }
}

export interface FetchSessionsOptions {
  /** When set, restricts to one student (defence in depth; RLS applies too). */
  studentId: string | null
  /** ISO timestamp lower bound on `started_at`, or null for no bound. */
  since: string | null
}

export async function fetchAnalyticsSessions(
  client: SupabaseClient,
  options: FetchSessionsOptions,
): Promise<{ rows: unknown[]; error: QueryError | null }> {
  return paginate((from, to) => {
    let query = client
      .from('interview_sessions')
      .select(ANALYTICS_SESSION_COLUMNS)
      .order('started_at', { ascending: false })
    if (options.studentId) query = query.eq('student_id', options.studentId)
    if (options.since) query = query.gte('started_at', options.since)
    return query.range(from, to)
  })
}

// Turns and evaluations are read through the caller's own RLS-scoped client, so
// a student only ever loads their own rows and an officer only their college's.
// The controller decides whether to request turns at all.
export async function fetchAnalyticsTurns(
  client: SupabaseClient,
): Promise<{ rows: unknown[]; error: QueryError | null; topicsAvailable: boolean }> {
  const withTopic = await paginate((from, to) =>
    client.from('interview_turns').select(ANALYTICS_TURN_COLUMNS_WITH_TOPIC).range(from, to),
  )
  if (!withTopic.error) return { ...withTopic, topicsAvailable: true }
  if (!isMissingColumn(withTopic.error)) return { ...withTopic, topicsAvailable: false }

  const base = await paginate((from, to) =>
    client.from('interview_turns').select(ANALYTICS_TURN_COLUMNS).range(from, to),
  )
  return { ...base, topicsAvailable: false }
}

export async function fetchAnalyticsEvaluations(
  client: SupabaseClient,
): Promise<{ rows: unknown[]; error: QueryError | null }> {
  return paginate((from, to) =>
    client.from('interview_turn_evaluations').select(ANALYTICS_EVALUATION_COLUMNS).range(from, to),
  )
}

export interface FetchApplicationsOptions {
  /** When set, restricts to one student's own applications. */
  studentId: string | null
  /** When set, restricts to applications for jobs in that college. */
  collegeId: string | null
  /** ISO timestamp lower bound on `applied_at`, or null for no bound. */
  since: string | null
}

// Applications are read with the caller's RLS-scoped client. A student sees only
// their own rows; an officer sees only their college's jobs (RLS plus the
// explicit embedded filter below). Only status/applied_at are selected, so no
// applicant-identifying text reaches analytics.
export async function fetchAnalyticsApplications(
  client: SupabaseClient,
  options: FetchApplicationsOptions,
): Promise<{ rows: unknown[]; error: QueryError | null }> {
  if (!options.studentId && !options.collegeId) return { rows: [], error: null }
  return paginate((from, to) => {
    let query = client
      .from('job_applications')
      .select(
        options.collegeId
          ? `${ANALYTICS_APPLICATION_COLUMNS}, job:campus_jobs!inner(college_id)`
          : ANALYTICS_APPLICATION_COLUMNS,
      )
      .order('applied_at', { ascending: false })
    if (options.studentId) query = query.eq('student_id', options.studentId)
    if (options.collegeId) query = query.eq('job.college_id', options.collegeId)
    if (options.since) query = query.gte('applied_at', options.since)
    return query.range(from, to)
  })
}

export function buildApplicationStats(
  rows: AnalyticsApplicationRow[],
): AnalyticsApplicationStats {
  const byStatus = new Map<string, number>()
  let total = 0
  for (const row of rows) {
    total += 1
    const status = typeof row.status === 'string' && row.status.trim() ? row.status : 'Applied'
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1)
  }
  return {
    total,
    inRange: total,
    byStatus: [...byStatus.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function averageOf(scores: number[]): number | null {
  if (scores.length === 0) return null
  let sum = 0
  for (const score of scores) sum += score
  return round1(sum / scores.length)
}

function asScore(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function humanize(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'Unspecified'
  const upper = trimmed.toUpperCase()
  if (upper === 'HR' || upper === 'DSA') return upper
  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function monthLabel(periodStart: string): string {
  const [year, month] = periodStart.split('-')
  const index = Number(month) - 1
  return `${MONTHS[index] ?? month} ${year}`
}

export interface InterviewAnalyticsInput {
  scope: 'student' | 'college'
  range: AnalyticsRangeKey
  generatedAt: string
  sessionsAvailable: boolean
  sessions: AnalyticsSessionRow[]
  turnsAvailable: boolean
  topicsAvailable: boolean
  turns: AnalyticsTurnRow[]
  evaluationsAvailable: boolean
  evaluations: AnalyticsEvaluationRow[]
  applicationsAvailable: boolean
  applications: AnalyticsApplicationRow[]
}

function emptyTotals(): AnalyticsTotals {
  return {
    sessions: 0,
    completed: 0,
    inProgress: 0,
    abandoned: 0,
    answeredQuestions: null,
    unansweredQuestions: null,
    evaluatedAnswers: 0,
    averageScore: null,
  }
}

// Pure aggregation over already-fetched, already-authorised rows. No provider
// call and no fabrication: every number traces back to a stored row.
export function buildInterviewAnalytics(
  input: InterviewAnalyticsInput,
): InterviewAnalyticsResponse {
  const availability: AnalyticsAvailability = {
    sessions: input.sessionsAvailable,
    turns: input.turnsAvailable,
    topics: input.turnsAvailable && input.topicsAvailable,
    evaluations: input.evaluationsAvailable,
    applications: input.applicationsAvailable,
  }

  const notes: string[] = []

  if (!input.sessionsAvailable) {
    notes.push('Interview sessions are not available yet. Apply the persistence migration to record activity.')
    if (input.scope === 'college') {
      notes.push('College-wide view: only aggregated totals are shown; session history and transcripts are never displayed.')
    }
    return {
      scope: input.scope,
      range: input.range,
      generatedAt: input.generatedAt,
      availability,
      totals: emptyTotals(),
      byDomain: [],
      byDifficulty: [],
      byTopic: [],
      strengths: [],
      weaknesses: [],
      applications: input.applicationsAvailable
        ? buildApplicationStats(input.applications)
        : null,
      recentSessions: [],
      trend: null,
      notes,
    }
  }

  // Dedupe sessions defensively, then keep evaluations/turns that belong to a
  // visible session so the range filter also bounds the answer metrics.
  const seenSessions = new Set<string>()
  const sessions: AnalyticsSessionRow[] = []
  for (const session of input.sessions) {
    if (seenSessions.has(session.id)) continue
    seenSessions.add(session.id)
    sessions.push(session)
  }
  // Newest first, so "recent sessions" is deterministic even if the caller did
  // not order the rows.
  sessions.sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0))

  const completedSessionIds = new Set(
    sessions
      .filter((session) => asSessionStatus(session.status) === 'completed')
      .map((session) => session.id),
  )

  const evaluatedKeys = new Set<string>()
  const evaluatedBySession = new Map<string, number[]>()
  const completedEvaluatedBySession = new Map<string, number[]>()
  const completedScoreByQuestion = new Map<string, number>()
  let completedEvaluatedAnswers = 0

  if (input.evaluationsAvailable) {
    for (const row of input.evaluations) {
      if (!seenSessions.has(row.session_id)) continue
      const key = `${row.session_id}:${row.question_index}`
      if (evaluatedKeys.has(key)) continue
      evaluatedKeys.add(key)
      if (asEvaluationStatus(row.status) !== 'evaluated') continue
      const score = asScore(row.score)
      if (score === null) continue
      const scores = evaluatedBySession.get(row.session_id) ?? []
      scores.push(score)
      evaluatedBySession.set(row.session_id, scores)

      if (completedSessionIds.has(row.session_id)) {
        completedEvaluatedAnswers += 1
        completedScoreByQuestion.set(key, score)
        const completedScores = completedEvaluatedBySession.get(row.session_id) ?? []
        completedScores.push(score)
        completedEvaluatedBySession.set(row.session_id, completedScores)
      }
    }
  }

  // The headline average only uses scored answers from completed interviews; a
  // partially finished session must not move it.
  const allCompletedScores: number[] = []
  for (const scores of completedEvaluatedBySession.values()) allCompletedScores.push(...scores)

  const totals: AnalyticsTotals = emptyTotals()
  totals.sessions = sessions.length
  totals.evaluatedAnswers = completedEvaluatedAnswers
  totals.averageScore = averageOf(allCompletedScores)

  for (const session of sessions) {
    const status = asSessionStatus(session.status)
    if (status === 'completed') totals.completed += 1
    else if (status === 'abandoned') totals.abandoned += 1
    else totals.inProgress += 1
  }

  const turnStats = new Map<string, { answered: number; total: number }>()
  const topicGroups = new Map<string, { sessionIds: Set<string>; scores: number[] }>()
  if (input.turnsAvailable) {
    let answered = 0
    let unanswered = 0
    const seenTurns = new Set<string>()
    for (const turn of input.turns) {
      if (!seenSessions.has(turn.session_id)) continue
      const key = `${turn.session_id}:${turn.question_index}`
      if (seenTurns.has(key)) continue
      seenTurns.add(key)
      const hasText = typeof turn.answer_text === 'string' && turn.answer_text.trim().length > 0
      if (hasText) answered += 1
      else unanswered += 1
      const stat = turnStats.get(turn.session_id) ?? { answered: 0, total: 0 }
      stat.total += 1
      if (hasText) stat.answered += 1
      turnStats.set(turn.session_id, stat)

      const topic = typeof turn.question_topic === 'string' ? turn.question_topic.trim() : ''
      const score = completedScoreByQuestion.get(key)
      if (input.topicsAvailable && topic && score !== undefined) {
        const group = topicGroups.get(topic) ?? { sessionIds: new Set<string>(), scores: [] }
        group.sessionIds.add(turn.session_id)
        group.scores.push(score)
        topicGroups.set(topic, group)
      }
    }
    totals.answeredQuestions = answered
    totals.unansweredQuestions = unanswered
  }

  const domainGroups = new Map<string, { sessions: number; scores: number[] }>()
  const difficultyGroups = new Map<string, { sessions: number; scores: number[] }>()
  const bump = (
    map: Map<string, { sessions: number; scores: number[] }>,
    key: string,
    scores: number[],
  ) => {
    const entry = map.get(key) ?? { sessions: 0, scores: [] }
    entry.sessions += 1
    entry.scores.push(...scores)
    map.set(key, entry)
  }
  for (const session of sessions) {
    const scores = completedEvaluatedBySession.get(session.id) ?? []
    bump(domainGroups, session.interview_type || 'unspecified', scores)
    bump(
      difficultyGroups,
      session.difficulty && session.difficulty.trim() ? session.difficulty : 'unspecified',
      scores,
    )
  }

  const toGroups = (map: Map<string, { sessions: number; scores: number[] }>): AnalyticsGroup[] =>
    [...map.entries()]
      .map(([key, value]) => ({
        key,
        label: key === 'unspecified' ? 'Not specified' : humanize(key),
        sessions: value.sessions,
        evaluatedAnswers: value.scores.length,
        averageScore: averageOf(value.scores),
      }))
      .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label))

  const byDomain = toGroups(domainGroups)
  const byDifficulty = toGroups(difficultyGroups)
  const byTopic: AnalyticsGroup[] = [...topicGroups.entries()]
    .map(([key, value]) => ({
      key,
      label: humanize(key),
      sessions: value.sessionIds.size,
      evaluatedAnswers: value.scores.length,
      averageScore: averageOf(value.scores),
    }))
    .sort(
      (a, b) =>
        b.evaluatedAnswers - a.evaluatedAnswers || a.label.localeCompare(b.label),
    )

  const insightTopics = byTopic.filter(
    (group) =>
      group.evaluatedAnswers >= MIN_TOPIC_INSIGHT_EVALUATIONS &&
      group.averageScore !== null,
  )
  const strengths = insightTopics
    .filter((group) => (group.averageScore ?? 0) >= TOPIC_INSIGHT_SCORE)
    .sort(
      (a, b) =>
        (b.averageScore ?? 0) - (a.averageScore ?? 0) ||
        b.evaluatedAnswers - a.evaluatedAnswers,
    )
    .slice(0, TOPIC_INSIGHT_LIMIT)
  const weaknesses = insightTopics
    .filter((group) => (group.averageScore ?? 0) < TOPIC_INSIGHT_SCORE)
    .sort(
      (a, b) =>
        (a.averageScore ?? 0) - (b.averageScore ?? 0) ||
        b.evaluatedAnswers - a.evaluatedAnswers,
    )
    .slice(0, TOPIC_INSIGHT_LIMIT)

  const recentSessions: AnalyticsRecentSession[] =
    input.scope === 'student'
      ? sessions.slice(0, RECENT_SESSION_LIMIT).map((session) => {
          const stat = turnStats.get(session.id)
          const scores = evaluatedBySession.get(session.id) ?? []
          return {
            id: session.id,
            interviewType: session.interview_type,
            mode: session.mode ?? null,
            difficulty: session.difficulty ?? null,
            status: asSessionStatus(session.status),
            startedAt: session.started_at,
            completedAt: session.completed_at ?? null,
            answeredQuestions: input.turnsAvailable ? stat?.answered ?? 0 : null,
            questionCount: input.turnsAvailable ? stat?.total ?? 0 : null,
            evaluatedAnswers: scores.length,
            averageScore: averageOf(scores),
          }
        })
      : []

  let trend: AnalyticsTrend | null = null
  if (completedEvaluatedAnswers >= MIN_TREND_EVALUATIONS) {
    const startedAtBySession = new Map(sessions.map((s) => [s.id, s.started_at]))
    const buckets = new Map<string, number[]>()
    for (const [sessionId, scores] of completedEvaluatedBySession) {
      const startedAt = startedAtBySession.get(sessionId)
      if (!startedAt) continue
      const when = new Date(startedAt)
      if (Number.isNaN(when.getTime())) continue
      const periodStart = `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}-01`
      const bucket = buckets.get(periodStart) ?? []
      bucket.push(...scores)
      buckets.set(periodStart, bucket)
    }
    if (buckets.size >= MIN_TREND_BUCKETS) {
      trend = {
        granularity: 'month',
        buckets: [...buckets.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([periodStart, scores]) => ({
            periodStart,
            label: monthLabel(periodStart),
            evaluatedAnswers: scores.length,
            averageScore: averageOf(scores) ?? 0,
          })),
      }
    }
  }

  if (!input.evaluationsAvailable) {
    notes.push('Answer evaluations are not available yet; score metrics will appear once evaluations are enabled.')
  } else if (completedEvaluatedAnswers === 0) {
    notes.push(
      'No completed interview answers have been evaluated yet, so no average score is shown.',
    )
  }
  if (input.scope === 'student' && !input.turnsAvailable) {
    notes.push('Question-level counts are not available yet.')
  }
  if (input.turnsAvailable && !input.topicsAvailable) {
    notes.push('Question-topic performance is not available yet; apply the adaptive-question migration to record topics.')
  } else if (input.topicsAvailable && insightTopics.length === 0) {
    notes.push('Topic strengths and weaknesses appear after at least two evaluated answers per topic.')
  }
  if (!input.applicationsAvailable) {
    notes.push('Job application activity is not available yet.')
  }
  if (input.scope === 'college') {
    notes.push('College-wide view: only aggregated totals are shown; session history and transcripts are never displayed.')
  }

  return {
    scope: input.scope,
    range: input.range,
    generatedAt: input.generatedAt,
    availability,
    totals,
    byDomain,
    byDifficulty,
    byTopic,
    strengths,
    weaknesses,
    applications: input.applicationsAvailable
      ? buildApplicationStats(input.applications)
      : null,
    recentSessions,
    trend,
    notes,
  }
}
