import type { SupabaseClient } from '@supabase/supabase-js'
import { ROADMAP_DOMAIN_LABELS } from '../utils/roadmapPlanValidation.js'
import {
  isMissingColumn,
  isMissingRelation,
  type AnalyticsApplicationRow,
  type AnalyticsApplicationStats,
  type AnalyticsRangeKey,
  type InterviewAnalyticsResponse,
  type QueryError,
} from './interviewAnalytics.service.js'

// Unified analytics dashboard aggregation.
//
// Every number in this module traces back to a stored row. Nothing is seeded,
// invented or back-filled:
//   * practice  — `practice_sessions` + `practice_answers` (+ question metadata)
//   * DSA       — `problem_submissions` + `problem_questions`
//   * coding    — `interview_coding_attempts` (execution results only)
//   * roadmap   — `roadmap_topic_progress` + `roadmap_ai_plans` (task count)
//   * placement — `job_applications` (status + applied_at only)
//
// Sensitive columns are never selected here: no answer text, no transcripts, no
// source code, no stdin/stdout/stderr, no hidden tests and no per-answer
// feedback. Practice/DSA/roadmap rows are student-owned and their RLS policies
// are student-only, so the dashboard never queries them for a college scope.
//
// Optional tables degrade to "unavailable" (null) instead of failing the whole
// dashboard. A module that is unavailable is excluded from overview totals and
// from the readiness score rather than being counted as zero.

const PAGE_SIZE = 1000
const MAX_PAGES = 20
const ID_CHUNK = 100
const RECENT_LIMIT = 5
const ACTIVITY_LIMIT = 8
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// Aggregate-safe column lists. Keep this the single source of truth: adding a
// text/code column here would leak student work into the analytics payload.
export const PRACTICE_SESSION_ANALYTICS_COLUMNS =
  'id, kind, category, topic, difficulty, mode, question_count, answered_count, ' +
  'correct_count, status, started_at, completed_at'
export const PRACTICE_ANSWER_ANALYTICS_COLUMNS = 'session_id, question_id, is_correct, answered_at'
export const PRACTICE_QUESTION_ANALYTICS_COLUMNS = 'id, kind, category, topic, difficulty'
export const PROBLEM_SUBMISSION_ANALYTICS_COLUMNS =
  'id, question_id, session_id, language, verdict, created_at'
export const PROBLEM_QUESTION_ANALYTICS_COLUMNS = 'id, title, topic, difficulty'
export const CODING_ATTEMPT_ANALYTICS_COLUMNS =
  'id, session_id, question_index, language, status, exit_code, time_seconds, created_at'
export const ROADMAP_PROGRESS_ANALYTICS_COLUMNS = 'domain_id, topic_id, completed_at'
export const ROADMAP_PLAN_ANALYTICS_SELECTOR = 'plan, generated_at'

export type TrendGranularity = 'day' | 'month'

export function trendGranularity(range: AnalyticsRangeKey): TrendGranularity {
  return range === '1w' ? 'day' : 'month'
}

// ---------------------------------------------------------------------------
// Row shapes (database columns, snake_case)
// ---------------------------------------------------------------------------

export interface PracticeSessionAnalyticsRow {
  id: string
  kind: string
  category: string | null
  topic: string | null
  difficulty: string
  mode: string
  question_count: number
  answered_count: number
  correct_count: number
  status: string
  started_at: string
  completed_at: string | null
}

export interface PracticeAnswerAnalyticsRow {
  session_id: string
  question_id: string
  is_correct: boolean
  answered_at: string
}

export interface PracticeQuestionAnalyticsRow {
  id: string
  kind: string
  category: string
  topic: string
  difficulty: string
}

export interface ProblemSubmissionAnalyticsRow {
  id: string
  question_id: string
  session_id: string
  language: string
  verdict: string
  created_at: string
}

export interface ProblemQuestionAnalyticsRow {
  id: string
  title: string
  topic: string
  difficulty: string
}

export interface CodingAttemptAnalyticsRow {
  id: string
  session_id: string
  question_index: number
  language: string
  status: string
  exit_code: number | null
  time_seconds: number | string | null
  created_at: string
}

export interface RoadmapProgressAnalyticsRow {
  domain_id: string
  topic_id: string
  completed_at: string
}

// ---------------------------------------------------------------------------
// Response shapes (camelCase, what the browser receives)
// ---------------------------------------------------------------------------

export interface AnalyticsScoreGroup {
  key: string
  label: string
  answered: number
  correct: number
  accuracy: number | null
}

export interface PracticeTrendBucket {
  periodStart: string
  label: string
  sessions: number
  answered: number
  correct: number
  accuracy: number | null
}

export interface PracticeRecentSession {
  id: string
  kind: string
  category: string | null
  topic: string | null
  difficulty: string
  mode: string
  status: 'completed' | 'active' | 'abandoned'
  startedAt: string
  completedAt: string | null
  questionCount: number
  answered: number
  correct: number
  accuracy: number | null
}

export interface PracticeAnalytics {
  sessionsAttempted: number
  sessionsCompleted: number
  sessionsInProgress: number
  sessionsAbandoned: number
  questionsAnswered: number
  correctAnswers: number
  incorrectAnswers: number
  accuracy: number | null
  byCategory: AnalyticsScoreGroup[]
  byTopic: AnalyticsScoreGroup[]
  byDifficulty: AnalyticsScoreGroup[]
  byMode: AnalyticsScoreGroup[]
  byKind: AnalyticsScoreGroup[]
  trend: PracticeTrendBucket[]
  trendGranularity: TrendGranularity
  recentSessions: PracticeRecentSession[]
}

