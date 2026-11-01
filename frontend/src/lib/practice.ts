// Typed API client for the Placement Preparation & Practice Hub.
//
// The backend owns the question bank, correctness and scoring. The browser sends
// only a selected option index; it never receives a correct answer for an
// unanswered question and never sends a score.
//
// Pure types and helpers live in `practiceCore.ts` and are re-exported here so
// callers only need this module.

import { ApiError, apiRequest } from './api'
import {
  practiceErrorCopy,
  type CreatePracticeSessionInput,
  type PracticeBranchId,
  type PracticeCatalog,
  type PracticeHistoryItem,
  type PracticeKind,
  type PracticeSessionView,
  type SubmitPracticeAnswerResult,
} from './practiceCore'

export * from './practiceCore'

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const suffix = search.toString()
  return suffix ? `?${suffix}` : ''
}

export function getPracticeCatalog(
  accessToken: string,
  kind: PracticeKind,
  branch?: PracticeBranchId | null,
  signal?: AbortSignal,
): Promise<PracticeCatalog> {
  return apiRequest<PracticeCatalog>(
    `/api/practice/catalog${query({ kind, branch: branch ?? undefined })}`,
    { accessToken, signal },
  )
}

export function createPracticeSession(
  accessToken: string,
  input: CreatePracticeSessionInput,
  signal?: AbortSignal,
): Promise<PracticeSessionView> {
  return apiRequest<PracticeSessionView>('/api/practice/sessions', {
    method: 'POST',
    accessToken,
    body: input,
    signal,
  })
}

export function getActivePracticeSession(
  accessToken: string,
  kind: PracticeKind,
  signal?: AbortSignal,
): Promise<PracticeSessionView | { session: null; questions: [] }> {
  return apiRequest<PracticeSessionView | { session: null; questions: [] }>(
    `/api/practice/sessions/active${query({ kind })}`,
    { accessToken, signal },
  )
}

export function getPracticeSession(
  accessToken: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<PracticeSessionView> {
  return apiRequest<PracticeSessionView>(
    `/api/practice/sessions/${encodeURIComponent(sessionId)}`,
    { accessToken, signal },
  )
}

export function submitPracticeAnswer(
  accessToken: string,
  sessionId: string,
  questionId: string,
  selectedIndex: number,
): Promise<SubmitPracticeAnswerResult> {
  return apiRequest<SubmitPracticeAnswerResult>(
    `/api/practice/sessions/${encodeURIComponent(sessionId)}/answers`,
    { method: 'POST', accessToken, body: { questionId, selectedIndex } },
  )
}

export function completePracticeSession(
  accessToken: string,
  sessionId: string,
): Promise<PracticeSessionView> {
  return apiRequest<PracticeSessionView>(
    `/api/practice/sessions/${encodeURIComponent(sessionId)}/complete`,
    { method: 'POST', accessToken, body: {} },
  )
}

export function listPracticeHistory(
  accessToken: string,
  kind?: PracticeKind,
  signal?: AbortSignal,
): Promise<{ sessions: PracticeHistoryItem[] }> {
  return apiRequest<{ sessions: PracticeHistoryItem[] }>(
    `/api/practice/sessions/history${query({ kind })}`,
    { accessToken, signal },
  )
}

export function describePracticeError(err: unknown): string {
  if (err instanceof ApiError) {
    return practiceErrorCopy(err.status, err.code, err.message)
  }
  return 'Something went wrong. Please retry.'
}
