import type { Request, Response } from 'express'
import {
  createSession,
  findSessionByClientId,
  getEvaluation,
  getOwnSession,
  getTurn,
  isUniqueViolation,
  listEvaluations,
  listOwnSessions,
  listTurns,
  mapEvaluationRow,
  mapSessionRow,
  mapTurnRow,
  updateOwnSession,
  upsertEvaluation,
  upsertTurn,
  type EvaluationRow,
  type InterviewEvaluationResponse,
  type SessionRow,
  type SessionStatus,
  type TurnRow,
} from '../services/interviews.service.js'
import { evaluateAnswer, evaluationModel, GroqError } from '../services/interviewEvaluation.service.js'
import {
  generateNextQuestion,
  type AdaptiveQuestionHistoryTurn,
} from '../services/interviewQuestion.service.js'
import {
  buildInterviewAnalytics,
  fetchAnalyticsApplications,
  fetchAnalyticsEvaluations,
  fetchAnalyticsSessions,
  fetchAnalyticsTurns,
  isMissingRelation,
  normalizeAnalyticsRange,
  rangeSince,
  type AnalyticsApplicationRow,
  type AnalyticsEvaluationRow,
  type AnalyticsSessionRow,
  type AnalyticsTurnRow,
} from '../services/interviewAnalytics.service.js'
import { sendError } from '../utils/http.js'
import { getServiceWriteClient } from '../utils/serviceWriteClient.js'
import {
  hashAnswer,
  isAnswerEmpty,
  isAnswerTooShort,
  isUuid,
  validateEvaluationRequest,
  type NormalizedEvaluation,
} from '../utils/interviewEvaluationValidation.js'
import {
  normalizeQuestionDifficulty,
  resolveQuestionCount,
  shouldReuseNextQuestion,
} from '../utils/interviewQuestionValidation.js'
import {
  validateCreateSession,
  validateSessionUpdate,
  validateTurnUpsert,
} from '../utils/interviewValidation.js'

const INDEX_RE = /^\d+$/

// The evaluation table only exists once the Item 4 migration is applied. In a
// pre-migration environment the report must still load, so a missing table is
// logged once and treated as "no evaluations yet" rather than an error.
let evaluationTableMissing = false
function handleEvaluationStoreError(error: { code?: string; message?: string } | null): void {
  if (!error) return
  if (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')) {
    if (!evaluationTableMissing) {
      evaluationTableMissing = true
      console.warn(
        '[mockmate-backend] interview_turn_evaluations is unavailable; apply migration ' +
          '20260104000000_interview_turn_evaluations.sql to persist evaluations.',
      )
    }
    return
  }
  console.error(`[mockmate-backend] evaluation store error: ${error.message ?? error.code ?? 'unknown'}`)
}

// Express 5 may type route params as string | string[]; this API only accepts a
// single segment.
function routeId(req: Request): string {
  const raw = req.params.id
  return typeof raw === 'string' ? raw : ''
}

function routeIndex(req: Request): unknown {
  return req.params.index
}

function asConfigObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

// POST /api/interviews — start a new session for the authenticated caller.
// `student_id` always comes from the verified token, never the request body. A
// repeated request carrying the same `clientSessionId` returns the original
// session instead of creating a second one.
export async function createSessionHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const parsed = validateCreateSession(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Interview storage is not configured.')
    return
  }

  const clientSessionId = parsed.value.client_session_id
  const { data, error } = await createSession(writer, { ...parsed.value, student_id: auth.userId })
  if (error) {
    // Idempotent create: if this exact client session already exists, return it.
    if (isUniqueViolation(error) && typeof clientSessionId === 'string') {
      const existing = await findSessionByClientId(client, auth.userId, clientSessionId)
      if (!existing.error && existing.data) {
        res.status(200).json(mapSessionRow(existing.data as unknown as SessionRow))
        return
      }
    }
    if (error.code === '42501') {
      sendError(res, 403, 'forbidden', 'You cannot create interview sessions.')
      return
    }
    if (error.code === '23514') {
      sendError(res, 400, 'validation_error', 'One or more values are not allowed.')
      return
    }
    sendError(res, 500, 'interview_create_failed', 'Could not start the interview session.')
    return
  }

  res.status(201).json(mapSessionRow(data as unknown as SessionRow))
}

