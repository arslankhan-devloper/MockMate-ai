// Typed client for the server-side Problem Solving workspace.
//
// The backend verifies the Supabase access token and derives the student from
// it, so no student id, difficulty or verdict is ever sent from the browser.
// Hidden tests and private reference notes never appear in these responses.

import { ApiError, apiRequest } from './api'

export type ProblemDifficulty = 'easy' | 'medium' | 'hard'
export type CodingLanguage = 'python' | 'javascript'
export type ProblemFocus = 'harder' | 'same_topic' | 'edge_case' | 'prerequisite' | 'optimization'

export interface ProblemTest {
  args: unknown[]
  expected: unknown
}

export interface ProblemExample {
  input: string
  output: string
  explanation?: string
}

export interface ProblemSummary {
  id: string
  sessionId: string
  sequence: number
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
  functionName: string
  parameters: Array<{ name: string; type: string }>
  returnType: string
  starterCode: Partial<Record<CodingLanguage, string>>
  hints: string[]
  hintsTotal: number
  hintsRevealed: number
  adaptiveReason: string
  createdAt: string
}

export interface ProblemSession {
  id: string
  status: 'active' | 'completed'
  difficulty: ProblemDifficulty
  topic: string | null
  answeredCount: number
  acceptedCount: number
  createdAt: string
  updatedAt: string
}

export interface ProblemTopicProgress {
  topic: string
  attempts: number
  accepted: number
  partial: number
  wrong: number
  hintsUsed: number
  consecutiveFailures: number
  currentDifficulty: ProblemDifficulty
  lastOutcome: string | null
  updatedAt: string
}

export interface ProblemSubmissionSummary {
  id: string
  language: string
  verdict: string
  passedTests: number
  totalTests: number
  createdAt: string
  testSummary: Array<{ index: number; passed: boolean; hidden: boolean }>
}

export interface ProblemReview {
  approach: string
  expectedComplexity: string
  hints: string[]
}

export interface ProblemWorkspace {
  session: ProblemSession | null
  question: ProblemSummary | null
  latestSubmission: ProblemSubmissionSummary | null
  review: ProblemReview | null
  progress: ProblemTopicProgress[]
}

export interface ProblemTestResult {
  index: number
  passed: boolean
  hidden: boolean
  input?: unknown
  expected?: unknown
  actual?: unknown
  stderr?: string
}

export interface ProblemRunResult {
  verdict: string
  visiblePassed: boolean
  passedTests: number
  totalTests: number
  results: ProblemTestResult[]
}

export interface ProblemSubmitResult {
  session: ProblemSession
  submission: ProblemSubmissionSummary
  results: ProblemTestResult[]
  allPassed: boolean
  review: ProblemReview
  adaptive: {
    difficulty: ProblemDifficulty
    focus: ProblemFocus
    reason: string
  }
  progress: ProblemTopicProgress
}

export interface ProblemHintResult {
  hint: string | null
  hintsRevealed: number
  hintsTotal: number
}

export function openProblemSession(
  accessToken: string,
  signal?: AbortSignal,
): Promise<ProblemWorkspace> {
  return apiRequest<ProblemWorkspace>('/api/problem-solving/sessions', {
    method: 'POST',
    accessToken,
    signal,
  })
}

export function getActiveProblemSession(
  accessToken: string,
  signal?: AbortSignal,
): Promise<ProblemWorkspace> {
  return apiRequest<ProblemWorkspace>('/api/problem-solving/sessions/active', {
    accessToken,
    signal,
  })
}

export function getNextProblem(
  accessToken: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ProblemWorkspace> {
  return apiRequest<ProblemWorkspace>(
    `/api/problem-solving/sessions/${encodeURIComponent(sessionId)}/next-question`,
    { method: 'POST', accessToken, signal },
  )
}

export function revealProblemHint(
  accessToken: string,
  questionId: string,
): Promise<ProblemHintResult> {
  return apiRequest<ProblemHintResult>(
    `/api/problem-solving/questions/${encodeURIComponent(questionId)}/hint`,
    { method: 'POST', accessToken },
  )
}

export function runProblemTests(
  accessToken: string,
  questionId: string,
  language: CodingLanguage,
  code: string,
): Promise<ProblemRunResult> {
  return apiRequest<ProblemRunResult>(
    `/api/problem-solving/questions/${encodeURIComponent(questionId)}/run`,
    { method: 'POST', accessToken, body: { language, code } },
  )
}

export function submitProblem(
  accessToken: string,
  questionId: string,
  language: CodingLanguage,
  code: string,
  idempotencyKey: string,
): Promise<ProblemSubmitResult> {
  return apiRequest<ProblemSubmitResult>(
    `/api/problem-solving/questions/${encodeURIComponent(questionId)}/submit`,
    { method: 'POST', accessToken, body: { language, code, idempotencyKey } },
  )
}

export function getProblemProgress(
  accessToken: string,
  signal?: AbortSignal,
): Promise<{ topics: ProblemTopicProgress[] }> {
  return apiRequest<{ topics: ProblemTopicProgress[] }>('/api/problem-solving/progress', {
    accessToken,
    signal,
  })
}

// User-facing error copy. Never claims a submission ran when the backend could
// not execute it.
export function describeProblemError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 403) return 'Problem solving is available to student accounts only.'
    if (err.code === 'code_execution_unavailable') {
      return 'Code execution is not configured right now. Your code was not run. Ask your administrator to configure the sandbox.'
    }
    if (err.code === 'problem_solving_not_configured') {
      return 'Problem solving is not set up yet. Apply the latest database migration, then try again.'
    }
    if (err.status === 429) return err.message
    if (err.status === 503) return err.message
    return err.message
  }
  return 'Something went wrong. Please try again.'
}
