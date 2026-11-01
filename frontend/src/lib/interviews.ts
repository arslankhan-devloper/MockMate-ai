// Typed client for the persisted interview-session API.
//
//   POST  /api/interviews                            start a session for the caller
//   GET   /api/interviews                            the caller's own sessions
//   GET   /api/interviews/:id                        one session + turns + evaluations
//   PATCH /api/interviews/:id                        update the caller's own session
//   PUT   /api/interviews/:id/turns/:index           upsert one question/answer turn
//   POST  /api/interviews/:id/turns/:index/evaluate  evaluate one stored answer
//   POST  /api/interviews/:id/turns/:index/next-question
//                                                    evaluate + generate the next question
//
// The backend derives the caller's identity from the verified Supabase access
// token, so `studentId` is never sent from the browser. The Groq API key and any
// privileged credentials stay on the server.

import { apiRequest } from './api'
import type { InterviewAnalysisSummary } from './interviewAnalysis'

export type InterviewSessionStatus = 'in_progress' | 'completed' | 'abandoned'

export interface InterviewSession {
  id: string
  studentId: string
  interviewType: string
  mode: string | null
  difficulty: string | null
  experience: string | null
  targetRole: string | null
  targetCompany: string | null
  language: string | null
  status: InterviewSessionStatus
  overallScore: number | null
  config: Record<string, unknown>
  clientSessionId: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
}

export type QuestionSource = 'static' | 'ai'
export type QuestionDifficulty = 'easy' | 'medium' | 'hard'

export interface InterviewTurn {
  id: string
  sessionId: string
  questionIndex: number
  questionText: string
  questionKey: string | null
  answerText: string
  spokenSeconds: number
  questionSource: QuestionSource
  questionDifficulty: QuestionDifficulty | null
  questionTopic: string | null
  generationRationale: string | null
  createdAt: string
  updatedAt: string
}

export interface InterviewSessionWithTurns {
  session: InterviewSession
  turns: InterviewTurn[]
  evaluations: InterviewEvaluation[]
}

export type InterviewEvaluationStatus =
  | 'evaluated'
  | 'unanswered'
  | 'insufficient_information'
  | 'failed'

export interface EvaluationCriterion {
  criterion: string
  score: number | null
  maxScore: number | null
  feedback: string
}

export type CorrectnessVerdict =
  | 'correct'
  | 'mostly_correct'
  | 'partially_correct'
  | 'incorrect'
  | 'insufficient_information'
  | 'not_applicable'

// One answer's evaluation. `score` is null unless a real evaluation produced a
// valid number — the UI must never render a placeholder score. `score` is answer
// quality; `correctnessScore` is a separate factual/technical judgement.
// Older stored evaluations have null correctness fields, which the report
// renders as "not available" rather than inventing a verdict.
export interface InterviewEvaluation {
  sessionId: string
  questionIndex: number
  status: InterviewEvaluationStatus
  score: number | null
  summary: string
  strengths: string[]
  improvements: string[]
  suggestedAnswer: string
  criteria: EvaluationCriterion[]
  correctnessVerdict: CorrectnessVerdict | null
  correctnessScore: number | null
  keyConceptsCovered: string[]
  keyConceptsMissing: string[]
  factualErrors: string[]
  expectedAnswer: string
  improvementAdvice: string
  confidence: number | null
  model: string | null
  evaluatedAt: string | null
  updatedAt: string | null
  persisted?: boolean
  retryable?: boolean
  note?: string
}

export interface AdaptiveNextQuestion {
  questionIndex: number
  questionText: string
  category: string
  difficulty: QuestionDifficulty | null
  topic: string | null
  rationale: string | null
  source: 'ai' | 'existing'
}

export interface AdaptiveNextTurnResult {
  evaluation: InterviewEvaluation
  nextQuestion: AdaptiveNextQuestion | null
  complete: boolean
  questionCount: number
  generation: {
    status: 'generated' | 'existing' | 'unavailable' | 'not_requested'
    persisted: boolean
    retryable: boolean
    note?: string
  }
}