export interface DsaTopicBreakdown {
  key: string
  label: string
  attempts: number
  solved: number
  accepted: number
  accuracy: number | null
}

export interface DsaTrendBucket {
  periodStart: string
  label: string
  submissions: number
  accepted: number
}

export interface DsaRecentSubmission {
  id: string
  questionId: string
  title: string
  topic: string
  difficulty: string
  language: string
  verdict: string
  createdAt: string
}

export interface DsaAnalytics {
  problemsAttempted: number
  problemsSolved: number
  solveRate: number | null
  submissions: number
  acceptedSubmissions: number
  failedSubmissions: number
  successRate: number | null
  byLanguage: { key: string; label: string; count: number }[]
  byDifficulty: DsaTopicBreakdown[]
  byTopic: DsaTopicBreakdown[]
  trend: DsaTrendBucket[]
  trendGranularity: TrendGranularity
  recentSubmissions: DsaRecentSubmission[]
}

export interface CodingTrendBucket {
  periodStart: string
  label: string
  attempts: number
  successes: number
}

export interface CodingRecentAttempt {
  id: string
  sessionId: string
  questionIndex: number
  language: string
  status: 'success' | 'error'
  createdAt: string
}

export interface CodingAnalytics {
  attempts: number
  successes: number
  failures: number
  successRate: number | null
  averageSeconds: number | null
  byLanguage: { key: string; label: string; count: number }[]
  trend: CodingTrendBucket[]
  trendGranularity: TrendGranularity
  recentAttempts: CodingRecentAttempt[]
}

export interface RoadmapDomainProgress {
  key: string
  label: string
  completed: number
}

export interface RoadmapCompletedTopic {
  domainId: string
  domainLabel: string
  topicId: string
  completedAt: string
}

export interface RoadmapAnalytics {
  /**
   * Completion rows are the only persisted roadmap state. "In progress" and
   * "pending" are not stored anywhere, so they stay null instead of being
   * guessed from a plan the student may have regenerated.
   */
  topicsCompleted: number
  topicsCompletedInRange: number
  topicsPlanned: number | null
  topicsInProgress: null
  topicsPending: null
  progressPercent: null
  planGeneratedAt: string | null
  byDomain: RoadmapDomainProgress[]
  recentlyCompleted: RoadmapCompletedTopic[]
}

export interface PlacementTrendBucket {
  periodStart: string
  label: string
  applications: number
}

export interface PlacementAnalytics {
  total: number
  byStatus: { status: string; count: number }[]
  trend: PlacementTrendBucket[]
  trendGranularity: TrendGranularity
}

export interface ReadinessComponent {
  key: string
  label: string
  weight: number
  value: number | null
  included: boolean
  detail: string
}

export interface ReadinessScore {
  available: boolean
  score: number | null
  /** Sum of the weights that actually contributed to the score (0–100). */
  coverage: number
  components: ReadinessComponent[]
  formula: string
  reason: string | null
}

export interface AnalyticsOverview {
  interviewsCompleted: number
  averageInterviewScore: number | null
  practiceTestsAttempted: number | null
  practiceTestsCompleted: number | null
  practiceQuestionsAnswered: number | null
  practiceAccuracy: number | null
  dsaProblemsSolved: number | null
  dsaProblemsAttempted: number | null
  dsaSubmissions: number | null
  dsaSuccessRate: number | null
  codingAttempts: number | null
  codingSuccessRate: number | null
  roadmapTopicsCompleted: number | null
  applicationsTotal: number | null
  applicationsByStatus: { status: string; count: number }[] | null
  resumeAtsScore: null
}

export interface AnalyticsActivityItem {
  id: string
  kind: 'interview' | 'practice' | 'dsa' | 'coding' | 'application'
  title: string
  detail: string
  at: string
}

export interface AnalyticsDashboardAvailability {
  interviews: boolean
  practice: boolean
  dsa: boolean
  coding: boolean
  applications: boolean
  roadmap: boolean
  resume: false
}

export interface AnalyticsDashboardResponse {
  scope: 'student' | 'college'
  range: AnalyticsRangeKey
  generatedAt: string
  availability: AnalyticsDashboardAvailability
  overview: AnalyticsOverview
  readiness: ReadinessScore
  interviews: InterviewAnalyticsResponse
  practice: PracticeAnalytics | null
  dsa: DsaAnalytics | null
  coding: CodingAnalytics | null
  roadmap: RoadmapAnalytics | null
  applications: PlacementAnalytics | null
  recentActivity: AnalyticsActivityItem[]
  notes: string[]
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

export function percentOf(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return Math.round((part / whole) * 1000) / 10
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function asIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? value : null
}

function humanize(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'Unspecified'
  const upper = trimmed.toUpperCase()
  if (upper === 'HR' || upper === 'DSA' || upper === 'MCQ') return upper
  return trimmed.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function bucketOf(iso: string, granularity: TrendGranularity): string | null {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  const date = new Date(time)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  if (granularity === 'day') return `${year}-${month}-${String(date.getUTCDate()).padStart(2, '0')}`
  return `${year}-${month}-01`
}

function bucketLabel(periodStart: string, granularity: TrendGranularity): string {
  const [year, month, day] = periodStart.split('-')
  const monthLabel = MONTHS[Number(month) - 1] ?? month
  return granularity === 'day' ? `${day} ${monthLabel}` : `${monthLabel} ${year}`
}

/** Chronological buckets for any row set; empty periods are never invented. */
export function bucketRows<T>(
  rows: T[],
  range: AnalyticsRangeKey,
  at: (row: T) => string,
): { periodStart: string; label: string; rows: T[] }[] {
  const granularity = trendGranularity(range)
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = bucketOf(at(row), granularity)
    if (!key) continue
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([periodStart, bucket]) => ({
      periodStart,
      label: bucketLabel(periodStart, granularity),
      rows: bucket,
    }))
}

// ---------------------------------------------------------------------------
// Practice Hub
// ---------------------------------------------------------------------------

function practiceStatus(value: string): 'completed' | 'active' | 'abandoned' {
  if (value === 'completed') return 'completed'
  if (value === 'abandoned') return 'abandoned'
  return 'active'
}

interface PracticeTally {
  answered: number
  correct: number
}

function tallyInto(map: Map<string, PracticeTally>, key: string, correct: boolean) {
  const entry = map.get(key) ?? { answered: 0, correct: 0 }
  entry.answered += 1
  if (correct) entry.correct += 1
  map.set(key, entry)
}

function scoreGroups(map: Map<string, PracticeTally>, label: (key: string) => string): AnalyticsScoreGroup[] {
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: label(key),
      answered: value.answered,
      correct: value.correct,
      accuracy: percentOf(value.correct, value.answered),
    }))
    .sort((a, b) => b.answered - a.answered || a.label.localeCompare(b.label))
}

