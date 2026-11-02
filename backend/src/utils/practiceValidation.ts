// Validation for the Placement Preparation & Practice Hub.
//
// The browser chooses a kind, branch, optional subject/topic, difficulty, mode
// and a bounded question count. It never sends a score, a correct answer or a
// student id. Provider-style limits keep invalid requests out of the database.

import { isUuid } from './interviewEvaluationValidation.js'

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
export const PRACTICE_BRANCH_IDS = PRACTICE_BRANCHES.map((branch) => branch.id)

export const PRACTICE_KINDS = ['branch_mcq', 'aptitude'] as const
export type PracticeKind = (typeof PRACTICE_KINDS)[number]

export const PRACTICE_CATEGORIES = [
  'Quantitative Aptitude',
  'Logical Reasoning',
  'Verbal Ability',
  'Data Interpretation',
  'Puzzles',
] as const

export const PRACTICE_DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const
export type PracticeDifficulty = (typeof PRACTICE_DIFFICULTIES)[number]

export const PRACTICE_MODES = ['practice', 'timed'] as const
export type PracticeMode = (typeof PRACTICE_MODES)[number]

export const PRACTICE_MIN_QUESTIONS = 1
export const PRACTICE_MAX_QUESTIONS = 30
export const PRACTICE_DEFAULT_QUESTIONS = 10
export const PRACTICE_SECONDS_PER_QUESTION = 60
export const PRACTICE_MAX_SECONDS = 3600

const MAX_LABEL = 120

// Curated, server-owned taxonomy for the empty-bank flow. The practice hub merges
// this static knowledge with the live database counts, so a branch or aptitude
// topic with zero stored questions still shows up as a selectable, generatable
// target instead of an empty bank. Nothing here invents questions; it only names
// subjects and topics the AI may be asked to author.
export interface PracticeTaxonomySubject {
  name: string
  topics: readonly string[]
}

export interface PracticeTaxonomyBranch {
  id: PracticeBranchId
  subjects: readonly PracticeTaxonomySubject[]
}

export const PRACTICE_BRANCH_TAXONOMY: readonly PracticeTaxonomyBranch[] = [
  {
    id: 'cse',
    subjects: [
      { name: 'Data Structures', topics: ['Arrays', 'Linked Lists', 'Trees', 'Graphs', 'Heaps'] },
      { name: 'Algorithms', topics: ['Sorting', 'Searching', 'Dynamic Programming', 'Graph Algorithms', 'Greedy Algorithms'] },
      { name: 'DBMS', topics: ['Normalization', 'Indexing', 'Transactions', 'ER Diagrams'] },
      { name: 'Operating Systems', topics: ['Processes', 'Threads', 'Memory Management', 'File Systems', 'Scheduling'] },
      { name: 'Computer Networks', topics: ['TCP/IP', 'HTTP', 'DNS', 'Routing', 'Subnetting'] },
      { name: 'Software Engineering', topics: ['Agile', 'Testing', 'Design Patterns', 'CI/CD', 'Estimation'] },
    ],
  },
  {
    id: 'it',
    subjects: [
      { name: 'Networking', topics: ['TCP/IP', 'DNS', 'HTTP', 'Routing', 'Subnetting'] },
      { name: 'Operating Systems', topics: ['Processes', 'Threads', 'Memory Management', 'File Systems', 'Scheduling'] },
      { name: 'Databases', topics: ['SQL', 'Normalization', 'Indexing', 'Transactions'] },
      { name: 'Programming', topics: ['Java', 'Python', 'C++', 'JavaScript', 'OOP'] },
    ],
  },
  {
    id: 'mechanical',
    subjects: [
      { name: 'Thermodynamics', topics: ['Laws of Thermodynamics', 'Heat Transfer', 'Internal Combustion Engines', 'Steam Cycles', 'Refrigeration'] },
      { name: 'Mechanics', topics: ['Statics', 'Dynamics', 'Strength of Materials', 'Material Science', 'Friction and Bearings'] },
      { name: 'Manufacturing', topics: ['Machining', 'Welding', 'Casting', 'CNC Machining', 'Quality Control'] },
    ],
  },
  {
    id: 'civil',
    subjects: [
      { name: 'Structural Engineering', topics: ['RCC Design', 'Steel Design', 'Structural Analysis', 'Foundation Design', 'Wind and Earthquake'] },
      { name: 'Transportation Engineering', topics: ['Highway Design', 'Traffic Engineering', 'Pavement Design', 'Railway Engineering', 'Airport Engineering'] },
      { name: 'Geotechnical Engineering', topics: ['Soil Mechanics', 'Foundation Engineering', 'Earth Retaining Structures', 'Slope Stability', 'Seepage'] },
    ],
  },
  {
    id: 'electrical',
    subjects: [
      { name: 'Circuit Analysis', topics: ['DC Circuits', 'AC Circuits', 'Transistors', 'Op-Amps', 'Kirchhoff Laws'] },
      { name: 'Power Systems', topics: ['Load Flow', 'Protection', 'Transmission', 'Distribution', 'Substation'] },
      { name: 'Electromagnetics', topics: ['Electromagnetic Theory', 'Antenna Theory', 'EMI', 'Wave Propagation', 'Fiber Optics'] },
    ],
  },
  {
    id: 'ece',
    subjects: [
      { name: 'Signals and Systems', topics: ['Fourier Analysis', 'Laplace Transforms', 'Sampling', 'Filter Design', 'Modulation'] },
      { name: 'Communication Systems', topics: ['Digital Modulation', 'Error Correction', 'Information Theory', 'Satellite Communications', 'Telecom Protocols'] },
    ],
  },
  {
    id: 'ai-ds',
    subjects: [
      { name: 'Machine Learning', topics: ['Regression', 'Classification', 'Clustering', 'Deep Learning', 'NLP', 'Computer Vision'] },
      { name: 'Data Science', topics: ['Statistics', 'Data Wrangling', 'Data Visualization', 'Experiment Design', 'Feature Engineering'] },
    ],
  },
  {
    id: 'other',
    subjects: [
      { name: 'General Engineering', topics: ['General Aptitude', 'General Science', 'Engineering Mathematics', 'Professional Communication'] },
    ],
  },
]