// GET /api/interviews — the caller's own sessions, newest first.
export async function listSessionsHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const { data, error } = await listOwnSessions(client, auth.userId)
  if (error) {
    sendError(res, 500, 'interviews_read_failed', 'Could not load your interview sessions.')
    return
  }

  const rows = (data ?? []) as unknown as SessionRow[]
  res.status(200).json(rows.map(mapSessionRow))
}

// GET /api/interviews/analytics — pre-aggregated performance metrics for the
// caller. A student sees their own sessions; a placement officer sees aggregated
// totals for the students in their college (RLS-scoped). Only aggregates and
// counts are returned — never another student's turns, answers or per-answer
// evaluations. Missing optional tables degrade to unavailable metrics.
export async function getAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const range = normalizeAnalyticsRange(req.query.range)
  if (!range) {
    sendError(res, 400, 'invalid_range', 'The requested time range is not supported.')
    return
  }

  const scope = auth.role === 'placement-officer' ? 'college' : 'student'
  if (scope === 'college' && !auth.collegeId) {
    sendError(res, 403, 'no_college', 'No college is assigned to this account.')
    return
  }

  const generatedAt = new Date().toISOString()
  const since = rangeSince(range)

  const sessionsResult = await fetchAnalyticsSessions(client, {
    studentId: scope === 'student' ? auth.userId : null,
    since,
  })
  const sessionsMissing = isMissingRelation(sessionsResult.error)
  if (sessionsResult.error && !sessionsMissing) {
    sendError(res, 500, 'analytics_read_failed', 'Could not load interview analytics.')
    return
  }

  // Turns carry free-text answers, so they are only ever requested for the
  // student's own scope. An officer's view never loads another student's text.
  let turnsAvailable = false
  let topicsAvailable = false
  let turns: AnalyticsTurnRow[] = []
  if (scope === 'student' && !sessionsMissing) {
    const turnsResult = await fetchAnalyticsTurns(client)
    if (turnsResult.error) {
      if (!isMissingRelation(turnsResult.error)) {
        sendError(res, 500, 'analytics_read_failed', 'Could not load interview analytics.')
        return
      }
    } else {
      turnsAvailable = true
      topicsAvailable = turnsResult.topicsAvailable
      turns = turnsResult.rows as AnalyticsTurnRow[]
    }
  }

  // Evaluations are read with non-identifying columns only (no summary/feedback),
  // so this stays aggregate-safe for the college scope too.
  let evaluationsAvailable = false
  let evaluations: AnalyticsEvaluationRow[] = []
  if (!sessionsMissing) {
    const evaluationsResult = await fetchAnalyticsEvaluations(client)
    if (evaluationsResult.error) {
      if (!isMissingRelation(evaluationsResult.error)) {
        sendError(res, 500, 'analytics_read_failed', 'Could not load interview analytics.')
        return
      }
    } else {
      evaluationsAvailable = true
      evaluations = evaluationsResult.rows as AnalyticsEvaluationRow[]
    }
  }

  // Job applications are a separate activity from interviews. A student sees
  // their own applications; an officer sees only applications to their
  // college's jobs. Only status/applied_at are read, never applicant details.
  let applicationsAvailable = false
  let applications: AnalyticsApplicationRow[] = []
  const applicationsResult = await fetchAnalyticsApplications(client, {
    studentId: scope === 'student' ? auth.userId : null,
    collegeId: scope === 'college' ? auth.collegeId : null,
    since,
  })
  if (applicationsResult.error) {
    if (!isMissingRelation(applicationsResult.error)) {
      sendError(res, 500, 'analytics_read_failed', 'Could not load interview analytics.')
      return
    }
  } else {
    applicationsAvailable = true
    applications = applicationsResult.rows as AnalyticsApplicationRow[]
  }

  const analytics = buildInterviewAnalytics({
    scope,
    range,
    generatedAt,
    sessionsAvailable: !sessionsMissing,
    sessions: sessionsMissing ? [] : (sessionsResult.rows as AnalyticsSessionRow[]),
    turnsAvailable,
    topicsAvailable,
    turns,
    evaluationsAvailable,
    evaluations,
    applicationsAvailable,
    applications,
  })

  res.status(200).json(analytics)
}

