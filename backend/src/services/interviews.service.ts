import type { SupabaseClient } from '@supabase/supabase-js'

// Interview session persistence.
//
// Explicit column lists so a future `*` never leaks internal fields. Column
// names are snake_case; the response mappers convert to the camelCase shape the
// browser consumes, matching the jobs/applications services.

export const SESSION_COLUMNS =
  'id, student_id, interview_type, mode, difficulty, experience, target_role, ' +
  'target_company, language, status, overall_score, skill_scores, strengths, ' +
  'improvement_areas, config, client_session_id, started_at, completed_at, created_at'

export const TURN_COLUMNS =
  'id, session_id, question_index, question_text, question_key, answer_text, ' +
  'spoken_seconds, question_source, question_difficulty, question_topic, ' +
  'generation_source_answer_hash, generation_rationale, created_at, updated_at'

export const EVALUATION_COLUMNS =
  'id, session_id, question_index, status, score, summary, strengths, improvements, ' +
  'suggested_answer, criteria, model, answer_hash, correctness_verdict, correctness_score, ' +
  'key_concepts_covered, key_concepts_missing, factual_errors, expected_answer, ' +
  'improvement_advice, confidence, evaluated_at, created_at, updated_at'

// Columns present before the adaptive-questions migration. Keeping this list
// lets evaluation writes still persist the score in an environment where the
// later additive migration has not been applied yet.
export const BASE_EVALUATION_COLUMNS =
  'id, session_id, question_index, status, score, summary, strengths, improvements, ' +
  'suggested_answer, criteria, model, answer_hash, evaluated_at, created_at, updated_at'

const BASE_EVALUATION_PATCH_KEYS = new Set([
  'session_id',
  'question_index',
  'status',
  'score',
  'summary',
  'strengths',
  'improvements',
  'suggested_answer',
  'criteria',
  'model',
  'answer_hash',
  'evaluated_at',
])

let evaluationOptionalColumnsMissing = false

function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

function baseEvaluationPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (BASE_EVALUATION_PATCH_KEYS.has(key)) base[key] = value
  }
  return base
}

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned'

export const SESSION_STATUSES: SessionStatus[] = ['in_progress', 'completed', 'abandoned']

export interface SessionRow {
  id: string
  student_id: string
  interview_type: string
  mode: string | null
  difficulty: string | null
  experience: string | null
  target_role: string | null
  target_company: string | null
  language: string | null
  status: string
  overall_score: number | string | null
  skill_scores: unknown
  strengths: string[] | null
  improvement_areas: string[] | null
  config: unknown
  client_session_id: string | null
  started_at: string
  completed_at: string | null
  created_at: string
}

export type QuestionSource = 'static' | 'ai'
export type QuestionDifficulty = 'easy' | 'medium' | 'hard'

export interface TurnRow {
  id: string
  session_id: string
  question_index: number
  question_text: string
  question_key: string | null
  answer_text: string
  spoken_seconds: number
  question_source: string | null
  question_difficulty: string | null
  question_topic: string | null
  generation_source_answer_hash: string | null
  generation_rationale: string | null
  created_at: string
  updated_at: string
}

export type EvaluationStatus = 'evaluated' | 'unanswered' | 'insufficient_information' | 'failed'

export const EVALUATION_STATUSES: EvaluationStatus[] = [
  'evaluated',
  'unanswered',
  'insufficient_information',
  'failed',
]

export interface EvaluationRow {
  id: string
  session_id: string
  question_index: number
  status: string
  score: number | string | null
  summary: string
  strengths: string[] | null
  improvements: string[] | null
  suggested_answer: string
  criteria: unknown
  model: string | null
  answer_hash: string | null
  correctness_verdict: string | null
  correctness_score: number | string | null
  key_concepts_covered: string[] | null
  key_concepts_missing: string[] | null
  factual_errors: string[] | null
  expected_answer: string | null
  improvement_advice: string | null
  confidence: number | string | null
  evaluated_at: string | null
  created_at: string
  updated_at: string
}

export interface InterviewSessionResponse {
  id: string
  studentId: string
  interviewType: string
  mode: string | null
  difficulty: string | null
  experience: string | null
  targetRole: string | null
  targetCompany: string | null
  language: string | null
  status: SessionStatus
  overallScore: number | null
  config: Record<string, unknown>
  clientSessionId: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
}

