// Pure, dependency-free helpers for the Placement Preparation & Practice Hub.
//
// Kept separate from `practice.ts` so they can be unit-tested with plain Node
// without loading the browser API client. Nothing here performs I/O: the
// backend owns the question bank, correctness and scoring.

export type PracticeKind = 'branch_mcq' | 'aptitude'
export type PracticeDifficulty = 'easy' | 'medium' | 'hard'
export type PracticeDifficultyFilter = PracticeDifficulty | 'mixed'
export type PracticeMode = 'practice' | 'timed'

export const PRACTICE_BRANCHES = [
  { id: 'cse', label: 'Computer Science Engineering', short: 'CSE' },
  { id: 'it', label: 'Information Technology', short: 'IT' },
  { id: 'mechanical', label: 'Mechanical Engineering', short: 'Mechanical' },
  { id: 'civil', label: 'Civil Engineering', short: 'Civil' },
  { id: 'electrical', label: 'Electrical Engineering', short: 'Electrical' },
  { id: 'ece', label: 'Electronics & Communication Engineering', short: 'ECE' },
  { id: 'ai-ds', label: 'AI & Data Science', short: 'AI & DS' },
  { id: 'other', label: 'Other Branches', short: 'Other' },
] as const

export type PracticeBranchId = (typeof PRACTICE_BRANCHES)[number]['id']

export const PRACTICE_APTITUDE_CATEGORIES = [
  'Quantitative Aptitude',
  'Logical Reasoning',
  'Verbal Ability',
  'Data Interpretation',
  'Puzzles',
] as const

export const PRACTICE_QUESTION_COUNTS = [5, 10, 15] as const
export type PracticeQuestionCount = (typeof PRACTICE_QUESTION_COUNTS)[number]

// The Problem Solving landing page has exactly three primary cards. The ids and
// destinations live here so navigation can be unit-tested without a renderer.
export const PRACTICE_HUB_CARD_IDS = ['branch-mcq', 'dsa', 'aptitude'] as const
export type PracticeHubCardId = (typeof PRACTICE_HUB_CARD_IDS)[number]

export interface PracticeHubTarget {
  page: 'practice' | 'coding-interview'
  param?: 'branch' | 'aptitude'
}

export function practiceHubTarget(card: PracticeHubCardId): PracticeHubTarget {
  switch (card) {
    case 'branch-mcq':
      return { page: 'practice', param: 'branch' }
    case 'aptitude':
      return { page: 'practice', param: 'aptitude' }
    case 'dsa':
      return { page: 'coding-interview' }
  }
}

export function isPracticeBranch(value: unknown): value is PracticeBranchId {
  return typeof value === 'string' && PRACTICE_BRANCHES.some((branch) => branch.id === value)
}

export function practiceBranchLabel(value: string | null | undefined): string {
  return PRACTICE_BRANCHES.find((branch) => branch.id === value)?.label ?? 'Other Branches'
}

export function practiceBranchShort(value: string | null | undefined): string {
  return PRACTICE_BRANCHES.find((branch) => branch.id === value)?.short ?? 'Other'
}

// Profile branches are free text. Map the common spellings to the canonical
// keys the question bank uses so the default selection is useful, while still
// letting the student switch to any branch explicitly.
export function normalizePracticeBranch(raw: string | null | undefined): PracticeBranchId | null {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) return null

  if (/mechanical|\bmech\b/.test(value)) return 'mechanical'
  if (/civil/.test(value)) return 'civil'
  if (/artificial intelligence|data science|\baids\b|machine learning/.test(value)) return 'ai-ds'
  if (/information technology|\bit\b|i\.t\./.test(value)) return 'it'
  if (/computer science|computer engineering|\bcse\b|software engineering/.test(value)) return 'cse'
  // "Electrical and Electronics" is Electrical; only pure electronics/
  // communication branches map to ECE.
  if (/electrical/.test(value) && !/communication/.test(value)) return 'electrical'
  if (/electronics|communication|\bece\b|\bentc\b|e&c/.test(value)) return 'ece'
  if (/other/.test(value)) return 'other'
  return null
}

export interface PracticeDifficultyCounts {
  easy: number
  medium: number
  hard: number
}

export interface PracticeTopicCatalog {
  name: string
  total: number
  counts: PracticeDifficultyCounts
}

export interface PracticeCategoryCatalog {
  name: string
  total: number
  counts: PracticeDifficultyCounts
  topics: PracticeTopicCatalog[]
}

export interface PracticeCatalog {
  kind: PracticeKind
  branch: string | null
  total: number
  branches: Array<{ id: string; label: string; short: string; total: number }>
  categories: PracticeCategoryCatalog[]
}

export interface PracticeAnswer {
  questionId: string
  selectedIndex: number
  correctIndex: number
  isCorrect: boolean
  explanation: string
  answeredAt: string
}

export interface PracticeQuestion {
  id: string
  position: number
  category: string
  topic: string
  difficulty: PracticeDifficulty
  prompt: string
  options: string[]
  answer: PracticeAnswer | null
}