// GET /api/interviews/:id — one session plus its question/answer history.
export async function getSessionHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const sessionId = routeId(req)
  if (!sessionId) {
    sendError(res, 400, 'invalid_id', 'A session id is required.')
    return
  }

  const { data, error } = await getOwnSession(client, sessionId, auth.userId)
  if (error) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview session.')
    return
  }
  if (!data) {
    sendError(res, 404, 'interview_not_found', 'Interview session not found.')
    return
  }

  const { data: turnData, error: turnError } = await listTurns(client, sessionId)
  if (turnError) {
    sendError(res, 500, 'interview_turns_read_failed', 'Could not load the interview answers.')
    return
  }

  const turns = (turnData ?? []) as unknown as TurnRow[]

  // Evaluations are optional and live in their own table. A missing table (or a
  // read error) degrades to "no evaluations yet" instead of failing the report.
  const { data: evalData, error: evalError } = await listEvaluations(client, sessionId)
  if (evalError) handleEvaluationStoreError(evalError)

  const evaluations: InterviewEvaluationResponse[] = evalError
    ? []
    : filterCurrentEvaluations((evalData ?? []) as unknown as EvaluationRow[], turns)

  res.status(200).json({
    session: mapSessionRow(data as unknown as SessionRow),
    turns: turns.map(mapTurnRow),
    evaluations,
  })
}

// Only surface an evaluation when it still matches the answer it was produced
// from, so an edited answer never shows stale feedback.
function filterCurrentEvaluations(
  rows: EvaluationRow[],
  turns: TurnRow[],
): InterviewEvaluationResponse[] {
  const byIndex = new Map<number, TurnRow>()
  for (const turn of turns) byIndex.set(turn.question_index, turn)

  const out: InterviewEvaluationResponse[] = []
  for (const row of rows) {
    const turn = byIndex.get(row.question_index)
    if (!turn || !row.answer_hash) continue
    if (row.answer_hash !== hashAnswer(turn.answer_text ?? '')) continue
    out.push(mapEvaluationRow(row))
  }
  return out
}

// PATCH /api/interviews/:id — update the caller's own session status and optional bounded analysis summary.
export async function updateSessionHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const sessionId = routeId(req)
  if (!sessionId) {
    sendError(res, 400, 'invalid_id', 'A session id is required.')
    return
  }

  const parsed = validateSessionUpdate(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  const { data: existing, error: existingError } = await getOwnSession(client, sessionId, auth.userId)
  if (existingError) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview session.')
    return
  }
  if (!existing) {
    sendError(res, 404, 'interview_not_found', 'Interview session not found.')
    return
  }

  const status = parsed.value.status as SessionStatus
  const analysis = parsed.value.analysis as Record<string, unknown> | undefined
  const patch: Record<string, unknown> = {
    status,
    // A completed session is stamped; reopening or abandoning clears the stamp.
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  }
  if (analysis) {
    patch.config = { ...asConfigObject((existing as unknown as SessionRow).config), analysis }
  }

  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Interview storage is not configured.')
    return
  }

  const { data, error } = await updateOwnSession(writer, sessionId, auth.userId, patch)
  if (error) {
    if (error.code === '42501') {
      sendError(res, 403, 'forbidden', 'You cannot update this interview session.')
      return
    }
    if (error.code === '23514') {
      sendError(res, 400, 'validation_error', 'One or more values are not allowed.')
      return
    }
    sendError(res, 500, 'interview_update_failed', 'Could not update the interview session.')
    return
  }
  if (!data) {
    sendError(res, 404, 'interview_not_found', 'Interview session not found.')
    return
  }

  res.status(200).json(mapSessionRow(data as unknown as SessionRow))
}

