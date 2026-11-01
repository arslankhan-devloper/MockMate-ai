import type { CodingLanguage } from './problemGenerationValidation.js'

// Request validation for the Problem Solving API. Difficulty, verdicts and
// ownership are always derived server-side; the body only supplies code and a
// supported language.

export type ProblemRequestValidation =
  | { ok: true; language: CodingLanguage; code: string }
  | { ok: false; message: string; fields?: Record<string, string> }

export type ProblemSubmissionValidation =
  | ({ ok: true; language: CodingLanguage; code: string; idempotencyKey: string })
  | { ok: false; message: string; fields?: Record<string, string> }

const MAX_CODE_LENGTH = 20_000
const MIN_CODE_LENGTH = 1
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function bodyObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
}

export function validateCodeRequest(body: unknown): ProblemRequestValidation {
  const value = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}

  const language = value.language
  if (language !== 'python' && language !== 'javascript') {
    return {
      ok: false,
      message: 'Choose Python or JavaScript.',
      fields: { language: 'Language must be python or javascript.' },
    }
  }

  const code = value.code
  if (typeof code !== 'string') {
    return {
      ok: false,
      message: 'Code is required.',
      fields: { code: 'Code must be a string.' },
    }
  }
  const trimmed = code.trim()
  if (trimmed.length < MIN_CODE_LENGTH) {
    return { ok: false, message: 'Write some code before running it.', fields: { code: 'Code is empty.' } }
  }
  if (code.length > MAX_CODE_LENGTH) {
    return {
      ok: false,
      message: `Code must be at most ${MAX_CODE_LENGTH.toLocaleString()} characters.`,
      fields: { code: 'Code is too long.' },
    }
  }

  return { ok: true, language, code }
}

export function validateSubmissionRequest(body: unknown): ProblemSubmissionValidation {
  const parsed = validateCodeRequest(body)
  if (!parsed.ok) return parsed

  const idempotencyKey = bodyObject(body).idempotencyKey
  if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
    return {
      ok: false,
      message: 'A valid submission key is required.',
      fields: { idempotencyKey: 'idempotencyKey must be a UUID.' },
    }
  }

  return { ...parsed, idempotencyKey }
}