export const PRACTICE_APTITUDE_TOPICS: Readonly<Record<string, readonly string[]>> = {
  'Quantitative Aptitude': [
    'Percentages',
    'Profit and Loss',
    'Time and Work',
    'Speed and Distance',
    'Simple and Compound Interest',
    'Averages',
    'Permutations and Combinations',
  ],
  'Logical Reasoning': [
    'Syllogisms',
    'Blood Relations',
    'Seating Arrangement',
    'Number Series',
    'Coding and Decoding',
    'Statements and Assumptions',
  ],
  'Verbal Ability': ['Grammar', 'Vocabulary', 'Reading Comprehension', 'Fill in the Blanks', 'Spot the Error'],
  'Data Interpretation': ['Pie Charts', 'Bar Charts', 'Line Charts', 'Tables', 'Caselets'],
  'Puzzles': ['Logic Grid', 'Seating Puzzles', 'Scheduling Puzzles', 'Knights and Knaves', 'Grid Logic'],
} as const

export type FieldErrors = Record<string, string>

export interface NormalizedPracticeSessionInput {
  kind: PracticeKind
  branch: PracticeBranchId | null
  category: string | null
  topic: string | null
  difficulty: PracticeDifficulty
  mode: PracticeMode
  questionCount: number
  timeLimitSeconds: number | null
}

export type PracticeSessionValidation =
  | { ok: true; value: NormalizedPracticeSessionInput }
  | { ok: false; message: string; fields: FieldErrors }

export type PracticeAnswerValidation =
  | { ok: true; value: { questionId: string; selectedIndex: number } }
  | { ok: false; message: string; fields: FieldErrors }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_LABEL) return null
  return trimmed
}

export function isPracticeKind(value: unknown): value is PracticeKind {
  return typeof value === 'string' && (PRACTICE_KINDS as readonly string[]).includes(value)
}

export function isPracticeBranch(value: unknown): value is PracticeBranchId {
  return typeof value === 'string' && (PRACTICE_BRANCH_IDS as readonly string[]).includes(value)
}

export function isPracticeDifficulty(value: unknown): value is PracticeDifficulty {
  return typeof value === 'string' && (PRACTICE_DIFFICULTIES as readonly string[]).includes(value)
}