// PUT /api/interviews/:id/turns/:index — upsert one question/answer turn for a
// session owned by the caller. Idempotent: retrying writes the same row.
export async function upsertTurnHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const sessionId = routeId(req)
  if (!sessionId) {
    sendError(res, 400, 'invalid_id', 'A session id is required.')
    return
  }

  const parsed = validateTurnUpsert(req.body, routeIndex(req))
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  // Ownership is verified against the caller's own sessions before writing.
  // Browser write policies have been removed, so this check is authoritative.
  const { data: session, error: sessionError } = await getOwnSession(client, sessionId, auth.userId)
  if (sessionError) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview session.')
    return
  }
  if (!session) {
    sendError(res, 404, 'interview_not_found', 'Interview session not found.')
    return
  }

  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Interview storage is not configured.')
    return
  }

  const { data, error } = await upsertTurn(writer, { ...parsed.value, session_id: sessionId })
  if (error) {
    if (error.code === '42501') {
      sendError(res, 403, 'forbidden', 'You cannot update answers for this session.')
      return
    }
    if (error.code === '23514') {
      sendError(res, 400, 'validation_error', 'One or more values are not allowed.')
      return
    }
    sendError(res, 500, 'interview_turn_save_failed', 'Could not save the interview answer.')
    return
  }

  res.status(200).json(mapTurnRow(data as unknown as TurnRow))
}

// ── Answer evaluation (Item 4) ──────────────────────────────────

function localEvaluation(
  sessionId: string,
  questionIndex: number,
  status: InterviewEvaluationResponse['status'],
  summary: string,
  evaluatedAt: string | null,
): InterviewEvaluationResponse {
  return {
    sessionId,
    questionIndex,
    status,
    score: null,
    summary,
    strengths: [],
    improvements: [],
    suggestedAnswer: '',
    criteria: [],
    correctnessVerdict:
      status === 'unanswered' || status === 'insufficient_information'
        ? 'insufficient_information'
        : null,
    correctnessScore: null,
    keyConceptsCovered: [],
    keyConceptsMissing: [],
    factualErrors: [],
    expectedAnswer: '',
    improvementAdvice: '',
    confidence: null,
    model: null,
    evaluatedAt,
    updatedAt: evaluatedAt,
  }
}

function fromNormalized(
  sessionId: string,
  questionIndex: number,
  evaluation: NormalizedEvaluation,
  evaluatedAt: string,
): InterviewEvaluationResponse {
  return {
    sessionId,
    questionIndex,
    status: evaluation.status,
    score: evaluation.score,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    suggestedAnswer: evaluation.suggestedAnswer,
    criteria: evaluation.criteria,
    correctnessVerdict: evaluation.correctnessVerdict,
    correctnessScore: evaluation.correctnessScore,
    keyConceptsCovered: evaluation.keyConceptsCovered,
    keyConceptsMissing: evaluation.keyConceptsMissing,
    factualErrors: evaluation.factualErrors,
    expectedAnswer: evaluation.expectedAnswer,
    improvementAdvice: evaluation.improvementAdvice,
    confidence: evaluation.confidence,
    model: evaluationModel(),
    evaluatedAt,
    updatedAt: evaluatedAt,
  }
}

