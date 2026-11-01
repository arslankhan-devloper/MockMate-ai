// Validation for the interview-persistence feature.
//
// The client is UNTRUSTED input. Every field a session can carry is type-checked,
// length-limited and, where relevant, restricted to a known set before it is
// written. Fields the server owns (ids, timestamps, score columns, `status` on
// create) are rejected explicitly so a client bug or an attempted privilege
// change can never be silently accepted.

import { SESSION_STATUSES, type SessionStatus } from '../services/interviews.service.js'
import { validateInterviewAnalysis } from './interviewAnalysisValidation.js'
import { MAX_QUESTION_COUNT, MIN_QUESTION_COUNT } from './interviewQuestionValidation.js'

export type FieldErrors = Record<string, string>

export type InterviewValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string; fields: FieldErrors }

const INTERVIEW_TYPES = new Set([
  'technical',
  'hr',
  'aptitude',
  'coding',
  'mechanical',
  'electronics',
  'management',
  'civil',
  'general',
])
const MODES = new Set(['technical', 'hr', 'aptitude', 'resume'])
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard', 'Mixed'])
// English is the only supported interview language. Requests that try to
// enable a removed language are rejected instead of silently downgraded.
const LANGUAGES = new Set(['en'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INDEX_RE = /^\d+$/

const MAX_LABEL = 120
const MAX_ROLE = 120
const MAX_COMPANY = 120
const MAX_EXPERIENCE = 60
const MAX_QUESTION_TEXT = 1000
const MAX_QUESTION_KEY = 80
const MAX_ANSWER_TEXT = 8000
const MAX_SPOKEN_SECONDS = 24 * 60 * 60

// Columns the server owns. A client may never set these on create or update.
const PROTECTED_FIELDS = new Set([
  'id',
  'studentId',
  'student_id',
  'status',
  'config',
  'startedAt',
  'started_at',
  'completedAt',
  'completed_at',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
  'overallScore',
  'overall_score',
  'skillScores',
  'skill_scores',
  'strengths',
  'improvementAreas',
  'improvement_areas',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOptionalText(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  fields: FieldErrors,
): string | null {
  const raw = body[key]
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') {
    fields[key] = `Must be text of at most ${maxLength} characters.`
    return null
  }
  const trimmed = raw.trim()
  if (trimmed.length > maxLength) {
    fields[key] = `Must be at most ${maxLength} characters.`
    return null
  }
  return trimmed === '' ? null : trimmed
}

function readOptionalEnum(
  body: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
  fields: FieldErrors,
): string | null {
  const raw = body[key]
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string' || !allowed.has(raw)) {
    fields[key] = 'Not one of the allowed values.'
    return null
  }
  return raw
}

// Validate a POST /api/interviews body and produce the database patch (minus the
// server-owned `student_id`, which the controller sets from the verified token).
export function validateCreateSession(body: unknown): InterviewValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  const fields: FieldErrors = {}

  for (const key of Object.keys(body)) {
    if (PROTECTED_FIELDS.has(key)) {
      fields[key] = 'This field is managed by the system and cannot be set here.'
    }
  }

  // interviewType defaults to 'technical' when omitted; when present it must be
  // one of the known domains.
  let interviewType = 'technical'
  if (body.interviewType !== undefined && body.interviewType !== null) {
    if (typeof body.interviewType !== 'string' || !INTERVIEW_TYPES.has(body.interviewType)) {
      fields.interviewType = 'Unknown interview type.'
    } else {
      interviewType = body.interviewType
    }
  }

  const mode = readOptionalEnum(body, 'mode', MODES, fields)
  const difficulty = readOptionalEnum(body, 'difficulty', DIFFICULTIES, fields)
  const language = readOptionalEnum(body, 'language', LANGUAGES, fields)
  const experience = readOptionalText(body, 'experience', MAX_EXPERIENCE, fields)
  const role = readOptionalText(body, 'role', MAX_ROLE, fields)
  const company = readOptionalText(body, 'company', MAX_COMPANY, fields)
  const typeLabel = readOptionalText(body, 'typeLabel', MAX_LABEL, fields)
  const modeLabel = readOptionalText(body, 'modeLabel', MAX_LABEL, fields)
  const languageLabel = readOptionalText(body, 'languageLabel', MAX_LABEL, fields)
  const branch = readOptionalText(body, 'branch', MAX_LABEL, fields)
  const subject = readOptionalText(body, 'subject', MAX_LABEL, fields)

  let questionCount: number | null = null
  if (body.questionCount !== undefined && body.questionCount !== null) {
    const raw = body.questionCount
    const parsed =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && raw.trim() !== ''
          ? Number(raw)
          : Number.NaN
    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_QUESTION_COUNT ||
      parsed > MAX_QUESTION_COUNT
    ) {
      fields.questionCount = `Must be a whole number between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}.`
    } else {
      questionCount = parsed
    }
  }

  // Optional idempotency key.
  let clientSessionId: string | null = null
  if (body.clientSessionId !== undefined && body.clientSessionId !== null) {
    if (typeof body.clientSessionId !== 'string' || !UUID_RE.test(body.clientSessionId.trim())) {
      fields.clientSessionId = 'Must be a UUID.'
    } else {
      clientSessionId = body.clientSessionId.trim().toLowerCase()
    }
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }

  // Reconstruction config: only the values that were actually provided.
  const config: Record<string, unknown> = { type: interviewType }
  const put = (key: string, value: string | null): void => {
    if (value !== null) config[key] = value
  }
  put('typeLabel', typeLabel)
  if (mode !== null) config.mode = mode
  put('modeLabel', modeLabel)
  if (difficulty !== null) config.difficulty = difficulty
  put('experience', experience)
  put('role', role)
  put('company', company)
  if (language !== null) config.language = language
  put('languageLabel', languageLabel)
  put('branch', branch)
  put('subject', subject)
  if (questionCount !== null) config.questionCount = questionCount

  return {
    ok: true,
    value: {
      interview_type: interviewType,
      mode,
      difficulty,
      experience,
      target_role: role,
      target_company: company,
      language,
      config,
      client_session_id: clientSessionId,
    },
  }
}

