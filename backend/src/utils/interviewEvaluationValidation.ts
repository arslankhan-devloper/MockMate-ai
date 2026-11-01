// Validation + normalisation for interview answer evaluation (Item 4).
//
// Three responsibilities:
//   1. Validate the small client request body that triggers an evaluation.
//   2. Deterministically classify empty / too-short answers BEFORE any provider
//      call, so an absent answer can never receive an invented score.
//   3. Normalise the model's JSON. The model is UNTRUSTED input: every field is
//      type-checked, length-limited and range-checked. Invalid scores or an
//      incomplete "evaluated" result are rejected outright rather than repaired
//      into a plausible-looking score.
//
// Scoring rubric (documented here because the score is defined here):
//   * Four criteria, each scored 0-25. The overall `score` is their sum on a
//     0-100 scale, so technical and behavioural answers stay comparable even
//     though the criterion NAMES differ between the two profiles.
//   * TECHNICAL  profile criteria: Correctness, Relevance, Completeness, Clarity.
//   * BEHAVIORAL profile criteria: Relevance, Structure, Specificity, Clarity.
//   Which profile applies is decided server-side from the session's domain/mode
//   (HR => behavioural, everything else => technical), never by the model.

import { createHash } from 'node:crypto'

export type EvaluationStatus = 'evaluated' | 'unanswered' | 'insufficient_information' | 'failed'

export type CorrectnessVerdict =
  | 'correct'
  | 'mostly_correct'
  | 'partially_correct'
  | 'incorrect'
  | 'insufficient_information'
  | 'not_applicable'

export const CORRECTNESS_VERDICTS: CorrectnessVerdict[] = [
  'correct',
  'mostly_correct',
  'partially_correct',
  'incorrect',
  'insufficient_information',
  'not_applicable',
]

export interface EvaluationCriterion {
  criterion: string
  score: number | null
  maxScore: number | null
  feedback: string
}

export interface NormalizedEvaluation {
  status: 'evaluated' | 'insufficient_information'
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
}

export type EvaluationProfile = 'technical' | 'behavioral'

export const TECHNICAL_CRITERIA = ['Correctness', 'Relevance', 'Completeness', 'Clarity'] as const
export const BEHAVIORAL_CRITERIA = ['Relevance', 'Structure', 'Specificity', 'Clarity'] as const

export const MIN_ANSWER_WORDS = 3

// Prompt sizes. The persisted answer is already capped at 8000 chars; the prompt
// cap is smaller again so a single evaluation cannot blow up the request.
export const MAX_PROMPT_ANSWER_CHARS = 6000
export const MAX_PROMPT_QUESTION_CHARS = 1000

const MAX_SUMMARY = 1200
const MAX_ITEM = 320
const MAX_ITEMS = 8
const MAX_SUGGESTED = 2400
const MAX_FEEDBACK = 400
const MAX_CRITERIA = 8
const MAX_CRITERION_NAME = 80
const MAX_EXPECTED_ANSWER = 2400
const MAX_IMPROVEMENT_ADVICE = 800

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

// ── Request validation ──────────────────────────────────────────

export interface EvaluationRequest {
  ok: true
  force: boolean
}

export type EvaluationRequestResult = EvaluationRequest | { ok: false; message: string; fields: Record<string, string> }

// The evaluation endpoint takes no content from the client: the question and
// answer are read from the authorised, persisted turn. The only accepted field
// is `force`, which makes an explicit re-evaluation (overwriting an existing
// result) visible and intentional rather than an accident of double-clicking.
export function validateEvaluationRequest(body: unknown): EvaluationRequestResult {
  if (body === undefined || body === null) return { ok: true, force: false }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  const fields: Record<string, string> = {}
  let force = false
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key === 'force') {
      if (value === undefined || value === null) continue
      if (typeof value !== 'boolean') {
        fields.force = 'force must be true or false.'
      } else {
        force = value
      }
    } else {
      fields[key] = 'Unknown field.'
    }
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }
  return { ok: true, force }
}

// ── Deterministic answer classification ─────────────────────────

export function isAnswerEmpty(answer: string): boolean {
  return answer.trim().length === 0
}

// A non-empty but extremely short answer (fewer than MIN_ANSWER_WORDS words) is
// reported as insufficient information without asking the model, so the result
// is reproducible and no score is invented.
export function isAnswerTooShort(answer: string): boolean {
  const words = answer.trim().split(/\s+/).filter(Boolean)
  return words.length > 0 && words.length < MIN_ANSWER_WORDS
}

// Content hash used to detect whether a stored evaluation still matches the
// answer it was produced from. Whitespace is normalised so formatting-only
// edits do not invalidate a result.
export function hashAnswer(answer: string): string {
  const normalized = answer.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').trim()
  return createHash('sha256').update(normalized).digest('hex')
}

// ── Model response normalisation ────────────────────────────────

function asTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = asTrimmedString(item, MAX_ITEM)
    if (text && !out.includes(text)) out.push(text)
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

function asCriteria(value: unknown): EvaluationCriterion[] {
  if (!Array.isArray(value)) return []
  const out: EvaluationCriterion[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const criterion = asTrimmedString(rec.criterion ?? rec.name ?? rec.label, MAX_CRITERION_NAME)
    if (!criterion) continue

    const rawMax = asNumber(rec.maxScore ?? rec.max_score ?? rec.max)
    const maxScore = rawMax === null ? 25 : Math.max(1, Math.min(100, Math.round(rawMax)))

    const rawScore = asNumber(rec.score)
    let score: number | null = null
    if (rawScore !== null) {
      score = Math.max(0, Math.min(maxScore, Math.round(rawScore)))
    }

    const feedback = asTrimmedString(rec.feedback ?? rec.comment ?? rec.detail, MAX_FEEDBACK) ?? ''
    out.push({ criterion, score, maxScore, feedback })
    if (out.length >= MAX_CRITERIA) break
  }
  return out
}

function asCorrectnessObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asCorrectnessVerdict(value: unknown): CorrectnessVerdict | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return CORRECTNESS_VERDICTS.includes(normalized as CorrectnessVerdict)
    ? (normalized as CorrectnessVerdict)
    : null
}

function asConfidence(value: unknown): number | null {
  const parsed = asNumber(value)
  if (parsed === null || parsed < 0) return null
  const normalized = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed
  if (normalized < 0 || normalized > 1) return null
  return Math.round(normalized * 100) / 100
}

// Turn an untrusted parsed JSON value into a safe NormalizedEvaluation.
// Returns null when the response must be treated as a provider failure:
//   * the status is not one the model is allowed to assert,
//   * an "evaluated" result has no summary, no criteria, or an out-of-range
//     score (a missing/invalid score is NEVER defaulted to a number),
//   * a technical result has no defensible correctness verdict and score.
//
// Behavioural answers are not factual claims, so their correctness is always
// marked not_applicable by the server rather than asking the model to grade a
// candidate's personal experience as right or wrong.
export function normalizeEvaluation(
  raw: unknown,
  profile: EvaluationProfile = 'technical',
): NormalizedEvaluation | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>

  const statusRaw = typeof rec.status === 'string' ? rec.status.trim().toLowerCase() : ''
  // "unanswered" from the model is folded into insufficient_information: an empty
  // answer is classified server-side before the model is ever called.
  let status: NormalizedEvaluation['status']
  if (statusRaw === 'evaluated') status = 'evaluated'
  else if (statusRaw === 'insufficient_information' || statusRaw === 'unanswered') status = 'insufficient_information'
  else return null

  const summary = asTrimmedString(rec.summary ?? rec.assessment, MAX_SUMMARY) ?? ''
  if (!summary) return null

  const criteria = asCriteria(rec.criteria ?? rec.rubric ?? rec.breakdown)

  let score: number | null = null
  if (status === 'evaluated') {
    const rawScore = asNumber(rec.score)
    if (rawScore === null || rawScore < 0 || rawScore > 100) return null
    score = Math.round(rawScore)
    if (criteria.length === 0) return null
  }

  const correctnessRaw = asCorrectnessObject(
    rec.correctness ?? rec.correctnessAssessment ?? rec.correctness_assessment,
  )
  const verdictRaw =
    correctnessRaw?.verdict ?? rec.correctnessVerdict ?? rec.correctness_verdict
  const scoreRaw =
    correctnessRaw?.score ?? rec.correctnessScore ?? rec.correctness_score

  let correctnessVerdict: CorrectnessVerdict | null = null
  let correctnessScore: number | null = null

  if (status === 'evaluated') {
    if (profile === 'behavioral') {
      correctnessVerdict = 'not_applicable'
    } else {
      const verdict = asCorrectnessVerdict(verdictRaw)
      const parsedScore = asNumber(scoreRaw)
      if (
        !verdict ||
        verdict === 'not_applicable' ||
        verdict === 'insufficient_information' ||
        parsedScore === null ||
        parsedScore < 0 ||
        parsedScore > 100
      ) {
        return null
      }
      correctnessVerdict = verdict
      correctnessScore = Math.round(parsedScore)
    }
  } else {
    correctnessVerdict = 'insufficient_information'
  }

  const conceptsCovered =
    correctnessRaw?.keyConceptsCovered ??
    correctnessRaw?.key_concepts_covered ??
    rec.keyConceptsCovered ??
    rec.key_concepts_covered
  const conceptsMissing =
    correctnessRaw?.keyConceptsMissing ??
    correctnessRaw?.key_concepts_missing ??
    rec.keyConceptsMissing ??
    rec.key_concepts_missing
  const factualErrors =
    correctnessRaw?.factualErrors ??
    correctnessRaw?.factual_errors ??
    rec.factualErrors ??
    rec.factual_errors
  const expectedAnswer =
    correctnessRaw?.expectedAnswer ??
    correctnessRaw?.expected_answer ??
    rec.expectedAnswer ??
    rec.expected_answer
  const improvementAdvice =
    correctnessRaw?.improvementAdvice ??
    correctnessRaw?.improvement_advice ??
    rec.improvementAdvice ??
    rec.improvement_advice
  const confidenceRaw = correctnessRaw?.confidence ?? rec.confidence

  return {
    status,
    score,
    summary,
    strengths: asStringArray(rec.strengths ?? rec.keyStrengths ?? rec.key_strengths),
    improvements: asStringArray(rec.improvements ?? rec.weaknesses ?? rec.gaps),
    suggestedAnswer: asTrimmedString(rec.suggestedAnswer ?? rec.suggested_answer ?? rec.example, MAX_SUGGESTED) ?? '',
    criteria,
    correctnessVerdict,
    correctnessScore,
    keyConceptsCovered: asStringArray(conceptsCovered),
    keyConceptsMissing: asStringArray(conceptsMissing),
    factualErrors: asStringArray(factualErrors),
    expectedAnswer: asTrimmedString(expectedAnswer, MAX_EXPECTED_ANSWER) ?? '',
    improvementAdvice: asTrimmedString(improvementAdvice, MAX_IMPROVEMENT_ADVICE) ?? '',
    confidence: asConfidence(confidenceRaw),
  }
}
