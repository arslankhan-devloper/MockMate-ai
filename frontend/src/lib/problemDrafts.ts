// Local draft persistence for the Problem Solving editor.
//
// Drafts are keyed by the verified user id and the problem id, so switching
// accounts or problems can never reveal another person's code. Only the code
// and selected language are stored; verdicts and hidden tests live on the
// server.

export type DraftLanguage = 'python' | 'javascript'
export const DRAFT_LANGUAGES: DraftLanguage[] = ['python', 'javascript']

export interface ProblemDraft {
  questionId: string
  language: DraftLanguage
  codes: Record<DraftLanguage, string>
  updatedAt: string
}

export interface DraftStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const MAX_CODE_LENGTH = 20_000
const DRAFT_PREFIX = 'mockmate:problem-draft'

export function problemDraftKey(userId: string, questionId: string): string {
  return `${DRAFT_PREFIX}:${userId}:${questionId}`
}

export function isDraftLanguage(value: unknown): value is DraftLanguage {
  return value === 'python' || value === 'javascript'
}

export function parseProblemDraft(raw: string | null, questionId: string): ProblemDraft | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const value = parsed as Record<string, unknown>
  if (value.questionId !== questionId) return null
  if (!isDraftLanguage(value.language)) return null
  const codes = value.codes
  if (typeof codes !== 'object' || codes === null || Array.isArray(codes)) return null
  const record = codes as Record<string, unknown>
  const python = record.python
  const javascript = record.javascript
  if (typeof python !== 'string' || typeof javascript !== 'string') return null
  if (python.length > MAX_CODE_LENGTH || javascript.length > MAX_CODE_LENGTH) return null
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString()
  return {
    questionId,
    language: value.language,
    codes: { python, javascript },
    updatedAt,
  }
}

export function createProblemDraft(input: {
  questionId: string
  language: DraftLanguage
  codes: Record<DraftLanguage, string>
  updatedAt?: string
}): ProblemDraft {
  return {
    questionId: input.questionId,
    language: input.language,
    codes: {
      python: input.codes.python.slice(0, MAX_CODE_LENGTH),
      javascript: input.codes.javascript.slice(0, MAX_CODE_LENGTH),
    },
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  }
}

export function serializeProblemDraft(draft: ProblemDraft): string {
  return JSON.stringify(draft)
}

export function loadProblemDraft(
  storage: Pick<DraftStorage, 'getItem'>,
  userId: string,
  questionId: string,
): ProblemDraft | null {
  try {
    return parseProblemDraft(storage.getItem(problemDraftKey(userId, questionId)), questionId)
  } catch {
    return null
  }
}

export function saveProblemDraft(
  storage: Pick<DraftStorage, 'setItem'>,
  userId: string,
  draft: ProblemDraft,
): boolean {
  try {
    storage.setItem(problemDraftKey(userId, draft.questionId), serializeProblemDraft(draft))
    return true
  } catch {
    return false
  }
}

export function initialDraftCodes(
  questionId: string,
  starterCode: Partial<Record<DraftLanguage, string>>,
  stored: ProblemDraft | null,
  preferredLanguage: DraftLanguage = 'python',
): { language: DraftLanguage; codes: Record<DraftLanguage, string> } {
  const fallback = {
    python: starterCode.python ?? '# Write your solution here\n',
    javascript: starterCode.javascript ?? '// Write your solution here\n',
  }
  if (stored && stored.questionId === questionId) {
    return {
      language: stored.language,
      codes: {
        python: stored.codes.python,
        javascript: stored.codes.javascript,
      },
    }
  }
  return { language: preferredLanguage, codes: fallback }
}