// Persist an evaluation; returns false (never throws) when the store is
// unavailable, so the caller still receives a usable result.
async function persistEvaluation(
  writer: NonNullable<Request['supabaseWrite']>,
  sessionId: string,
  evaluation: InterviewEvaluationResponse,
  answerHash: string,
): Promise<boolean> {
  const { data, error } = await upsertEvaluation(writer, {
    session_id: sessionId,
    question_index: evaluation.questionIndex,
    status: evaluation.status,
    score: evaluation.score,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    suggested_answer: evaluation.suggestedAnswer,
    criteria: evaluation.criteria,
    correctness_verdict: evaluation.correctnessVerdict,
    correctness_score: evaluation.correctnessScore,
    key_concepts_covered: evaluation.keyConceptsCovered,
    key_concepts_missing: evaluation.keyConceptsMissing,
    factual_errors: evaluation.factualErrors,
    expected_answer: evaluation.expectedAnswer,
    improvement_advice: evaluation.improvementAdvice,
    confidence: evaluation.confidence,
    model: evaluation.model,
    answer_hash: answerHash,
    evaluated_at: evaluation.evaluatedAt,
  })
  if (error) {
    handleEvaluationStoreError(error)
    return false
  }
  return Boolean(data)
}

interface TurnEvaluationOutcome {
  evaluation: InterviewEvaluationResponse
  persisted: boolean
}

function failedEvaluation(
  sessionId: string,
  questionIndex: number,
  note: string,
  retryable: boolean,
): InterviewEvaluationResponse & { note: string; retryable: boolean } {
  return {
    ...localEvaluation(sessionId, questionIndex, 'failed', '', null),
    note,
    retryable,
  }
}

// Shared by the report's Evaluate button and the adaptive next-question flow.
// It always reads the persisted turn (never client-supplied text), reuses a
// matching stored evaluation, and never turns a provider failure into a score.
async function evaluateStoredTurn(
  client: NonNullable<Request['supabase']>,
  writer: NonNullable<Request['supabaseWrite']>,
  session: SessionRow,
  turn: TurnRow,
  force: boolean,
): Promise<TurnEvaluationOutcome> {
  const sessionId = session.id
  const questionIndex = turn.question_index
  const answerText = turn.answer_text ?? ''
  const answerHash = hashAnswer(answerText)

  if (isAnswerEmpty(answerText)) {
    const result = localEvaluation(sessionId, questionIndex, 'unanswered', 'No answer was recorded for this question.', null)
    const persisted = await persistEvaluation(writer, sessionId, result, answerHash)
    return { evaluation: result, persisted }
  }

  if (isAnswerTooShort(answerText)) {
    const evaluatedAt = new Date().toISOString()
    const result = localEvaluation(
      sessionId,
      questionIndex,
      'insufficient_information',
      'The answer is too short to evaluate reliably. Add more detail about your approach.',
      evaluatedAt,
    )
    const persisted = await persistEvaluation(writer, sessionId, result, answerHash)
    return { evaluation: result, persisted }
  }

  if (!force) {
    const { data: existingData, error: existingError } = await getEvaluation(client, sessionId, questionIndex)
    if (existingError) {
      handleEvaluationStoreError(existingError)
    } else if (existingData) {
      const existing = existingData as unknown as EvaluationRow
      if (existing.status !== 'failed' && existing.answer_hash === answerHash) {
        return { evaluation: mapEvaluationRow(existing), persisted: true }
      }
    }
  }

  try {
    const evaluation = await evaluateAnswer({
      interviewType: session.interview_type,
      mode: session.mode ?? null,
      difficulty: session.difficulty ?? null,
      targetRole: session.target_role ?? null,
      targetCompany: session.target_company ?? null,
      language: session.language ?? null,
      questionText: turn.question_text ?? '',
      answerText,
    })
    const evaluatedAt = new Date().toISOString()
    const result = fromNormalized(sessionId, questionIndex, evaluation, evaluatedAt)
    const persisted = await persistEvaluation(writer, sessionId, result, answerHash)
    return { evaluation: result, persisted }
  } catch (err) {
    if (err instanceof GroqError) {
      // Explicit failure state — no score, no fabricated feedback. Retryable
      // conditions (busy, timeout, transient provider error) are flagged.
      const retryable = err.status === 429 || err.status === 504 || err.status === 502
      return {
        evaluation: failedEvaluation(sessionId, questionIndex, err.message, retryable),
        persisted: false,
      }
    }
    throw err
  }
}