export interface PracticeAnalyticsInput {
  available: boolean
  answersAvailable: boolean
  sessions: PracticeSessionAnalyticsRow[]
  answers: PracticeAnswerAnalyticsRow[]
  questions: PracticeQuestionAnalyticsRow[]
  range: AnalyticsRangeKey
}

export function buildPracticeAnalytics(input: PracticeAnalyticsInput): PracticeAnalytics | null {
  if (!input.available) return null

  const seenSessions = new Set<string>()
  const sessions: PracticeSessionAnalyticsRow[] = []
  for (const session of input.sessions) {
    if (!session || typeof session.id !== 'string' || seenSessions.has(session.id)) continue
    seenSessions.add(session.id)
    sessions.push(session)
  }
  sessions.sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0))

  const questionById = new Map(input.questions.map((question) => [question.id, question]))
  const sessionById = new Map(sessions.map((session) => [session.id, session]))

  // One answer per (session, question) is enforced by the database; dedupe here
  // defensively so a replayed row can never inflate accuracy.
  const seenAnswers = new Set<string>()
  const answers: PracticeAnswerAnalyticsRow[] = []
  if (input.answersAvailable) {
    for (const answer of input.answers) {
      const key = `${answer.session_id}:${answer.question_id}`
      if (!sessionById.has(answer.session_id) || seenAnswers.has(key)) continue
      seenAnswers.add(key)
      answers.push(answer)
    }
  }

  const byCategory = new Map<string, PracticeTally>()
  const byTopic = new Map<string, PracticeTally>()
  const byDifficulty = new Map<string, PracticeTally>()
  const byMode = new Map<string, PracticeTally>()
  const byKind = new Map<string, PracticeTally>()

  let correct = 0
  for (const answer of answers) {
    const isCorrect = answer.is_correct === true
    if (isCorrect) correct += 1
    const question = questionById.get(answer.question_id)
    const session = sessionById.get(answer.session_id)
    tallyInto(byCategory, question?.category ?? session?.category ?? 'unspecified', isCorrect)
    tallyInto(byTopic, question?.topic ?? session?.topic ?? 'unspecified', isCorrect)
    tallyInto(byDifficulty, question?.difficulty ?? session?.difficulty ?? 'unspecified', isCorrect)
    tallyInto(byMode, session?.mode ?? 'unspecified', isCorrect)
    tallyInto(byKind, question?.kind ?? session?.kind ?? 'unspecified', isCorrect)
  }

  let completed = 0
  let active = 0
  let abandoned = 0
  for (const session of sessions) {
    const status = practiceStatus(session.status)
    if (status === 'completed') completed += 1
    else if (status === 'abandoned') abandoned += 1
    else active += 1
  }

  // Accuracy and per-session counters come from recorded answers. If the answer
  // table is unavailable the module still reports honest session counts but no
  // accuracy, rather than trusting a counter nobody can verify.
  const answersBySession = new Map<string, { answered: number; correct: number }>()
  for (const answer of answers) {
    const entry = answersBySession.get(answer.session_id) ?? { answered: 0, correct: 0 }
    entry.answered += 1
    if (answer.is_correct === true) entry.correct += 1
    answersBySession.set(answer.session_id, entry)
  }

  const trend = bucketRows(sessions, input.range, (session) => session.started_at).map((bucket) => {
    let bucketAnswered = 0
    let bucketCorrect = 0
    for (const session of bucket.rows) {
      const stat = answersBySession.get(session.id)
      bucketAnswered += stat?.answered ?? 0
      bucketCorrect += stat?.correct ?? 0
    }
    return {
      periodStart: bucket.periodStart,
      label: bucket.label,
      sessions: bucket.rows.length,
      answered: bucketAnswered,
      correct: bucketCorrect,
      accuracy: percentOf(bucketCorrect, bucketAnswered),
    }
  })

  const recentSessions: PracticeRecentSession[] = sessions.slice(0, RECENT_LIMIT).map((session) => {
    const stat = answersBySession.get(session.id)
    return {
      id: session.id,
      kind: session.kind,
      category: session.category ?? null,
      topic: session.topic ?? null,
      difficulty: session.difficulty,
      mode: session.mode,
      status: practiceStatus(session.status),
      startedAt: session.started_at,
      completedAt: session.completed_at ?? null,
      questionCount: Number(session.question_count) || 0,
      answered: stat?.answered ?? 0,
      correct: stat?.correct ?? 0,
      accuracy: input.answersAvailable ? percentOf(stat?.correct ?? 0, stat?.answered ?? 0) : null,
    }
  })

  return {
    sessionsAttempted: sessions.length,
    sessionsCompleted: completed,
    sessionsInProgress: active,
    sessionsAbandoned: abandoned,
    questionsAnswered: input.answersAvailable ? answers.length : 0,
    correctAnswers: input.answersAvailable ? correct : 0,
    incorrectAnswers: input.answersAvailable ? answers.length - correct : 0,
    accuracy: input.answersAvailable ? percentOf(correct, answers.length) : null,
    byCategory: scoreGroups(byCategory, humanize),
    byTopic: scoreGroups(byTopic, humanize),
    byDifficulty: scoreGroups(byDifficulty, humanize),
    byMode: scoreGroups(byMode, (key) => (key === 'timed' ? 'Timed' : key === 'practice' ? 'Practice' : humanize(key))),
    byKind: scoreGroups(byKind, (key) => (key === 'aptitude' ? 'Aptitude' : key === 'branch_mcq' ? 'Branch MCQ' : humanize(key))),
    trend,
    trendGranularity: trendGranularity(input.range),
    recentSessions,
  }
}

