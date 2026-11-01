// Language rules for generated interview content.
//
// English is the only supported interview language. Older sessions may still
// have `hi` or `hi-en` saved in the database; those values are treated as
// English for any new generation or evaluation, while the already-saved
// question text, answers and reports are left untouched as historical data.

export type InterviewLanguage = 'en'

export const INTERVIEW_LANGUAGES: InterviewLanguage[] = ['en']

const DEVANAGARI_RE = /[\u0900-\u097f]/

export function normalizeInterviewLanguage(value: unknown): InterviewLanguage | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return INTERVIEW_LANGUAGES.includes(normalized as InterviewLanguage)
    ? (normalized as InterviewLanguage)
    : null
}

// Sessions created before the language field existed, and older sessions saved
// with a now-unsupported language, resolve to English for new activity.
export function resolveInterviewLanguage(value: unknown): InterviewLanguage {
  return normalizeInterviewLanguage(value) ?? 'en'
}

export function interviewLanguageName(value: unknown): string {
  resolveInterviewLanguage(value)
  return 'English'
}

// Exact instructions inserted into every generation prompt. Kept short and
// imperative because the model must also respect them inside strict JSON.
export function interviewLanguageDirective(value: unknown): string {
  resolveInterviewLanguage(value)
  return [
    'OUTPUT LANGUAGE: English only.',
    'Write every user-facing sentence in English.',
    'Do NOT use Hindi, Hinglish, or Devanagari characters.',
  ].join(' ')
}

export function containsDevanagari(text: string): boolean {
  return DEVANAGARI_RE.test(text)
}

// True when the text satisfies the English contract: non-empty and free of
// Devanagari characters. Hindi/Hinglish technical translations embedded in an
// older session are not accepted as new English output.
export function isTextInInterviewLanguage(text: string, value: unknown): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  resolveInterviewLanguage(value)
  return !containsDevanagari(trimmed)
}

export interface EvaluationLanguageText {
  summary: string
  strengths: string[]
  improvements: string[]
  suggestedAnswer: string
  criteria: { feedback: string }[]
  keyConceptsCovered: string[]
  keyConceptsMissing: string[]
  factualErrors: string[]
  expectedAnswer: string
  improvementAdvice: string
}

// Evaluation feedback is split across many fields, so check their combined text
// rather than requiring every short technical item to be a full sentence.
export function evaluationMatchesInterviewLanguage(
  evaluation: EvaluationLanguageText,
  value: unknown,
): boolean {
  if (!isTextInInterviewLanguage(evaluation.summary, value)) return false
  const combined = [
    evaluation.summary,
    ...evaluation.strengths,
    ...evaluation.improvements,
    evaluation.suggestedAnswer,
    ...evaluation.criteria.map((criterion) => criterion.feedback),
    ...evaluation.keyConceptsCovered,
    ...evaluation.keyConceptsMissing,
    ...evaluation.factualErrors,
    evaluation.expectedAnswer,
    evaluation.improvementAdvice,
  ]
    .filter(Boolean)
    .join('\n')
  return isTextInInterviewLanguage(combined, value)
}
