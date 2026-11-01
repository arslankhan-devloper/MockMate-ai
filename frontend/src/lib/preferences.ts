export const INTERVIEW_LANGUAGE = 'en' as const

export const INTERVIEW_TYPES = ['technical', 'hr', 'aptitude', 'combined', 'resume'] as const
export type InterviewTypePreference = (typeof INTERVIEW_TYPES)[number]

export const INTERVIEW_DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed'] as const
export type InterviewDifficulty = (typeof INTERVIEW_DIFFICULTIES)[number]

export const INTERVIEW_DURATIONS = [15, 30, 45, 60] as const
export type InterviewDuration = (typeof INTERVIEW_DURATIONS)[number]

export const INTERVIEW_QUESTION_COUNTS = [5, 8, 10] as const
export type InterviewQuestionCount = (typeof INTERVIEW_QUESTION_COUNTS)[number]

export const CODING_LANGUAGES = ['python', 'javascript'] as const
export type CodingLanguagePreference = (typeof CODING_LANGUAGES)[number]

export const EDITOR_FONT_SIZES = [12, 13, 14, 16] as const
export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number]

export interface InterviewPreferences {
  type: InterviewTypePreference
  difficulty: InterviewDifficulty
  durationMinutes: InterviewDuration
  questionCount: InterviewQuestionCount
}

export interface CodingPreferences {
  language: CodingLanguagePreference
  fontSize: EditorFontSize
}

export interface UserPreferences {
  interview: InterviewPreferences
  coding: CodingPreferences
}

export interface PreferenceStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export const PREFERENCE_STORAGE_PREFIX = 'mockmate.preferences.v1'

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  interview: {
    type: 'technical',
    difficulty: 'Medium',
    durationMinutes: 30,
    questionCount: 8,
  },
  coding: {
    language: 'python',
    fontSize: 13,
  },
}

export function defaultUserPreferences(): UserPreferences {
  return {
    interview: { ...DEFAULT_USER_PREFERENCES.interview },
    coding: { ...DEFAULT_USER_PREFERENCES.coding },
  }
}

export function preferenceStorageKey(userId: string): string {
  return `${PREFERENCE_STORAGE_PREFIX}:${userId}`
}

export function browserPreferenceStorage(): PreferenceStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function oneOf<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function normalizeUserPreferences(value: unknown): UserPreferences {
  const defaults = defaultUserPreferences()
  const root = objectValue(value)
  const interview = objectValue(root.interview)
  const coding = objectValue(root.coding)

  return {
    interview: {
      type: oneOf(interview.type, INTERVIEW_TYPES, defaults.interview.type),
      difficulty: oneOf(interview.difficulty, INTERVIEW_DIFFICULTIES, defaults.interview.difficulty),
      durationMinutes: oneOf(
        interview.durationMinutes,
        INTERVIEW_DURATIONS,
        defaults.interview.durationMinutes,
      ),
      questionCount: oneOf(
        interview.questionCount,
        INTERVIEW_QUESTION_COUNTS,
        defaults.interview.questionCount,
      ),
    },
    coding: {
      language: oneOf(coding.language, CODING_LANGUAGES, defaults.coding.language),
      fontSize: oneOf(coding.fontSize, EDITOR_FONT_SIZES, defaults.coding.fontSize),
    },
  }
}

export function loadUserPreferences(
  storage: PreferenceStorage | null | undefined,
  userId: string | null | undefined,
): UserPreferences {
  if (!storage || !userId) return defaultUserPreferences()

  try {
    const raw = storage.getItem(preferenceStorageKey(userId))
    if (!raw) return defaultUserPreferences()

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return defaultUserPreferences()
    }
    return normalizeUserPreferences(parsed)
  } catch {
    return defaultUserPreferences()
  }
}

export function saveUserPreferences(
  storage: PreferenceStorage | null | undefined,
  userId: string | null | undefined,
  preferences: UserPreferences,
): boolean {
  if (!storage || !userId) return false

  try {
    storage.setItem(
      preferenceStorageKey(userId),
      JSON.stringify(normalizeUserPreferences(preferences)),
    )
    return true
  } catch {
    return false
  }
}

export function resetUserPreferences(
  storage: PreferenceStorage | null | undefined,
  userId: string | null | undefined,
): boolean {
  return saveUserPreferences(storage, userId, defaultUserPreferences())
}

export function loadInterviewPreferences(
  storage: PreferenceStorage | null | undefined,
  userId: string | null | undefined,
): InterviewPreferences {
  return loadUserPreferences(storage, userId).interview
}

export function loadCodingPreferences(
  storage: PreferenceStorage | null | undefined,
  userId: string | null | undefined,
): CodingPreferences {
  return loadUserPreferences(storage, userId).coding
}
