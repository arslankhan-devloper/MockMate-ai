// Strict validation for AI-generated practice MCQs.
//
// Nothing reaches the question bank unless every field is present, the four
// options are distinct, the correct index is in range and the explanation is
// real text. Duplicate prompts (inside a batch, against the batch corpus and
// against the already-stored bank) are rejected rather than silently dropped,
// so the caller always knows how many usable questions it actually received.
//
// This module is pure: no I/O, no provider calls, no database access.

import { PRACTICE_CATEGORIES, type PracticeDifficulty, type PracticeKind } from './practiceValidation.js'

export const PRACTICE_GENERATION_BATCH_SIZE = 5
/** Invalid generations may be retried this many times (so at most 3 attempts). */
export const PRACTICE_GENERATION_MAX_RETRIES = 2

const MIN_PROMPT_LENGTH = 15
const MAX_PROMPT_LENGTH = 4000
const MAX_OPTION_LENGTH = 400
const MIN_EXPLANATION_LENGTH = 20
const MAX_EXPLANATION_LENGTH = 4000

export interface GeneratedPracticeQuestion {
  kind: PracticeKind
  branch: string | null
  category: string
  topic: string
  difficulty: PracticeDifficulty
  prompt: string
  options: [string, string, string, string]
  correctIndex: number
  explanation: string
}

export interface PracticeGenerationTarget {
  kind: PracticeKind
  branch: string | null
  category: string
  topic: string
  difficulty: PracticeDifficulty | 'mixed'
  count: number
}

export type PracticeGenerationValidation =
  | { ok: true; value: GeneratedPracticeQuestion[]; rejected: number; errors: string[] }
  | { ok: false; error: string; rejected: number; errors: string[] }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

// Two prompts that differ only by case, punctuation spacing or duplicated
// whitespace are the same question for dedupe purposes.
export function normalizePromptKey(prompt: string): string {
  return prompt
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function practiceQuestionKey(category: string, topic: string, prompt: string): string {
  return `${normalizePromptKey(category)}|${normalizePromptKey(topic)}|${normalizePromptKey(prompt)}`
}

function optionsAreDistinct(options: string[]): boolean {
  const seen = new Set(options.map((option) => normalizePromptKey(option)))
  return seen.size === options.length
}

function asDifficulty(value: unknown): PracticeDifficulty | null {
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : null
}

function validateOne(
  raw: unknown,
  target: PracticeGenerationTarget,
): { ok: true; value: GeneratedPracticeQuestion } | { ok: false; error: string } {
  if (!isPlainObject(raw)) return { ok: false, error: 'each question must be a JSON object' }

  const prompt = cleanText(raw.prompt, MAX_PROMPT_LENGTH)
  if (!prompt) return { ok: false, error: 'prompt is missing or too long' }
  if (prompt.length < MIN_PROMPT_LENGTH) {
    return { ok: false, error: 'prompt is too short to be a clear question' }
  }

  if (!Array.isArray(raw.options) || raw.options.length !== 4) {
    return { ok: false, error: 'options must contain exactly four items' }
  }
  const options: string[] = []
  for (const option of raw.options) {
    const cleaned = cleanText(option, MAX_OPTION_LENGTH)
    if (!cleaned) return { ok: false, error: 'every option must be non-empty text' }
    options.push(cleaned)
  }
  if (!optionsAreDistinct(options)) {
    return { ok: false, error: 'options must be distinct' }
  }

  const correctIndex = raw.correctIndex
  if (
    typeof correctIndex !== 'number' ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex > 3
  ) {
    return { ok: false, error: 'correctIndex must be an integer from 0 to 3' }
  }

  const explanation = cleanText(raw.explanation, MAX_EXPLANATION_LENGTH)
  if (!explanation || explanation.length < MIN_EXPLANATION_LENGTH) {
    return { ok: false, error: 'explanation is missing or too short' }
  }
  // An explanation that is just a copy of an option does not explain anything.
  if (options.some((option) => normalizePromptKey(option) === normalizePromptKey(explanation))) {
    return { ok: false, error: 'explanation must explain the answer, not repeat an option' }
  }

  const difficulty = asDifficulty(raw.difficulty)
  if (!difficulty) return { ok: false, error: 'difficulty must be easy, medium or hard' }
  if (target.difficulty !== 'mixed' && difficulty !== target.difficulty) {
    return { ok: false, error: `difficulty must be ${target.difficulty}` }
  }

  // The model must not invent a different subject/topic than the one requested.
  for (const field of ['category', 'topic'] as const) {
    const value = cleanText(raw[field], 120)
    if (!value) return { ok: false, error: `${field} is missing` }
    if (normalizePromptKey(value) !== normalizePromptKey(target[field])) {
      return { ok: false, error: `${field} does not match the requested ${field}` }
    }
  }

  if (target.kind === 'aptitude') {
    if (!(PRACTICE_CATEGORIES as readonly string[]).includes(target.category)) {
      return { ok: false, error: 'unknown aptitude category' }
    }
  } else {
    const branch = cleanText(raw.branch, 40)
    if (!branch || branch !== target.branch) {
      return { ok: false, error: 'branch does not match the requested branch' }
    }
  }

  return {
    ok: true,
    value: {
      kind: target.kind,
      branch: target.kind === 'aptitude' ? null : target.branch,
      category: target.category,
      topic: target.topic,
      difficulty,
      prompt,
      options: [options[0], options[1], options[2], options[3]],
      correctIndex,
      explanation,
    },
  }
}

/**
 * Validates a raw provider payload against the requested target and the prompt
 * keys already present in the bank. Invalid or duplicate entries are rejected
 * individually so one bad question cannot throw away the whole usable batch.
 * The result still fails when no question survives validation. The caller can
 * retry for the remaining shortfall and log the rejection count.
 */
export function validateGeneratedQuestions(
  raw: unknown,
  target: PracticeGenerationTarget,
  existingKeys: ReadonlySet<string> = new Set(),
): PracticeGenerationValidation {
  const list = (() => {
    if (Array.isArray(raw)) return raw
    if (isPlainObject(raw) && Array.isArray(raw.questions)) return raw.questions
    return null
  })()
  if (!list) {
    return { ok: false, error: 'response did not contain a questions array', rejected: 0, errors: [] }
  }
  if (list.length === 0) {
    return { ok: false, error: 'response contained no questions', rejected: 0, errors: [] }
  }

  const value: GeneratedPracticeQuestion[] = []
  const seen = new Set<string>()
  const errors: string[] = []
  let rejected = 0

  for (const item of list) {
    const parsed = validateOne(item, target)
    if (!parsed.ok) {
      rejected += 1
      errors.push(parsed.error)
      continue
    }

    const key = practiceQuestionKey(parsed.value.category, parsed.value.topic, parsed.value.prompt)
    if (seen.has(key) || existingKeys.has(key)) {
      rejected += 1
      errors.push('a generated question duplicates an existing question')
      continue
    }
    seen.add(key)
    value.push(parsed.value)
  }

  if (value.length === 0) {
    return {
      ok: false,
      error: errors[0] ?? 'response contained no usable questions',
      rejected,
      errors,
    }
  }

  return { ok: true, value, rejected, errors }
}