// ---------------------------------------------------------------------------
// DSA (adaptive problem solving)
// ---------------------------------------------------------------------------

export const DSA_ACCEPTED_VERDICT = 'accepted'

export interface DsaAnalyticsInput {
  available: boolean
  submissions: ProblemSubmissionAnalyticsRow[]
  questions: ProblemQuestionAnalyticsRow[]
  range: AnalyticsRangeKey
}

export function buildDsaAnalytics(input: DsaAnalyticsInput): DsaAnalytics | null {
  if (!input.available) return null

  const seen = new Set<string>()
  const submissions: ProblemSubmissionAnalyticsRow[] = []
  for (const row of input.submissions) {
    if (!row || typeof row.id !== 'string' || seen.has(row.id)) continue
    seen.add(row.id)
    submissions.push(row)
  }
  submissions.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

  const questionById = new Map(input.questions.map((question) => [question.id, question]))
  const attempted = new Set<string>()
  const solved = new Set<string>()
  const languageCounts = new Map<string, number>()
  const topicTallies = new Map<string, { attempts: number; accepted: number; solved: Set<string> }>()
  const difficultyTallies = new Map<string, { attempts: number; accepted: number; solved: Set<string> }>()

  let accepted = 0
  for (const submission of submissions) {
    attempted.add(submission.question_id)
    const isAccepted = submission.verdict === DSA_ACCEPTED_VERDICT
    if (isAccepted) {
      accepted += 1
      solved.add(submission.question_id)
    }
    const language = submission.language?.trim() || 'unknown'
    languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1)

    const question = questionById.get(submission.question_id)
    const topic = question?.topic?.trim() || 'unspecified'
    const difficulty = question?.difficulty?.trim() || 'unspecified'
    for (const [map, key] of [
      [topicTallies, topic],
      [difficultyTallies, difficulty],
    ] as const) {
      const entry = map.get(key) ?? { attempts: 0, accepted: 0, solved: new Set<string>() }
      entry.attempts += 1
      if (isAccepted) {
        entry.accepted += 1
        entry.solved.add(submission.question_id)
      }
      map.set(key, entry)
    }
  }

  const toBreakdown = (
    map: Map<string, { attempts: number; accepted: number; solved: Set<string> }>,
  ): DsaTopicBreakdown[] =>
    [...map.entries()]
      .map(([key, value]) => ({
        key,
        label: key === 'unspecified' ? 'Not specified' : humanize(key),
        attempts: value.attempts,
        solved: value.solved.size,
        accepted: value.accepted,
        accuracy: percentOf(value.accepted, value.attempts),
      }))
      .sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label))

  const trend = bucketRows(submissions, input.range, (row) => row.created_at).map((bucket) => ({
    periodStart: bucket.periodStart,
    label: bucket.label,
    submissions: bucket.rows.length,
    accepted: bucket.rows.filter((row) => row.verdict === DSA_ACCEPTED_VERDICT).length,
  }))

  const recentSubmissions: DsaRecentSubmission[] = submissions.slice(0, RECENT_LIMIT).map((row) => {
    const question = questionById.get(row.question_id)
    return {
      id: row.id,
      questionId: row.question_id,
      title: question?.title ?? 'Problem',
      topic: question?.topic ?? 'unspecified',
      difficulty: question?.difficulty ?? 'unspecified',
      language: row.language,
      verdict: row.verdict,
      createdAt: row.created_at,
    }
  })

  return {
    problemsAttempted: attempted.size,
    problemsSolved: solved.size,
    solveRate: percentOf(solved.size, attempted.size),
    submissions: submissions.length,
    acceptedSubmissions: accepted,
    failedSubmissions: submissions.length - accepted,
    successRate: percentOf(accepted, submissions.length),
    byLanguage: [...languageCounts.entries()]
      .map(([key, count]) => ({ key, label: humanize(key), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    byDifficulty: toBreakdown(difficultyTallies),
    byTopic: toBreakdown(topicTallies),
    trend,
    trendGranularity: trendGranularity(input.range),
    recentSubmissions,
  }
}

// ---------------------------------------------------------------------------
// Interview coding attempts
// ---------------------------------------------------------------------------

export interface CodingAnalyticsInput {
  available: boolean
  attempts: CodingAttemptAnalyticsRow[]
  range: AnalyticsRangeKey
}

export function buildCodingAnalytics(input: CodingAnalyticsInput): CodingAnalytics | null {
  if (!input.available) return null

  const seen = new Set<string>()
  const attempts: CodingAttemptAnalyticsRow[] = []
  for (const row of input.attempts) {
    if (!row || typeof row.id !== 'string' || seen.has(row.id)) continue
    seen.add(row.id)
    attempts.push(row)
  }
  attempts.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

  let successes = 0
  let secondsTotal = 0
  let secondsCount = 0
  const languageCounts = new Map<string, number>()
  for (const attempt of attempts) {
    if (attempt.status === 'success') successes += 1
    const language = attempt.language?.trim() || 'unknown'
    languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1)
    const raw = attempt.time_seconds
    const seconds = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) {
      secondsTotal += seconds
      secondsCount += 1
    }
  }

  const trend = bucketRows(attempts, input.range, (row) => row.created_at).map((bucket) => ({
    periodStart: bucket.periodStart,
    label: bucket.label,
    attempts: bucket.rows.length,
    successes: bucket.rows.filter((row) => row.status === 'success').length,
  }))

  return {
    attempts: attempts.length,
    successes,
    failures: attempts.length - successes,
    successRate: percentOf(successes, attempts.length),
    averageSeconds: secondsCount > 0 ? round1(secondsTotal / secondsCount) : null,
    byLanguage: [...languageCounts.entries()]
      .map(([key, count]) => ({ key, label: humanize(key), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    trend,
    trendGranularity: trendGranularity(input.range),
    recentAttempts: attempts.slice(0, RECENT_LIMIT).map((attempt) => ({
      id: attempt.id,
      sessionId: attempt.session_id,
      questionIndex: Number(attempt.question_index) || 0,
      language: attempt.language,
      status: attempt.status === 'success' ? 'success' : 'error',
      createdAt: attempt.created_at,
    })),
  }
}

// ---------------------------------------------------------------------------
// Learning roadmap
// ---------------------------------------------------------------------------

export interface RoadmapAnalyticsInput {
  available: boolean
  progress: RoadmapProgressAnalyticsRow[]
  plan: { tasks: number; generatedAt: string } | null
  since: string | null
}

export function buildRoadmapAnalytics(input: RoadmapAnalyticsInput): RoadmapAnalytics | null {
  if (!input.available) return null

  const seen = new Set<string>()
  const rows: RoadmapProgressAnalyticsRow[] = []
  for (const row of input.progress) {
    const domain = typeof row.domain_id === 'string' ? row.domain_id.trim() : ''
    const topic = typeof row.topic_id === 'string' ? row.topic_id.trim() : ''
    if (!domain || !topic) continue
    const key = `${domain}:${topic}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }
  rows.sort((a, b) => (a.completed_at < b.completed_at ? 1 : a.completed_at > b.completed_at ? -1 : 0))

  const sinceTime = input.since ? Date.parse(input.since) : Number.NaN
  const inRange = Number.isFinite(sinceTime)
    ? rows.filter((row) => {
        const time = Date.parse(row.completed_at)
        return Number.isFinite(time) && time >= sinceTime
      })
    : rows

  const domainCounts = new Map<string, number>()
  for (const row of rows) domainCounts.set(row.domain_id, (domainCounts.get(row.domain_id) ?? 0) + 1)

  const label = (domainId: string) =>
    (ROADMAP_DOMAIN_LABELS as Record<string, string>)[domainId] ?? humanize(domainId)

  return {
    topicsCompleted: rows.length,
    topicsCompletedInRange: inRange.length,
    // A plan stores task titles, not the catalog topic ids that progress rows
    // use, so a per-plan pending count cannot be derived honestly.
    topicsPlanned: input.plan ? input.plan.tasks : null,
    topicsInProgress: null,
    topicsPending: null,
    progressPercent: null,
    planGeneratedAt: input.plan?.generatedAt ?? null,
    byDomain: [...domainCounts.entries()]
      .map(([key, completed]) => ({ key, label: label(key), completed }))
      .sort((a, b) => b.completed - a.completed || a.label.localeCompare(b.label)),
    recentlyCompleted: rows.slice(0, RECENT_LIMIT).map((row) => ({
      domainId: row.domain_id,
      domainLabel: label(row.domain_id),
      topicId: row.topic_id,
      completedAt: row.completed_at,
    })),
  }
}

// ---------------------------------------------------------------------------
// Placement (job applications)
// ---------------------------------------------------------------------------

export const APPLICATION_STATUS_ORDER = ['Applied', 'Under Review', 'Shortlisted', 'Rejected']

export interface PlacementAnalyticsInput {
  available: boolean
  applications: AnalyticsApplicationRow[]
  range: AnalyticsRangeKey
  stats: AnalyticsApplicationStats
}

export function buildPlacementAnalytics(input: PlacementAnalyticsInput): PlacementAnalytics | null {
  if (!input.available) return null

  const counts = new Map<string, number>()
  for (const row of input.stats.byStatus) counts.set(row.status, row.count)

  const byStatus = APPLICATION_STATUS_ORDER.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }))
  for (const row of input.stats.byStatus) {
    if (!APPLICATION_STATUS_ORDER.includes(row.status)) {
      byStatus.push({ status: row.status, count: row.count })
    }
  }

  const trend = bucketRows(input.applications, input.range, (row) => row.applied_at).map((bucket) => ({
    periodStart: bucket.periodStart,
    label: bucket.label,
    applications: bucket.rows.length,
  }))

  return {
    total: input.stats.total,
    byStatus,
    trend,
    trendGranularity: trendGranularity(input.range),
  }
}

// ---------------------------------------------------------------------------
// Readiness score (transparent, documented, real inputs only)
// ---------------------------------------------------------------------------

export const READINESS_WEIGHTS = {
  interview: 40,
  practice: 30,
  dsa: 30,
} as const

export const READINESS_MIN_COMPONENTS = 2

export const READINESS_FORMULA =
  'Weighted mean of the modules that have real data: interview average score (40), ' +
  'practice answer accuracy (30), DSA solve rate (30). Weights are renormalised over ' +
  'the modules that are present, and at least two modules must have data. Resumes, ' +
  'roadmap completion and application counts are excluded because they are not ' +
  'performance measurements (and resumes are not stored on the server).'

export function buildReadinessScore(input: {
  interviewAverage: number | null
  practiceAccuracy: number | null
  dsaSolveRate: number | null
}): ReadinessScore {
  const definitions: Array<{ key: keyof typeof READINESS_WEIGHTS; label: string; detail: string; value: number | null }> = [
    {
      key: 'interview',
      label: 'Interview performance',
      detail: 'Average of scored answers in completed mock interviews.',
      value: input.interviewAverage,
    },
    {
      key: 'practice',
      label: 'Practice accuracy',
      detail: 'Correct share of recorded Practice Hub answers.',
      value: input.practiceAccuracy,
    },
    {
      key: 'dsa',
      label: 'DSA solve rate',
      detail: 'Unique problems solved out of unique problems attempted.',
      value: input.dsaSolveRate,
    },
  ]

  const components: ReadinessComponent[] = definitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    weight: READINESS_WEIGHTS[definition.key],
    value: definition.value,
    included: definition.value !== null && Number.isFinite(definition.value),
    detail: definition.detail,
  }))

  const included = components.filter((component) => component.included)
  const coverage = included.reduce((sum, component) => sum + component.weight, 0)

  if (included.length < READINESS_MIN_COMPONENTS || coverage <= 0) {
    return {
      available: false,
      score: null,
      coverage,
      components,
      formula: READINESS_FORMULA,
      reason: `Not enough data: at least ${READINESS_MIN_COMPONENTS} of ${components.length} modules need recorded results.`,
    }
  }

  const weighted = included.reduce(
    (sum, component) => sum + (component.value ?? 0) * component.weight,
    0,
  )
  return {
    available: true,
    score: round1(weighted / coverage),
    coverage,
    components,
    formula: READINESS_FORMULA,
    reason:
      coverage < 100
        ? `Missing modules are excluded; this score covers ${coverage}% of the full weighting.`
        : null,
  }
}

// ---------------------------------------------------------------------------
// Overview, activity and assembly
// ---------------------------------------------------------------------------

export interface AnalyticsDashboardInput {
  scope: 'student' | 'college'
  range: AnalyticsRangeKey
  generatedAt: string
  since: string | null
  interviews: InterviewAnalyticsResponse
  practice: PracticeAnalytics | null
  dsa: DsaAnalytics | null
  coding: CodingAnalytics | null
  roadmap: RoadmapAnalytics | null
  applications: PlacementAnalytics | null
  activity: {
    interviews: InterviewAnalyticsResponse['recentSessions']
    practice: PracticeAnalytics | null
    dsa: DsaAnalytics | null
    coding: CodingAnalytics | null
    applications: AnalyticsApplicationRow[]
  }
}

export function buildOverview(
  interviews: InterviewAnalyticsResponse,
  practice: PracticeAnalytics | null,
  dsa: DsaAnalytics | null,
  coding: CodingAnalytics | null,
  roadmap: RoadmapAnalytics | null,
  applications: PlacementAnalytics | null,
): AnalyticsOverview {
  return {
    interviewsCompleted: interviews.totals.completed,
    averageInterviewScore: interviews.totals.averageScore,
    practiceTestsAttempted: practice ? practice.sessionsAttempted : null,
    practiceTestsCompleted: practice ? practice.sessionsCompleted : null,
    practiceQuestionsAnswered: practice ? practice.questionsAnswered : null,
    practiceAccuracy: practice ? practice.accuracy : null,
    dsaProblemsSolved: dsa ? dsa.problemsSolved : null,
    dsaProblemsAttempted: dsa ? dsa.problemsAttempted : null,
    dsaSubmissions: dsa ? dsa.submissions : null,
    dsaSuccessRate: dsa ? dsa.successRate : null,
    codingAttempts: coding ? coding.attempts : null,
    codingSuccessRate: coding ? coding.successRate : null,
    roadmapTopicsCompleted: roadmap ? roadmap.topicsCompleted : null,
    applicationsTotal: applications ? applications.total : null,
    applicationsByStatus: applications ? applications.byStatus : null,
    // Resume analysis runs client-side and is saved in the browser only; there is
    // no server-side resume history to aggregate.
    resumeAtsScore: null,
  }
}

// Activity is only ever built for a student's own dashboard. A college scope
// aggregates counts and never lists individual records.
export function buildRecentActivity(input: AnalyticsDashboardInput['activity']): AnalyticsActivityItem[] {
  const items: AnalyticsActivityItem[] = []

  for (const session of input.interviews) {
    const at = asIso(session.startedAt)
    if (!at) continue
    items.push({
      id: `interview:${session.id}`,
      kind: 'interview',
      title: `${humanize(session.interviewType)} interview`,
      detail:
        session.averageScore !== null
          ? `${session.averageScore.toFixed(1)}/100 · ${session.status}`
          : session.status,
      at,
    })
  }
  for (const session of input.practice?.recentSessions ?? []) {
    const at = asIso(session.startedAt)
    if (!at) continue
    items.push({
      id: `practice:${session.id}`,
      kind: 'practice',
      title: `${session.kind === 'aptitude' ? 'Aptitude' : 'Branch MCQ'} practice`,
      detail:
        session.accuracy !== null
          ? `${session.correct}/${session.answered} correct · ${session.status}`
          : session.status,
      at,
    })
  }
  for (const submission of input.dsa?.recentSubmissions ?? []) {
    const at = asIso(submission.createdAt)
    if (!at) continue
    items.push({
      id: `dsa:${submission.id}`,
      kind: 'dsa',
      title: submission.title,
      detail: `${humanize(submission.verdict)} · ${submission.language}`,
      at,
    })
  }
  for (const attempt of input.coding?.recentAttempts ?? []) {
    const at = asIso(attempt.createdAt)
    if (!at) continue
    items.push({
      id: `coding:${attempt.id}`,
      kind: 'coding',
      title: 'Interview coding run',
      detail: `${attempt.status === 'success' ? 'Compiled and ran' : 'Run failed'} · ${attempt.language}`,
      at,
    })
  }
  for (const application of input.applications) {
    const at = asIso(application.applied_at)
    if (!at) continue
    items.push({
      id: `application:${application.id}`,
      kind: 'application',
      title: 'Job application',
      detail: application.status || 'Applied',
      at,
    })
  }

  return items
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, ACTIVITY_LIMIT)
}

export function buildAnalyticsDashboard(input: AnalyticsDashboardInput): AnalyticsDashboardResponse {
  const overview = buildOverview(
    input.interviews,
    input.practice,
    input.dsa,
    input.coding,
    input.roadmap,
    input.applications,
  )
  const readiness = buildReadinessScore({
    interviewAverage: input.interviews.totals.averageScore,
    practiceAccuracy: input.practice?.accuracy ?? null,
    dsaSolveRate: input.dsa?.solveRate ?? null,
  })

  const notes: string[] = []
  if (!input.interviews.availability.sessions) {
    notes.push('Interview sessions are not available yet.')
  }
  if (input.scope === 'student') {
    if (!input.practice) notes.push('Practice Hub analytics is unavailable in this environment.')
    if (!input.dsa) notes.push('DSA analytics is unavailable in this environment.')
    if (!input.coding) notes.push('Interview coding analytics is unavailable in this environment.')
    if (!input.roadmap) notes.push('Roadmap analytics is unavailable in this environment.')
  } else {
    notes.push(
      'College-wide view: Practice Hub, DSA, coding and roadmap data are student-private, so this dashboard only aggregates interviews and job applications.',
    )
  }
  notes.push(
    'Resume analysis is saved in this browser only; ATS history is not stored on the server and is never aggregated.',
  )

  return {
    scope: input.scope,
    range: input.range,
    generatedAt: input.generatedAt,
    availability: {
      interviews: input.interviews.availability.sessions,
      practice: input.practice !== null,
      dsa: input.dsa !== null,
      coding: input.coding !== null,
      applications: input.applications !== null,
      roadmap: input.roadmap !== null,
      resume: false,
    },
    overview,
    readiness,
    interviews: input.interviews,
    practice: input.practice,
    dsa: input.dsa,
    coding: input.coding,
    roadmap: input.roadmap,
    applications: input.applications,
    recentActivity: input.scope === 'student' ? buildRecentActivity(input.activity) : [],
    notes,
  }
}

// ---------------------------------------------------------------------------
// Fetching (RLS-scoped client, aggregate-safe columns only)
// ---------------------------------------------------------------------------

export interface QueryResult {
  data: unknown
  error: QueryError | null
}

async function fetchAll(
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

export function chunkIds(ids: string[], size = ID_CHUNK): string[][] {
  const chunks: string[][] = []
  const unique = [...new Set(ids)]
  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size))
  }
  return chunks
}

export interface StudentScope {
  /** null for a college-wide scope, where student-owned modules are skipped. */
  studentId: string | null
  since: string | null
  range: AnalyticsRangeKey
}

export interface ModuleResult<T> {
  available: boolean
  rows: T[]
}

export async function fetchPracticeSessions(
  client: SupabaseClient,
  scope: StudentScope,
): Promise<ModuleResult<PracticeSessionAnalyticsRow>> {
  if (!scope.studentId) return { available: false, rows: [] }
  const result = await fetchAll((from, to) => {
    let query = client
      .from('practice_sessions')
      .select(PRACTICE_SESSION_ANALYTICS_COLUMNS)
      .eq('student_id', scope.studentId)
      .order('started_at', { ascending: false })
    if (scope.since) query = query.gte('started_at', scope.since)
    return query.range(from, to)
  })
  if (result.error) {
    if (isMissingRelation(result.error) || isMissingColumn(result.error)) {
      return { available: false, rows: [] }
    }
    throw new Error(result.error.message ?? 'practice_sessions read failed')
  }
  return { available: true, rows: result.rows as PracticeSessionAnalyticsRow[] }
}

export async function fetchPracticeAnswers(
  client: SupabaseClient,
  scope: StudentScope,
  sessionIds: string[],
): Promise<ModuleResult<PracticeAnswerAnalyticsRow>> {
  if (!scope.studentId || sessionIds.length === 0) return { available: true, rows: [] }
  const rows: PracticeAnswerAnalyticsRow[] = []
  for (const chunk of chunkIds(sessionIds)) {
    const result = await fetchAll((from, to) => {
      let query = client
        .from('practice_answers')
        .select(PRACTICE_ANSWER_ANALYTICS_COLUMNS)
        .eq('student_id', scope.studentId)
        .in('session_id', chunk)
        .order('answered_at', { ascending: false })
      if (scope.since) query = query.gte('answered_at', scope.since)
      return query.range(from, to)
    })
    if (result.error) {
      if (isMissingRelation(result.error) || isMissingColumn(result.error)) {
        return { available: false, rows: [] }
      }
      throw new Error(result.error.message ?? 'practice_answers read failed')
    }
    rows.push(...(result.rows as PracticeAnswerAnalyticsRow[]))
  }
  return { available: true, rows }
}

export async function fetchPracticeQuestionMeta(
  client: SupabaseClient,
  questionIds: string[],
): Promise<PracticeQuestionAnalyticsRow[]> {
  const rows: PracticeQuestionAnalyticsRow[] = []
  for (const chunk of chunkIds(questionIds)) {
    const { data, error } = await client
      .from('practice_questions')
      .select(PRACTICE_QUESTION_ANALYTICS_COLUMNS)
      .in('id', chunk)
    if (error) {
      if (isMissingRelation(error) || isMissingColumn(error)) return rows
      throw new Error(error.message ?? 'practice_questions read failed')
    }
    rows.push(...((data ?? []) as unknown as PracticeQuestionAnalyticsRow[]))
  }
  return rows
}

export async function fetchProblemSubmissions(
  client: SupabaseClient,
  scope: StudentScope,
): Promise<ModuleResult<ProblemSubmissionAnalyticsRow>> {
  if (!scope.studentId) return { available: false, rows: [] }
  const result = await fetchAll((from, to) => {
    let query = client
      .from('problem_submissions')
      .select(PROBLEM_SUBMISSION_ANALYTICS_COLUMNS)
      .eq('student_id', scope.studentId)
      .order('created_at', { ascending: false })
    if (scope.since) query = query.gte('created_at', scope.since)
    return query.range(from, to)
  })
  if (result.error) {
    if (isMissingRelation(result.error) || isMissingColumn(result.error)) {
      return { available: false, rows: [] }
    }
    throw new Error(result.error.message ?? 'problem_submissions read failed')
  }
  return { available: true, rows: result.rows as ProblemSubmissionAnalyticsRow[] }
}

export async function fetchProblemQuestionMeta(
  client: SupabaseClient,
  questionIds: string[],
): Promise<ProblemQuestionAnalyticsRow[]> {
  const rows: ProblemQuestionAnalyticsRow[] = []
  for (const chunk of chunkIds(questionIds)) {
    const { data, error } = await client
      .from('problem_questions')
      .select(PROBLEM_QUESTION_ANALYTICS_COLUMNS)
      .in('id', chunk)
    if (error) {
      if (isMissingRelation(error) || isMissingColumn(error)) return rows
      throw new Error(error.message ?? 'problem_questions read failed')
    }
    rows.push(...((data ?? []) as unknown as ProblemQuestionAnalyticsRow[]))
  }
  return rows
}

export async function fetchCodingAttempts(
  client: SupabaseClient,
  scope: StudentScope,
): Promise<ModuleResult<CodingAttemptAnalyticsRow>> {
  if (!scope.studentId) return { available: false, rows: [] }
  const result = await fetchAll((from, to) => {
    let query = client
      .from('interview_coding_attempts')
      .select(CODING_ATTEMPT_ANALYTICS_COLUMNS)
      .eq('student_id', scope.studentId)
      .order('created_at', { ascending: false })
    if (scope.since) query = query.gte('created_at', scope.since)
    return query.range(from, to)
  })
  if (result.error) {
    if (isMissingRelation(result.error) || isMissingColumn(result.error)) {
      return { available: false, rows: [] }
    }
    throw new Error(result.error.message ?? 'interview_coding_attempts read failed')
  }
  return { available: true, rows: result.rows as CodingAttemptAnalyticsRow[] }
}

export async function fetchRoadmapProgress(
  client: SupabaseClient,
  scope: StudentScope,
): Promise<ModuleResult<RoadmapProgressAnalyticsRow>> {
  if (!scope.studentId) return { available: false, rows: [] }
  const { data, error } = await client
    .from('roadmap_topic_progress')
    .select(ROADMAP_PROGRESS_ANALYTICS_COLUMNS)
    .eq('student_id', scope.studentId)
    .order('completed_at', { ascending: false })
  if (error) {
    if (isMissingRelation(error) || isMissingColumn(error)) return { available: false, rows: [] }
    throw new Error(error.message ?? 'roadmap_topic_progress read failed')
  }
  return { available: true, rows: (data ?? []) as unknown as RoadmapProgressAnalyticsRow[] }
}

export async function fetchRoadmapPlanSummary(
  client: SupabaseClient,
  scope: StudentScope,
): Promise<{ tasks: number; generatedAt: string } | null> {
  if (!scope.studentId) return null
  const { data, error } = await client
    .from('roadmap_ai_plans')
    .select(ROADMAP_PLAN_ANALYTICS_SELECTOR)
    .eq('student_id', scope.studentId)
    .maybeSingle()
  if (error || !data) return null
  const plan = (data as { plan?: unknown; generated_at?: unknown }).plan
  const generatedAt = (data as { generated_at?: unknown }).generated_at
  if (typeof plan !== 'object' || plan === null) return null
  const tasks = (plan as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks)) return null
  return {
    tasks: tasks.length,
    generatedAt: typeof generatedAt === 'string' ? generatedAt : '',
  }
}