// Validate a PATCH /api/interviews/:id body. Status is required when finalizing
// a session; `analysis` is an optional, bounded summary of on-device signals.
export function validateSessionUpdate(body: unknown): InterviewValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  const fields: FieldErrors = {}
  let status: SessionStatus | null = null
  let analysis: Record<string, unknown> | null = null

  for (const key of Object.keys(body)) {
    if (key === 'status' || key === 'analysis') continue
    if (PROTECTED_FIELDS.has(key)) {
      fields[key] = 'This field is managed by the system and cannot be set here.'
    } else {
      fields[key] = 'Unknown field.'
    }
  }

  if ('status' in body) {
    const raw = body.status
    if (typeof raw !== 'string' || !SESSION_STATUSES.includes(raw as SessionStatus)) {
      fields.status = 'Status must be in_progress, completed or abandoned.'
    } else {
      status = raw as SessionStatus
    }
  }

  if ('analysis' in body && body.analysis !== undefined && body.analysis !== null) {
    const parsed = validateInterviewAnalysis(body.analysis)
    if (!parsed.ok) fields.analysis = parsed.message
    else analysis = parsed.value
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }
  if (status === null) {
    return { ok: false, message: 'No updatable fields were provided.', fields: {} }
  }

  return { ok: true, value: { status, ...(analysis ? { analysis } : {}) } }
}

const TURN_FIELDS = new Set(['questionText', 'questionKey', 'answerText', 'spokenSeconds'])

// Validate a PUT /api/interviews/:id/turns/:index body. The question index comes
// from the URL, so a body-supplied index is rejected rather than silently used.
export function validateTurnUpsert(body: unknown, rawIndex: unknown): InterviewValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  const fields: FieldErrors = {}

  const index =
    typeof rawIndex === 'string' && INDEX_RE.test(rawIndex) ? Number(rawIndex) : Number.NaN
  if (!Number.isInteger(index) || index < 0) {
    return {
      ok: false,
      message: 'A valid question index is required.',
      fields: { index: 'Question index must be a whole number of 0 or more.' },
    }
  }

  if ('questionIndex' in body) {
    fields.questionIndex = 'The question index is taken from the URL path.'
  }
  for (const key of Object.keys(body)) {
    if (TURN_FIELDS.has(key) || key === 'questionIndex') continue
    if (PROTECTED_FIELDS.has(key) || key === 'id' || key === 'sessionId' || key === 'session_id') {
      fields[key] = 'This field is managed by the system and cannot be set here.'
    } else {
      fields[key] = 'Unknown field.'
    }
  }

  const questionText = readOptionalText(body, 'questionText', MAX_QUESTION_TEXT, fields) ?? ''
  const questionKey = readOptionalText(body, 'questionKey', MAX_QUESTION_KEY, fields)
  const answerText = readOptionalText(body, 'answerText', MAX_ANSWER_TEXT, fields) ?? ''

  let spokenSeconds = 0
  if (body.spokenSeconds !== undefined && body.spokenSeconds !== null) {
    const raw = body.spokenSeconds
    const value =
      typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
    if (!Number.isInteger(value) || value < 0 || value > MAX_SPOKEN_SECONDS) {
      fields.spokenSeconds = `Must be a whole number between 0 and ${MAX_SPOKEN_SECONDS}.`
    } else {
      spokenSeconds = value
    }
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }

  return {
    ok: true,
    value: {
      question_index: index,
      question_text: questionText,
      question_key: questionKey,
      answer_text: answerText,
      spoken_seconds: spokenSeconds,
    },
  }
}