// Mirrors the setup screen's InterviewConfig, minus any server-owned fields.
export interface CreateInterviewSessionInput {
  interviewType: string
  mode?: string
  difficulty?: string
  experience?: string
  role?: string
  company?: string
  language?: string
  typeLabel?: string
  modeLabel?: string
  languageLabel?: string
  branch?: string
  subject?: string
  questionCount?: number
  clientSessionId?: string
  /** Coding Round only: the candidate's preferred execution language key. */
  codingLanguage?: string
}

export interface UpdateInterviewSessionInput {
  status: InterviewSessionStatus
  analysis?: InterviewAnalysisSummary
}

export interface SaveInterviewTurnInput {
  questionText: string
  answerText: string
  questionKey?: string
  spokenSeconds?: number
}

// ── Coding Round (Interview module) ─────────────────────────────
// Runs are executed by the backend through OnlineCompiler.io. The browser sends
// only a language key and code; the provider compiler id and API key stay on the
// server.

export interface CodingRunResult {
  output: string
  error: string
  status: 'success' | 'error'
  exitCode: number
  signal: number | null
  truncated: boolean
  time: string
  total: string
  memory: string
  timeLimit: number
  provider: string
}

export interface CodingAttempt {
  id: string
  sessionId: string
  questionIndex: number
  language: string
  compilerId: string
  code: string
  input: string
  output: string
  error: string
  exitCode: number | null
  status: string
  signal: number | null
  truncated: boolean
  timeSeconds: number | null
  totalSeconds: number | null
  memoryKb: number | null
  provider: string
  createdAt: string
}

export interface RunCodingRoundInput {
  language: string
  code: string
  input?: string
  timeLimit?: number
  questionIndex?: number
}

export interface RunCodingRoundResponse {
  result: CodingRunResult
  attempt: CodingAttempt | null
  persisted: boolean
  warning?: string
}

export async function runCodingRound(
  accessToken: string,
  sessionId: string,
  input: RunCodingRoundInput,
  signal?: AbortSignal,
): Promise<RunCodingRoundResponse> {
  return apiRequest<RunCodingRoundResponse>(
    `/api/interviews/${encodeURIComponent(sessionId)}/coding/run`,
    { method: 'POST', accessToken, body: input, signal },
  )
}

export async function listCodingAttempts(
  accessToken: string,
  sessionId: string,
): Promise<{ attempts: CodingAttempt[]; available: boolean }> {
  return apiRequest<{ attempts: CodingAttempt[]; available: boolean }>(
    `/api/interviews/${encodeURIComponent(sessionId)}/coding/attempts`,
    { accessToken },
  )
}

// Best-effort UUID for the create-session idempotency key. Falls back to null on
// the rare browser without `crypto.randomUUID`, in which case the server simply
// creates a session without a dedupe key.
export function newClientSessionId(): string | undefined {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return undefined
}

export async function createInterviewSession(
  accessToken: string,
  input: CreateInterviewSessionInput,
): Promise<InterviewSession> {
  return apiRequest<InterviewSession>('/api/interviews', {
    method: 'POST',
    accessToken,
    body: input,
  })
}

export async function listInterviewSessions(accessToken: string): Promise<InterviewSession[]> {
  return apiRequest<InterviewSession[]>('/api/interviews', { accessToken })
}

export async function getInterviewSession(
  accessToken: string,
  sessionId: string,
): Promise<InterviewSessionWithTurns> {
  return apiRequest<InterviewSessionWithTurns>(`/api/interviews/${encodeURIComponent(sessionId)}`, {
    accessToken,
  })
}

