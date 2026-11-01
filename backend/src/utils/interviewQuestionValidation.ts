// Validation and bounded configuration for adaptive interview questions.
//
// The model's question is untrusted input: it is length-limited, its difficulty
// is restricted to a known set, and it is rejected when it repeats an earlier
// question. Nothing from the client is used as the next question, so the
// generated text never becomes an instruction or an unbounded stored value.

export type QuestionDifficulty = 'easy' | 'medium' | 'hard'

export interface NormalizedQuestion {
  questionText: string
  category: string
  difficulty: QuestionDifficulty | null
  topic: string | null
  rationale: string
}

export const MIN_QUESTION_COUNT = 3
export const MAX_QUESTION_COUNT = 12
export const DEFAULT_QUESTION_COUNT = 8

const DIFFICULTY_ORDER: QuestionDifficulty[] = ['easy', 'medium', 'hard']

// Deterministic fallback for the next question's difficulty. The model may
// propose any difficulty, but the server uses this value so a correct answer
// actually gets a harder question and an incorrect answer gets a foundational
// one, regardless of provider consistency.
export function nextQuestionDifficulty(
  current: QuestionDifficulty | null,
  correctnessVerdict: string | null,
  correctnessScore: number | null,
  overallScore: number | null = null,
): QuestionDifficulty | null {
  if (!current) return null
  const index = DIFFICULTY_ORDER.indexOf(current)
  if (index < 0) return null

  if (
    correctnessVerdict === 'correct' ||
    correctnessVerdict === 'mostly_correct' ||
    (correctnessVerdict === 'not_applicable' &&
      ((correctnessScore ?? overallScore ?? 0) >= 80))
  ) {
    return DIFFICULTY_ORDER[Math.min(DIFFICULTY_ORDER.length - 1, index + 1)]
  }

  if (
    correctnessVerdict === 'incorrect' ||
    correctnessVerdict === 'insufficient_information' ||
    (correctnessScore ?? overallScore ?? 100) < 45
  ) {
    return DIFFICULTY_ORDER[Math.max(0, index - 1)]
  }

  return current
}

const MAX_QUESTION_TEXT = 1000
const MAX_CATEGORY = 80
const MAX_TOPIC = 120
const MAX_RATIONALE = 400
const SIMILARITY_THRESHOLD = 0.82

function asTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(value: string): Set<string> {
  return new Set(normalizeForComparison(value).split(' ').filter(Boolean))
}

// Exact repeats and near-copies (e.g. punctuation/word-order changes) are both
// rejected so a retry or a provider quirk cannot add the same question twice.
export function isDuplicateQuestion(candidate: string, priorQuestions: string[]): boolean {
  const normalized = normalizeForComparison(candidate)
  if (!normalized) return true
  const candidateWords = words(candidate)
  if (candidateWords.size === 0) return true

  for (const prior of priorQuestions) {
    const priorNormalized = normalizeForComparison(prior)
    if (!priorNormalized) continue
    if (normalized === priorNormalized) return true
    const priorWords = words(prior)
    let overlap = 0
    for (const word of candidateWords) if (priorWords.has(word)) overlap += 1
    const union = new Set([...candidateWords, ...priorWords]).size
    if (union > 0 && overlap / union >= SIMILARITY_THRESHOLD) return true
  }
  return false
}

export function normalizeQuestionDifficulty(value: unknown): QuestionDifficulty | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized === 'easy' || normalized === 'medium' || normalized === 'hard'
    ? normalized
    : null
}

// Convert the provider's JSON into a safe question. Returns null when the
// response is incomplete, too long, or repeats an earlier question.
export function normalizeGeneratedQuestion(
  raw: unknown,
  priorQuestions: string[] = [],
): NormalizedQuestion | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>

  const questionText = asTrimmedString(
    rec.question ?? rec.questionText ?? rec.question_text ?? rec.text,
    MAX_QUESTION_TEXT,
  )
  if (!questionText) return null
  if (isDuplicateQuestion(questionText, priorQuestions)) return null

  const category =
    asTrimmedString(rec.category ?? rec.type ?? rec.topic, MAX_CATEGORY) ?? 'Adaptive'
  const topic = asTrimmedString(rec.topic ?? rec.focus ?? rec.category, MAX_TOPIC)
  const rationale =
    asTrimmedString(rec.rationale ?? rec.reason ?? rec.why, MAX_RATIONALE) ?? ''

  return {
    questionText,
    category,
    difficulty: normalizeQuestionDifficulty(rec.difficulty ?? rec.level),
    topic,
    rationale,
  }
}

export interface ExistingNextQuestion {
  answerText: string | null
  questionSource: string | null
  generationSourceAnswerHash: string | null
}

// True when a retry must reuse the already-stored next question. Answered turns
// are never overwritten; unanswered turns are reused only when they were
// generated from the exact same answer, which makes duplicate submissions
// idempotent without freezing a stale question after the answer was edited.
export function shouldReuseNextQuestion(
  existing: ExistingNextQuestion | null,
  answerHash: string,
): boolean {
  if (!existing) return false
  if ((existing.answerText ?? '').trim().length > 0) return true
  return (
    existing.questionSource === 'ai' &&
    existing.generationSourceAnswerHash === answerHash
  )
}

// Session config is written by the server from a bounded create request, but an
// older or hand-edited row may carry anything. Fall back to the documented
// default rather than allowing an unbounded interview.
export function resolveQuestionCount(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
  if (!Number.isInteger(parsed) || parsed < MIN_QUESTION_COUNT || parsed > MAX_QUESTION_COUNT) {
    return DEFAULT_QUESTION_COUNT
  }
  return parsed
}