export function practiceBranchLabel(value: string | null | undefined): string {
  return PRACTICE_BRANCHES.find((branch) => branch.id === value)?.label ?? 'Other Branches'
}

export function validatePracticeSession(body: unknown): PracticeSessionValidation {
  const fields: FieldErrors = {}
  if (!isPlainObject(body)) {
    return { ok: false, message: 'A JSON object is required.', fields: { body: 'Must be a JSON object.' } }
  }

  const kind = body.kind
  if (!isPracticeKind(kind)) {
    fields.kind = `Must be one of: ${PRACTICE_KINDS.join(', ')}.`
  }

  let branch: PracticeBranchId | null = null
  if (kind === 'branch_mcq') {
    if (!isPracticeBranch(body.branch)) {
      fields.branch = `Must be one of: ${PRACTICE_BRANCH_IDS.join(', ')}.`
    } else {
      branch = body.branch
    }
  }

  let category: string | null = null
  if (body.category !== undefined && body.category !== null) {
    category = boundedLabel(body.category)
    if (!category) {
      fields.category = `Must be text of at most ${MAX_LABEL} characters.`
    } else if (
      kind === 'aptitude' &&
      !(PRACTICE_CATEGORIES as readonly string[]).includes(category)
    ) {
      fields.category = `Must be one of: ${PRACTICE_CATEGORIES.join(', ')}.`
    }
  }

  let topic: string | null = null
  if (body.topic !== undefined && body.topic !== null) {
    topic = boundedLabel(body.topic)
    if (!topic) fields.topic = `Must be text of at most ${MAX_LABEL} characters.`
  }

  const difficulty = body.difficulty ?? 'mixed'
  if (!isPracticeDifficulty(difficulty)) {
    fields.difficulty = `Must be one of: ${PRACTICE_DIFFICULTIES.join(', ')}.`
  }

  const mode = body.mode ?? 'practice'
  if (typeof mode !== 'string' || !(PRACTICE_MODES as readonly string[]).includes(mode)) {
    fields.mode = `Must be one of: ${PRACTICE_MODES.join(', ')}.`
  }

  const rawCount = body.count ?? PRACTICE_DEFAULT_QUESTIONS
  const count =
    typeof rawCount === 'number' && Number.isInteger(rawCount)
      ? rawCount
      : typeof rawCount === 'string' && rawCount.trim() !== ''
        ? Number(rawCount)
        : Number.NaN
  if (
    !Number.isInteger(count) ||
    count < PRACTICE_MIN_QUESTIONS ||
    count > PRACTICE_MAX_QUESTIONS
  ) {
    fields.count = `Must be an integer from ${PRACTICE_MIN_QUESTIONS} to ${PRACTICE_MAX_QUESTIONS}.`
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'The practice session request is invalid.', fields }
  }

  const questionCount = Math.trunc(count)
  const timeLimitSeconds =
    mode === 'timed'
      ? Math.min(
          PRACTICE_MAX_SECONDS,
          Math.max(PRACTICE_SECONDS_PER_QUESTION, questionCount * PRACTICE_SECONDS_PER_QUESTION),
        )
      : null

  return {
    ok: true,
    value: {
      kind: kind as PracticeKind,
      branch,
      category,
      topic,
      difficulty: difficulty as PracticeDifficulty,
      mode: mode as PracticeMode,
      questionCount,
      timeLimitSeconds,
    },
  }
}

export function validatePracticeAnswer(body: unknown): PracticeAnswerValidation {
  const fields: FieldErrors = {}
  if (!isPlainObject(body)) {
    return { ok: false, message: 'A JSON object is required.', fields: { body: 'Must be a JSON object.' } }
  }

  if (!isUuid(body.questionId)) {
    fields.questionId = 'A valid question id is required.'
  }

  const selectedIndex = body.selectedIndex
  if (
    typeof selectedIndex !== 'number' ||
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex > 3
  ) {
    fields.selectedIndex = 'Must be an integer from 0 to 3.'
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'The answer is invalid.', fields }
  }

  return {
    ok: true,
    value: {
      questionId: body.questionId as string,
      selectedIndex: selectedIndex as number,
    },
  }
}