export interface PracticeSessionSummary {
  id: string
  kind: PracticeKind
  branch: string | null
  category: string | null
  topic: string | null
  difficulty: string
  mode: PracticeMode
  status: 'active' | 'completed' | 'abandoned'
  questionCount: number
  answeredCount: number
  correctCount: number
  score: number
  accuracy: number
  timeLimitSeconds: number | null
  expiresAt: string | null
  remainingSeconds: number | null
  expired: boolean
  startedAt: string
  completedAt: string | null
}

export interface PracticeSessionView {
  session: PracticeSessionSummary
  questions: PracticeQuestion[]
  /** Present when the backend filled a shortfall with AI-generated questions. */
  generation?: PracticeGenerationSummary | null
}

export interface PracticeGenerationSummary {
  requested: number
  reused: number
  generated: number
  stored: number
}

export interface PracticeHistoryItem extends PracticeSessionSummary {
  categoryLabel: string | null
}

export interface CreatePracticeSessionInput {
  kind: PracticeKind
  branch?: PracticeBranchId | null
  category?: string | null
  topic?: string | null
  difficulty?: PracticeDifficultyFilter
  mode?: PracticeMode
  count?: number
}

export interface SubmitPracticeAnswerResult {
  duplicate: boolean
  answer: PracticeAnswer
  session: PracticeSessionSummary
}

export function practiceAccuracy(correct: number, answered: number): number {
  if (!Number.isFinite(correct) || !Number.isFinite(answered) || answered <= 0) return 0
  return Math.round((correct / answered) * 1000) / 10
}

export function practiceDifficultyLabel(
  difficulty: PracticeDifficultyFilter | string,
): string {
  switch (difficulty) {
    case 'easy':
      return 'Easy'
    case 'medium':
      return 'Medium'
    case 'hard':
      return 'Hard'
    default:
      return 'Mixed'
  }
}

// Total questions that match the catalog filters. Used to disable "Start" and
// to show an honest empty state before the user spends a request.
export function practiceSelectionTotal(
  catalog: PracticeCatalog | null,
  category: string,
  topic: string,
  difficulty: PracticeDifficultyFilter,
): number {
  if (!catalog) return 0
  const categories = category
    ? catalog.categories.filter((item) => item.name === category)
    : catalog.categories

  if (topic) {
    let total = 0
    for (const item of categories) {
      const match = item.topics.find((entry) => entry.name === topic)
      if (!match) continue
      total += difficulty === 'mixed' ? match.total : match.counts[difficulty]
    }
    return total
  }

  return categories.reduce(
    (sum, item) => sum + (difficulty === 'mixed' ? item.total : item.counts[difficulty]),
    0,
  )
}

// Keep categories whose name or one of whose topics matches the search text.
// When a category name matches, all of its topics stay visible.
export function filterPracticeCategories(
  categories: PracticeCategoryCatalog[],
  search: string,
): PracticeCategoryCatalog[] {
  const needle = search.trim().toLowerCase()
  if (!needle) return categories
  return categories
    .map((category) => {
      if (category.name.toLowerCase().includes(needle)) return category
      const topics = category.topics.filter((topic) =>
        topic.name.toLowerCase().includes(needle),
      )
      return topics.length > 0 ? { ...category, topics } : null
    })
    .filter((category): category is PracticeCategoryCatalog => category !== null)
}

export function nextUnansweredQuestion(view: PracticeSessionView | null): PracticeQuestion | null {
  if (!view) return null
  return view.questions.find((question) => question.answer === null) ?? null
}

export function answeredQuestionCount(view: PracticeSessionView | null): number {
  if (!view) return 0
  return view.questions.filter((question) => question.answer !== null).length
}

// Shared copy for API failures. The caller supplies the status/code it already
// knows, so this stays free of any client dependency.
export function practiceErrorCopy(status: number, code: string, message: string): string {
  if (status === 0) return 'Could not reach the MockMate server. Check your connection and retry.'
  if (status === 401) return 'Your session expired. Sign in again and retry.'
  if (status === 403) return 'Practice is available to student accounts only.'
  if (status === 404) return 'That practice session could not be found.'
  if (code === 'practice_no_questions') {
    return 'No questions are available for this selection yet. Try another branch, subject, topic or difficulty.'
  }
  if (code === 'practice_session_expired') {
    return 'The timed practice session has ended. Review your result or start a new session.'
  }
  if (code === 'practice_session_not_active') return 'This practice session has already ended.'
  if (code === 'practice_not_configured') {
    return 'Practice is not set up yet. Apply the latest database migration and add verified questions.'
  }
  if (code === 'ai_not_configured') {
    return 'AI question generation is not configured on the server. Pick a topic that already has questions.'
  }
  if (code === 'ai_rate_limited' || code === 'practice_generation_rate_limited') {
    return 'Question generation is busy right now. Wait a moment and retry.'
  }
  if (code === 'ai_bad_request') {
    return 'The question generation service rejected this request. Retry shortly.'
  }
  if (code === 'ai_provider_error') {
    return 'The question generation service is having trouble. Retry shortly.'
  }
  if (code === 'ai_timeout') return 'Question generation took too long. Retry to finish building the set.'
  if (code === 'ai_invalid_response') {
    return 'The generated questions could not be validated. Retry - nothing invalid was saved.'
  }
  if (code === 'ai_auth_error' || code === 'ai_request_failed') {
    return 'Question generation is temporarily unavailable. Please retry shortly.'
  }
  if (status === 429 || status === 503) return message
  return message
}