export async function updateInterviewSession(
  accessToken: string,
  sessionId: string,
  input: UpdateInterviewSessionInput,
): Promise<InterviewSession> {
  return apiRequest<InterviewSession>(`/api/interviews/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    accessToken,
    body: input,
  })
}

export async function saveInterviewTurn(
  accessToken: string,
  sessionId: string,
  questionIndex: number,
  input: SaveInterviewTurnInput,
): Promise<InterviewTurn> {
  return apiRequest<InterviewTurn>(
    `/api/interviews/${encodeURIComponent(sessionId)}/turns/${questionIndex}`,
    { method: 'PUT', accessToken, body: input },
  )
}

// Request (or re-request) the evaluation of one stored answer. The backend reads
// the question and answer from the persisted turn, so nothing else is sent. The
// default call is idempotent; `force` explicitly re-runs an existing evaluation.
export async function evaluateInterviewTurn(
  accessToken: string,
  sessionId: string,
  questionIndex: number,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<InterviewEvaluation> {
  return apiRequest<InterviewEvaluation>(
    `/api/interviews/${encodeURIComponent(sessionId)}/turns/${questionIndex}/evaluate`,
    { method: 'POST', accessToken, body: { force: options.force ?? false }, signal: options.signal },
  )
}

// Evaluate the current persisted answer and, unless the configured question
// limit is reached, generate and persist the next adaptive question. This is
// idempotent for the same answer, so a retry cannot add a duplicate question.
export async function requestNextInterviewQuestion(
  accessToken: string,
  sessionId: string,
  questionIndex: number,
  options: { signal?: AbortSignal } = {},
): Promise<AdaptiveNextTurnResult> {
  return apiRequest<AdaptiveNextTurnResult>(
    `/api/interviews/${encodeURIComponent(sessionId)}/turns/${questionIndex}/next-question`,
    { method: 'POST', accessToken, body: {}, signal: options.signal },
  )
}

// ── Analytics (Item 5) ──────────────────────────────────────────
// Pre-aggregated metrics computed server-side and scoped to the caller. The
// browser never receives another student's turns, answers or per-answer
// evaluations. `averageScore` is null (never 0) when nothing valid was scored,
// and the `availability` flags say which sources exist in the current
// (pre-migration) environment so the UI can show partial states honestly.

export type InterviewAnalyticsRange = '1w' | '1m' | '3m' | 'all'

export interface InterviewAnalyticsAvailability {
  sessions: boolean
  turns: boolean
  topics: boolean
  evaluations: boolean
  applications: boolean
}

export interface InterviewAnalyticsTotals {
  sessions: number
  completed: number
  inProgress: number
  abandoned: number
  answeredQuestions: number | null
  unansweredQuestions: number | null
  evaluatedAnswers: number
  averageScore: number | null
}

export interface InterviewAnalyticsGroup {
  key: string
  label: string
  sessions: number
  evaluatedAnswers: number
  averageScore: number | null
}

export interface InterviewAnalyticsRecentSession {
  id: string
  interviewType: string
  mode: string | null
  difficulty: string | null
  status: InterviewSessionStatus
  startedAt: string
  completedAt: string | null
  answeredQuestions: number | null
  questionCount: number | null
  evaluatedAnswers: number
  averageScore: number | null
}

export interface InterviewAnalyticsTrendBucket {
  periodStart: string
  label: string
  evaluatedAnswers: number
  averageScore: number
}

export interface InterviewAnalyticsApplicationStatusCount {
  status: string
  count: number
}

export interface InterviewAnalyticsApplications {
  total: number
  inRange: number
  byStatus: InterviewAnalyticsApplicationStatusCount[]
}

export interface InterviewAnalyticsTrend {
  granularity: 'month'
  buckets: InterviewAnalyticsTrendBucket[]
}

export interface InterviewAnalytics {
  scope: 'student' | 'college'
  range: InterviewAnalyticsRange
  generatedAt: string
  availability: InterviewAnalyticsAvailability
  totals: InterviewAnalyticsTotals
  byDomain: InterviewAnalyticsGroup[]
  byDifficulty: InterviewAnalyticsGroup[]
  byTopic: InterviewAnalyticsGroup[]
  strengths: InterviewAnalyticsGroup[]
  weaknesses: InterviewAnalyticsGroup[]
  applications: InterviewAnalyticsApplications | null
  recentSessions: InterviewAnalyticsRecentSession[]
  trend: InterviewAnalyticsTrend | null
  notes: string[]
}

export async function getInterviewAnalytics(
  accessToken: string,
  range: InterviewAnalyticsRange = 'all',
  signal?: AbortSignal,
): Promise<InterviewAnalytics> {
  return apiRequest<InterviewAnalytics>(`/api/interviews/analytics?range=${range}`, {
    accessToken,
    signal,
  })
}
