// Validation for Coding Round execution requests.
//
// The browser never chooses a compiler id and never sends a provider key. It
// sends one of the language keys this app supports; the backend maps that to the
// OnlineCompiler.io compiler id. Limits mirror the provider contract so an
// invalid request is rejected here without spending a run.

import {
  CODING_ROUND_LANGUAGE_IDS,
  isCodingRoundLanguage,
  type CodingRoundLanguageId,
} from './codingRoundLanguages.js'

export type FieldErrors = Record<string, string>

export interface NormalizedCodingRun {
  language: CodingRoundLanguageId
  code: string
  input: string
  timeLimit: number
  questionIndex: number
}

export type CodingRunValidationResult =
  | { ok: true; value: NormalizedCodingRun }
  | { ok: false; message: string; fields: FieldErrors }

const MAX_CODE_BYTES = 100_000
const MAX_INPUT_BYTES = 100_000
const MIN_TIME_LIMIT = 1
const MAX_TIME_LIMIT = 30
const DEFAULT_TIME_LIMIT = 5
const MAX_QUESTION_INDEX = 10_000

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateCodingRun(body: unknown): CodingRunValidationResult {
  const fields: FieldErrors = {}
  if (!isPlainObject(body)) {
    return { ok: false, message: 'A JSON object is required.', fields: { body: 'Must be a JSON object.' } }
  }

  const language = body.language
  if (!isCodingRoundLanguage(language)) {
    fields.language = `Must be one of: ${CODING_ROUND_LANGUAGE_IDS.join(', ')}.`
  }

  const code = body.code
  if (typeof code !== 'string') {
    fields.code = 'Code is required.'
  } else if (!code.trim()) {
    fields.code = 'Code cannot be empty.'
  } else if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
    fields.code = `Code must be at most ${MAX_CODE_BYTES} bytes.`
  }

  const rawInput = body.input
  let input = ''
  if (rawInput !== undefined && rawInput !== null) {
    if (typeof rawInput !== 'string') {
      fields.input = 'Input must be text.'
    } else if (Buffer.byteLength(rawInput, 'utf8') > MAX_INPUT_BYTES) {
      fields.input = `Input must be at most ${MAX_INPUT_BYTES} bytes.`
    } else {
      input = rawInput
    }
  }

  const rawTimeLimit = body.timeLimit
  let timeLimit = DEFAULT_TIME_LIMIT
  if (rawTimeLimit !== undefined && rawTimeLimit !== null) {
    if (
      typeof rawTimeLimit !== 'number' ||
      !Number.isFinite(rawTimeLimit) ||
      rawTimeLimit < MIN_TIME_LIMIT ||
      rawTimeLimit > MAX_TIME_LIMIT
    ) {
      fields.timeLimit = `Must be a number from ${MIN_TIME_LIMIT} to ${MAX_TIME_LIMIT} seconds.`
    } else {
      timeLimit = rawTimeLimit
    }
  }

  const rawQuestionIndex = body.questionIndex
  let questionIndex = 0
  if (rawQuestionIndex !== undefined && rawQuestionIndex !== null) {
    if (
      typeof rawQuestionIndex !== 'number' ||
      !Number.isInteger(rawQuestionIndex) ||
      rawQuestionIndex < 0 ||
      rawQuestionIndex > MAX_QUESTION_INDEX
    ) {
      fields.questionIndex = `Must be an integer from 0 to ${MAX_QUESTION_INDEX}.`
    } else {
      questionIndex = rawQuestionIndex
    }
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'The coding run request is invalid.', fields }
  }

  return {
    ok: true,
    value: {
      language: language as CodingRoundLanguageId,
      code: code as string,
      input,
      timeLimit,
      questionIndex,
    },
  }
}