export interface InterviewTurnResponse {
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

export interface EvaluationCriterionResponse {
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

export interface InterviewEvaluationResponse {
  sessionId: string
  questionIndex: number
  status: EvaluationStatus
  score: number | null
  summary: string
  strengths: string[]
  improvements: string[]
  suggestedAnswer: string
  criteria: EvaluationCriterionResponse[]
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
}

export function asSessionStatus(value: string): SessionStatus {
  return SESSION_STATUSES.includes(value as SessionStatus) ? (value as SessionStatus) : 'in_progress'
}

function asConfig(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function mapSessionRow(row: SessionRow): InterviewSessionResponse {
  return {
    id: row.id,
    studentId: row.student_id,
    interviewType: row.interview_type,
    mode: row.mode ?? null,
    difficulty: row.difficulty ?? null,
    experience: row.experience ?? null,
    targetRole: row.target_role ?? null,
    targetCompany: row.target_company ?? null,
    language: row.language ?? null,
    status: asSessionStatus(row.status),
    overallScore: row.overall_score === null || row.overall_score === undefined
      ? null
      : Number(row.overall_score),
    config: asConfig(row.config),
    clientSessionId: row.client_session_id ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
  }
}

function asQuestionSource(value: string | null): QuestionSource {
  return value === 'ai' ? 'ai' : 'static'
}

function asQuestionDifficulty(value: string | null): QuestionDifficulty | null {
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : null
}

function asOptionalText(value: string | null): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function mapTurnRow(row: TurnRow): InterviewTurnResponse {
  return {
    id: row.id,
    sessionId: row.session_id,
    questionIndex: row.question_index,
    questionText: row.question_text ?? '',
    questionKey: row.question_key ?? null,
    answerText: row.answer_text ?? '',
    spokenSeconds: Number(row.spoken_seconds ?? 0),
    questionSource: asQuestionSource(row.question_source),
    questionDifficulty: asQuestionDifficulty(row.question_difficulty),
    questionTopic: asOptionalText(row.question_topic),
    generationRationale: asOptionalText(row.generation_rationale),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function asEvaluationStatus(value: string): EvaluationStatus {
  return EVALUATION_STATUSES.includes(value as EvaluationStatus)
    ? (value as EvaluationStatus)
    : 'failed'
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

// Criteria are stored as jsonb; re-validate on read so a hand-edited row can
// never inject an unexpected shape into the API response.
function asEvaluationCriteria(value: unknown): EvaluationCriterionResponse[] {
  if (!Array.isArray(value)) return []
  const out: EvaluationCriterionResponse[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const criterion = typeof rec.criterion === 'string' ? rec.criterion : ''
    if (!criterion) continue
    const score = typeof rec.score === 'number' && Number.isFinite(rec.score) ? rec.score : null
    const maxScore = typeof rec.maxScore === 'number' && Number.isFinite(rec.maxScore) ? rec.maxScore : null
    out.push({
      criterion,
      score,
      maxScore,
      feedback: typeof rec.feedback === 'string' ? rec.feedback : '',
    })
  }
  return out
}

export type CorrectnessVerdictResponse = CorrectnessVerdict

function asCorrectnessVerdict(value: string | null): CorrectnessVerdict | null {
  return value === 'correct' ||
    value === 'mostly_correct' ||
    value === 'partially_correct' ||
    value === 'incorrect' ||
    value === 'insufficient_information' ||
    value === 'not_applicable'
    ? value
    : null
}

function asNullableNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function mapEvaluationRow(row: EvaluationRow): InterviewEvaluationResponse {
  const status = asEvaluationStatus(row.status)
  const evaluated = status === 'evaluated'
  return {
    sessionId: row.session_id,
    questionIndex: row.question_index,
    status,
    // A score is only surfaced when it is a real number AND the status claims a
    // real evaluation. Otherwise it stays null.
    score: evaluated ? asNullableNumber(row.score) : null,
    summary: row.summary ?? '',
    strengths: asStringList(row.strengths),
    improvements: asStringList(row.improvements),
    suggestedAnswer: row.suggested_answer ?? '',
    criteria: asEvaluationCriteria(row.criteria),
    correctnessVerdict:
      status === 'failed' ? null : asCorrectnessVerdict(row.correctness_verdict),
    correctnessScore: evaluated ? asNullableNumber(row.correctness_score) : null,
    keyConceptsCovered: asStringList(row.key_concepts_covered),
    keyConceptsMissing: asStringList(row.key_concepts_missing),
    factualErrors: asStringList(row.factual_errors),
    expectedAnswer: row.expected_answer ?? '',
    improvementAdvice: row.improvement_advice ?? '',
    confidence: evaluated ? asNullableNumber(row.confidence) : null,
    model: row.model ?? null,
    evaluatedAt: row.evaluated_at ?? null,
    updatedAt: row.updated_at,
  }
}

// ── Session operations ──────────────────────────────────────────
// Every helper is filtered by `student_id` from the verified auth context. RLS
// on `interview_sessions` independently restricts the same rows, so this is
// defence in depth rather than the sole guarantee.

export async function createSession(client: SupabaseClient, patch: Record<string, unknown>) {
  return client.from('interview_sessions').insert(patch).select(SESSION_COLUMNS).single()
}

export async function findSessionByClientId(
  client: SupabaseClient,
  studentId: string,
  clientSessionId: string,
) {
  return client
    .from('interview_sessions')
    .select(SESSION_COLUMNS)
    .eq('student_id', studentId)
    .eq('client_session_id', clientSessionId)
    .maybeSingle()
}

export async function listOwnSessions(client: SupabaseClient, studentId: string) {
  return client
    .from('interview_sessions')
    .select(SESSION_COLUMNS)
    .eq('student_id', studentId)
    .order('started_at', { ascending: false })
}

export async function getOwnSession(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
) {
  return client
    .from('interview_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()
}

export async function updateOwnSession(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
  patch: Record<string, unknown>,
) {
  return client
    .from('interview_sessions')
    .update(patch)
    .eq('id', sessionId)
    .eq('student_id', studentId)
    .select(SESSION_COLUMNS)
    .maybeSingle()
}

// ── Turn operations ─────────────────────────────────────────────

export async function listTurns(client: SupabaseClient, sessionId: string) {
  return client
    .from('interview_turns')
    .select(TURN_COLUMNS)
    .eq('session_id', sessionId)
    .order('question_index', { ascending: true })
}

// Upsert on (session_id, question_index): retrying the same turn overwrites the
// existing row instead of appending a duplicate.
export async function upsertTurn(client: SupabaseClient, patch: Record<string, unknown>) {
  return client
    .from('interview_turns')
    .upsert(patch, { onConflict: 'session_id,question_index' })
    .select(TURN_COLUMNS)
    .single()
}

// Detects a Postgres unique-violation (SQLSTATE 23505) so a retried create can
// fall back to returning the already-created row.
export function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message ?? '')
}

// ── Evaluation operations ───────────────────────────────────────
// Evaluations live in their own table, so these helpers are the only place that
// touches `interview_turn_evaluations`. Callers tolerate a missing table (a
// pre-migration environment) rather than failing the whole report.

export async function getTurn(
  client: SupabaseClient,
  sessionId: string,
  questionIndex: number,
) {
  return client
    .from('interview_turns')
    .select(TURN_COLUMNS)
    .eq('session_id', sessionId)
    .eq('question_index', questionIndex)
    .maybeSingle()
}

export async function listEvaluations(client: SupabaseClient, sessionId: string) {
  return client
    .from('interview_turn_evaluations')
    .select(EVALUATION_COLUMNS)
    .eq('session_id', sessionId)
    .order('question_index', { ascending: true })
}

export async function getEvaluation(
  client: SupabaseClient,
  sessionId: string,
  questionIndex: number,
) {
  return client
    .from('interview_turn_evaluations')
    .select(EVALUATION_COLUMNS)
    .eq('session_id', sessionId)
    .eq('question_index', questionIndex)
    .maybeSingle()
}

// Upsert on (session_id, question_index): re-evaluating overwrites the previous
// result instead of appending a duplicate.
export async function upsertEvaluation(client: SupabaseClient, patch: Record<string, unknown>) {
  const full = await client
    .from('interview_turn_evaluations')
    .upsert(patch, { onConflict: 'session_id,question_index' })
    .select(EVALUATION_COLUMNS)
    .single()

  if (!isMissingColumn(full.error)) return full

  // The adaptive-questions migration adds optional correctness columns. If it
  // has not been applied yet, persist the base evaluation (including the score)
  // rather than dropping the whole evaluation. This keeps the saved report and
  // Analytics average working; applying the migration later adds the detail.
  if (!evaluationOptionalColumnsMissing) {
    evaluationOptionalColumnsMissing = true
    console.warn(
      '[mockmate-backend] optional evaluation columns are unavailable; saving the base score only. ' +
        'Apply migration 20260108000000_interview_adaptive_questions.sql to store correctness details.',
    )
  }

  return client
    .from('interview_turn_evaluations')
    .upsert(baseEvaluationPatch(patch), { onConflict: 'session_id,question_index' })
    .select(BASE_EVALUATION_COLUMNS)
    .single()
}