// POST /api/interviews/:id/turns/:index/evaluate — evaluate ONE stored answer.
//
// The question and answer are read from the authorised, persisted turn, never
// from the request body, so a caller can only ever evaluate their own session's
// answers. An empty answer is reported `unanswered` and a too-short answer
// `insufficient_information` WITHOUT calling the provider, so no score is ever
// invented. A provider failure returns an explicit `failed` state (score null);
// the saved transcript is untouched. Re-evaluating is explicit via `force`.
export async function evaluateTurnHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const sessionId = routeId(req)
  if (!isUuid(sessionId)) {
    sendError(res, 400, 'invalid_id', 'A valid session id is required.')
    return
  }

  const parsed = validateEvaluationRequest(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  const rawIndex = routeIndex(req)
  if (typeof rawIndex !== 'string' || !INDEX_RE.test(rawIndex)) {
    sendError(res, 400, 'invalid_index', 'A valid question index is required.')
    return
  }
  const questionIndex = Number(rawIndex)

  const { data: sessionData, error: sessionError } = await getOwnSession(client, sessionId, auth.userId)
  if (sessionError) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview session.')
    return
  }
  if (!sessionData) {
    sendError(res, 404, 'interview_not_found', 'Interview session not found.')
    return
  }

  const { data: turnData, error: turnError } = await getTurn(client, sessionId, questionIndex)
  if (turnError) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview answer.')
    return
  }
  if (!turnData) {
    sendError(res, 404, 'interview_turn_not_found', 'No answer was found for this question.')
    return
  }

  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Interview storage is not configured.')
    return
  }

  try {
    const outcome = await evaluateStoredTurn(
      client,
      writer,
      sessionData as unknown as SessionRow,
      turnData as unknown as TurnRow,
      parsed.force,
    )
    res.status(200).json({ ...outcome.evaluation, persisted: outcome.persisted })
  } catch {
    sendError(res, 502, 'ai_request_failed', 'Answer evaluation failed. Please try again.')
  }
}

// ── Adaptive next question ──────────────────────────────────────

interface AdaptiveQuestionPayload {
  questionIndex: number
  questionText: string
  category: string
  difficulty: 'easy' | 'medium' | 'hard' | null
  topic: string | null
  rationale: string | null
  source: 'ai' | 'existing'
}

interface AdaptiveGenerationState {
  status: 'generated' | 'existing' | 'unavailable' | 'not_requested'
  persisted: boolean
  retryable: boolean
  note?: string
}

interface AdaptiveResult {
  evaluation: InterviewEvaluationResponse & { persisted: boolean }
  nextQuestion: AdaptiveQuestionPayload | null
  complete: boolean
  questionCount: number
  generation: AdaptiveGenerationState
}

// Concurrent duplicate requests (double-click, retry race) share one generation
// instead of producing two different next questions.
const adaptiveInFlight = new Map<string, Promise<AdaptiveResult>>()

async function withAdaptiveLock(
  key: string,
  task: () => Promise<AdaptiveResult>,
): Promise<AdaptiveResult> {
  const existing = adaptiveInFlight.get(key)
  if (existing) return existing
  let promise: Promise<AdaptiveResult>
  promise = task().finally(() => {
    if (adaptiveInFlight.get(key) === promise) adaptiveInFlight.delete(key)
  })
  adaptiveInFlight.set(key, promise)
  return promise
}

function turnToAdaptiveQuestion(
  turn: TurnRow,
  source: 'ai' | 'existing',
): AdaptiveQuestionPayload {
  return {
    questionIndex: turn.question_index,
    questionText: turn.question_text ?? '',
    category: turn.question_topic ?? turn.question_key ?? 'Adaptive',
    difficulty:
      turn.question_difficulty === 'easy' ||
      turn.question_difficulty === 'medium' ||
      turn.question_difficulty === 'hard'
        ? turn.question_difficulty
        : null,
    topic: turn.question_topic ?? null,
    rationale: turn.generation_rationale ?? null,
    source,
  }
}

// POST /api/interviews/:id/turns/:index/next-question
//
// Evaluates the stored answer and, when the configured question limit has not
// been reached, generates and persists the next question. The provider is never
// given the request body as the question/answer. A generation failure still
// returns the evaluation with `nextQuestion: null`, so the client can use its
// prepared fallback question and keep the interview moving.
export async function adaptiveNextQuestionHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const sessionId = routeId(req)
  if (!isUuid(sessionId)) {
    sendError(res, 400, 'invalid_id', 'A valid session id is required.')
    return
  }

  const parsed = validateEvaluationRequest(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  const rawIndex = routeIndex(req)
  if (typeof rawIndex !== 'string' || !INDEX_RE.test(rawIndex)) {
    sendError(res, 400, 'invalid_index', 'A valid question index is required.')
    return
  }
  const questionIndex = Number(rawIndex)

  const { data: sessionData, error: sessionError } = await getOwnSession(client, sessionId, auth.userId)
  if (sessionError) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview session.')
    return
  }
  if (!sessionData) {
    sendError(res, 404, 'interview_not_found', 'Interview session not found.')
    return
  }

  const { data: turnData, error: turnError } = await getTurn(client, sessionId, questionIndex)
  if (turnError) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview answer.')
    return
  }
  if (!turnData) {
    sendError(res, 404, 'interview_turn_not_found', 'No answer was found for this question.')
    return
  }

  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Interview storage is not configured.')
    return
  }

  const session = sessionData as unknown as SessionRow
  const turn = turnData as unknown as TurnRow
  const questionCount = resolveQuestionCount(asConfigObject(session.config).questionCount)
  const nextIndex = questionIndex + 1
  const answerHash = hashAnswer(turn.answer_text ?? '')
  const currentDifficulty =
    normalizeQuestionDifficulty(turn.question_difficulty ?? session.difficulty) ??
    (session.difficulty === 'Mixed' ? 'medium' : null)

  const { data: allTurnData } = await listTurns(client, sessionId)
  const allTurns = (allTurnData ?? []) as unknown as TurnRow[]
  const history: AdaptiveQuestionHistoryTurn[] = allTurns
    .filter((item) => item.question_index < questionIndex)
    .sort((a, b) => a.question_index - b.question_index)
    .map((item) => ({
      questionText: item.question_text ?? '',
      answerText: item.answer_text ?? '',
      topic: item.question_topic ?? null,
    }))

  try {
    const result = await withAdaptiveLock(`${sessionId}:${questionIndex}`, async () => {
      const evaluationPromise = evaluateStoredTurn(client, writer, session, turn, false).catch((err) => {
        console.error(
          `[mockmate-backend] adaptive evaluation failed: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        )
        return {
          evaluation: failedEvaluation(
            sessionId,
            questionIndex,
            'Answer evaluation failed. Please try again.',
            true,
          ),
          persisted: false,
        }
      })

      // Evaluate BEFORE choosing the next question: the validated verdict,
      // missing concepts and factual errors are the adaptive signal. A provider
      // failure still produces an explicit failed evaluation (never a fake
      // score) and the next question falls back to a neutral strategy.
      const outcome = await evaluationPromise
      const evaluation = { ...outcome.evaluation, persisted: outcome.persisted }

      if (nextIndex >= questionCount) {
        return {
          evaluation,
          nextQuestion: null,
          complete: true,
          questionCount,
          generation: {
            status: 'not_requested' as const,
            persisted: false,
            retryable: false,
          },
        }
      }

      const { data: existingNextData, error: existingNextError } = await getTurn(
        client,
        sessionId,
        nextIndex,
      )
      if (existingNextError) {
        console.error(
          `[mockmate-backend] adaptive next-turn lookup failed: ${existingNextError.message ?? 'unknown'}`,
        )
      }
      const existingNext = existingNextData as unknown as TurnRow | null

      if (existingNext) {
        const sameSource =
          existingNext.generation_source_answer_hash === answerHash &&
          existingNext.question_source === 'ai'
        if (
          shouldReuseNextQuestion(
            {
              answerText: existingNext.answer_text,
              questionSource: existingNext.question_source,
              generationSourceAnswerHash: existingNext.generation_source_answer_hash,
            },
            answerHash,
          )
        ) {
          return {
            evaluation,
            nextQuestion: turnToAdaptiveQuestion(existingNext, sameSource ? 'ai' : 'existing'),
            complete: false,
            questionCount,
            generation: {
              status: 'existing' as const,
              persisted: true,
              retryable: false,
            },
          }
        }
      }

      const generateAfterEvaluation = async (): Promise<{
        question: AdaptiveQuestionPayload | null
        generation: AdaptiveGenerationState
      }> => {
        try {
          const generated = await generateNextQuestion({
            interviewType: session.interview_type,
            mode: session.mode ?? null,
            difficulty: session.difficulty ?? null,
            experience: session.experience ?? null,
            targetRole: session.target_role ?? null,
            targetCompany: session.target_company ?? null,
            language: session.language ?? null,
            questionIndex: nextIndex,
            questionCount,
            questionText: turn.question_text ?? '',
            answerText: turn.answer_text ?? '',
            currentDifficulty,
            evaluation: {
              correctnessVerdict: outcome.evaluation.correctnessVerdict,
              correctnessScore: outcome.evaluation.correctnessScore,
              overallScore: outcome.evaluation.score,
              summary: outcome.evaluation.summary,
              keyConceptsMissing: outcome.evaluation.keyConceptsMissing,
              factualErrors: outcome.evaluation.factualErrors,
              improvementAdvice: outcome.evaluation.improvementAdvice,
            },
            history,
          })

          const { data: saved, error: saveError } = await upsertTurn(writer, {
            session_id: sessionId,
            question_index: nextIndex,
            question_text: generated.questionText,
            question_key: generated.category,
            answer_text: '',
            spoken_seconds: 0,
            question_source: 'ai',
            question_difficulty: generated.difficulty,
            question_topic: generated.topic ?? generated.category,
            generation_source_answer_hash: answerHash,
            generation_rationale: generated.rationale,
          })
          if (saveError) {
            console.error(
              `[mockmate-backend] adaptive question save failed: ${saveError.message ?? saveError.code ?? 'unknown'}`,
            )
          }
          const savedTurn = saved as unknown as TurnRow | null
          return {
            question: {
              questionIndex: nextIndex,
              questionText: generated.questionText,
              category: generated.category,
              difficulty: generated.difficulty,
              topic: generated.topic,
              rationale: generated.rationale || null,
              source: 'ai',
            },
            generation: {
              status: 'generated',
              persisted: !saveError && Boolean(savedTurn),
              retryable: false,
            },
          }
        } catch (err) {
          if (err instanceof GroqError) {
            const retryable = err.status === 429 || err.status === 504 || err.status === 502
            return {
              question: null,
              generation: {
                status: 'unavailable',
                persisted: false,
                retryable,
                note: err.message,
              },
            }
          }
          console.error(
            `[mockmate-backend] adaptive question generation failed: ${
              err instanceof Error ? err.message : 'unknown error'
            }`,
          )
          return {
            question: null,
            generation: {
              status: 'unavailable',
              persisted: false,
              retryable: true,
              note: 'Could not generate the next question. Your prepared question will be used.',
            },
          }
        }
      }

      const generated = await generateAfterEvaluation()
      return {
        evaluation,
        nextQuestion: generated.question,
        complete: false,
        questionCount,
        generation: generated.generation,
      }
    })

    res.status(200).json(result)
  } catch {
    sendError(res, 502, 'adaptive_question_failed', 'Could not prepare the next question.')
  }
}
