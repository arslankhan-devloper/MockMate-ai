// Persistence and mapping for the Placement Preparation & Practice Hub.
//
// This module is intentionally separate from the DSA workspace
// (`problemWorkspace.service.ts`): MCQs are stored in a reusable bank, scored on
// the server, and never expose their correct answer until an answer is stored.
// Reads of the bank use the service-role client because browser sessions have no
// SELECT grant on `practice_questions`.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PRACTICE_APTITUDE_TOPICS,
  PRACTICE_BRANCHES,
  PRACTICE_BRANCH_TAXONOMY,
  PRACTICE_CATEGORIES,
  type PracticeBranchId,
  type PracticeDifficulty,
  type PracticeKind,
  type PracticeMode,
  type NormalizedPracticeSessionInput,
} from '../utils/practiceValidation.js'

export const PRACTICE_QUESTION_COLUMNS =
  'id, kind, branch, category, topic, difficulty, prompt, options, correct_index, ' +
  'explanation, is_active, created_at'

export const PRACTICE_SESSION_COLUMNS =
  'id, student_id, kind, branch, category, topic, difficulty, mode, question_count, ' +
  'answered_count, correct_count, status, time_limit_seconds, expires_at, started_at, ' +
  'completed_at, created_at, updated_at'

export const PRACTICE_SESSION_QUESTION_COLUMNS =
  'id, session_id, question_id, student_id, position, created_at'

export const PRACTICE_ANSWER_COLUMNS =
  'id, session_id, question_id, student_id, selected_index, is_correct, answered_at'

export interface PracticeQuestionRow {
  id: string
  kind: string
  branch: string | null
  category: string
  topic: string
  difficulty: string
  prompt: string
  options: unknown
  correct_index: number
  explanation: string
  is_active: boolean
  created_at: string
}

export interface PracticeSessionRow {
  id: string
  student_id: string
  kind: string
  branch: string | null
  category: string | null
  topic: string | null
  difficulty: string
  mode: string
  question_count: number
  answered_count: number
  correct_count: number
  status: string
  time_limit_seconds: number | null
  expires_at: string | null
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface PracticeSessionQuestionRow {
  id: string
  session_id: string
  question_id: string
  student_id: string
  position: number
  created_at: string
}

export interface PracticeAnswerRow {
  id: string
  session_id: string
  question_id: string
  student_id: string
  selected_index: number
  is_correct: boolean
  answered_at: string
}

export interface PracticeAnswerView {
  questionId: string
  selectedIndex: number
  correctIndex: number
  isCorrect: boolean
  explanation: string
  answeredAt: string
}

export interface PracticeQuestionView {
  id: string
  position: number
  category: string
  topic: string
  difficulty: PracticeDifficulty
  prompt: string
  options: string[]
  answer: PracticeAnswerView | null
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
  questions: PracticeQuestionView[]
}

export interface PracticeHistoryItem extends PracticeSessionSummary {
  categoryLabel: string | null
}

interface DifficultyCounts {
  easy: number
  medium: number
  hard: number
}

export interface PracticeTopicCatalog {
  name: string
  total: number
  counts: DifficultyCounts
}

export interface PracticeCategoryCatalog {
  name: string
  total: number
  counts: DifficultyCounts
  topics: PracticeTopicCatalog[]
}

export interface PracticeCatalog {
  kind: PracticeKind
  branch: string | null
  total: number
  branches: Array<{ id: string; label: string; short: string; total: number }>
  categories: PracticeCategoryCatalog[]
}

export interface CatalogQuestionRow {
  branch: string | null
  category: string
  topic: string
  difficulty: string
}

export interface PracticeGenerationSummary {
  requested: number
  reused: number
  generated: number
  stored: number
}

export type CreatePracticeSessionResult =
  | { ok: true; view: PracticeSessionView; generation: PracticeGenerationSummary | null }
  | { ok: false; reason: 'no_questions' }

export interface PracticeGenerationTargetInput {
  kind: PracticeKind
  branch: PracticeBranchId | null
  category: string
  topic: string
  difficulty: PracticeDifficulty
  count: number
}

export interface CreatePracticeSessionOptions {
  /**
   * Fills the shortfall when the bank has fewer matching questions than the
   * request. Injected so tests never call the AI provider.
   */
  generate?: (
    target: PracticeGenerationTargetInput,
    missing: number,
  ) => Promise<PracticeGenerationSummary>
}

export type RecordPracticeAnswerResult =
  | {
      ok: true
      duplicate: boolean
      answer: PracticeAnswerView
      session: PracticeSessionSummary
    }
  | {
      ok: false
      reason: 'not_found' | 'not_active' | 'expired' | 'question_not_in_session'
    }

function asDifficulty(value: unknown): PracticeDifficulty {
  return value === 'medium' || value === 'hard' ? value : 'easy'
}

function emptyCounts(): DifficultyCounts {
  return { easy: 0, medium: 0, hard: 0 }
}

function addCount(counts: DifficultyCounts, difficulty: string): void {
  if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
    counts[difficulty] += 1
  }
}

function asOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((option): option is string => typeof option === 'string').slice(0, 4)
}

export function practiceAccuracy(correct: number, answered: number): number {
  if (!Number.isFinite(correct) || !Number.isFinite(answered) || answered <= 0) return 0
  return Math.round((correct / answered) * 1000) / 10
}

export function mapPracticeSessionRow(row: PracticeSessionRow, now = Date.now()): PracticeSessionSummary {
  const expiresAt = row.expires_at ?? null
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN
  const expired = Number.isFinite(expiresMs) && expiresMs <= now
  const remainingSeconds = Number.isFinite(expiresMs)
    ? Math.max(0, Math.floor((expiresMs - now) / 1000))
    : null
  return {
    id: row.id,
    kind: row.kind === 'aptitude' ? 'aptitude' : 'branch_mcq',
    branch: row.branch,
    category: row.category,
    topic: row.topic,
    difficulty: row.difficulty,
    mode: row.mode === 'timed' ? 'timed' : 'practice',
    status:
      row.status === 'completed'
        ? 'completed'
        : row.status === 'abandoned'
          ? 'abandoned'
          : 'active',
    questionCount: row.question_count,
    answeredCount: row.answered_count,
    correctCount: row.correct_count,
    score: row.correct_count,
    accuracy: practiceAccuracy(row.correct_count, row.answered_count),
    timeLimitSeconds: row.time_limit_seconds,
    expiresAt,
    remainingSeconds,
    expired,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

export function mapPracticeQuestionRow(
  row: PracticeQuestionRow,
  position: number,
  answer: PracticeAnswerRow | undefined,
): PracticeQuestionView {
  const base: PracticeQuestionView = {
    id: row.id,
    position,
    category: row.category,
    topic: row.topic,
    difficulty: asDifficulty(row.difficulty),
    prompt: row.prompt,
    options: asOptions(row.options),
    answer: null,
  }
  if (!answer) return base
  return {
    ...base,
    answer: {
      questionId: row.id,
      selectedIndex: answer.selected_index,
      correctIndex: row.correct_index,
      isCorrect: answer.is_correct,
      explanation: row.explanation,
      answeredAt: answer.answered_at,
    },
  }
}

interface StaticPracticeCategory {
  name: string
  topics: string[]
}

function staticCategoriesFor(kind: PracticeKind, branch: PracticeBranchId | null): StaticPracticeCategory[] {
  if (kind === 'aptitude') {
    // The five canonical aptitude categories ship with curated topics so an
    // empty bank still renders selectable, zero-count topics.
    return (PRACTICE_CATEGORIES as readonly string[]).map((name) => ({
      name,
      topics: [...(PRACTICE_APTITUDE_TOPICS[name] ?? [])],
    }))
  }
  const selected = PRACTICE_BRANCH_TAXONOMY.find((entry) => entry.id === branch)
  if (!selected) return []
  // Branch subjects ship with curated topics; stored questions overlay real
  // counts on top and keep adding any subject the bank knows that is not part of
  // the curated set.
  return selected.subjects.map((subject) => ({ name: subject.name, topics: [...subject.topics] }))
}

export function buildPracticeCatalog(
  rows: CatalogQuestionRow[],
  kind: PracticeKind,
  branch: PracticeBranchId | null,
): PracticeCatalog {
  const branchTotals = new Map<string, number>()
  for (const row of rows) {
    if (!row.branch) continue
    branchTotals.set(row.branch, (branchTotals.get(row.branch) ?? 0) + 1)
  }

  const filtered = kind === 'branch_mcq' && branch
    ? rows.filter((row) => row.branch === branch)
    : rows

  const categories = new Map<
    string,
    { counts: DifficultyCounts; total: number; topics: Map<string, { counts: DifficultyCounts; total: number }> }
  >()

  const ensureCategory = (name: string, topics: string[] = []) => {
    const existing = categories.get(name)
    if (existing) return existing
    const created = { counts: emptyCounts(), total: 0, topics: new Map() }
    categories.set(name, created)
    for (const topic of topics) {
      if (!created.topics.has(topic)) created.topics.set(topic, { counts: emptyCounts(), total: 0 })
    }
    return created
  }

  // Seed the curated static taxonomy first, then overlay the live bank so real
  // questions win and empty curated topics keep their zero counts.
  for (const entry of staticCategoriesFor(kind, kind === 'branch_mcq' ? branch : null)) {
    ensureCategory(entry.name, entry.topics)
  }

  for (const row of filtered) {
    const category = ensureCategory(row.category)
    category.total += 1
    addCount(category.counts, row.difficulty)

    const topic = category.topics.get(row.topic) ?? { counts: emptyCounts(), total: 0 }
    topic.total += 1
    addCount(topic.counts, row.difficulty)
    category.topics.set(row.topic, topic)
  }

  // Aptitude always shows its five canonical categories so an empty bank is an
  // explicit empty state rather than a missing section.
  if (kind === 'aptitude') {
    for (const name of PRACTICE_CATEGORIES) ensureCategory(name)
  }

  const categoryOrder =
    kind === 'aptitude'
      ? (name: string) => {
          const index = (PRACTICE_CATEGORIES as readonly string[]).indexOf(name)
          return index === -1 ? PRACTICE_CATEGORIES.length : index
        }
      : () => 0

  const categoryList = [...categories.entries()]
    .sort(([a], [b]) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b))
    .map(([name, value]) => ({
      name,
      total: value.total,
      counts: value.counts,
      topics: [...value.topics.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([topicName, topic]) => ({
          name: topicName,
          total: topic.total,
          counts: topic.counts,
        })),
    }))

  const total = kind === 'branch_mcq'
    ? categoryList.reduce((sum, category) => sum + category.total, 0)
    : rows.length

  return {
    kind,
    branch: kind === 'branch_mcq' ? branch : null,
    total,
    branches: kind === 'branch_mcq'
      ? PRACTICE_BRANCHES.map((option) => ({
          id: option.id,
          label: option.label,
          short: option.short,
          total: branchTotals.get(option.id) ?? 0,
        }))
      : [],
    categories: categoryList,
  }
}

// Deterministic Fisher–Yates so tests can inject a pseudo-random generator.
export function pickRandomQuestions<T>(rows: T[], count: number, random: () => number = Math.random): T[] {
  const copy = [...rows]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const value = copy[i]
    copy[i] = copy[j]
    copy[j] = value
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)))
}

export function derivePracticeTotals(answers: Array<{ is_correct: boolean }>): {
  answered: number
  correct: number
} {
  const answered = answers.length
  const correct = answers.filter((answer) => answer.is_correct).length
  return { answered, correct }
}

export function isMissingPracticeTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message ?? '')
  )
}

export async function listPracticeCatalog(
  client: SupabaseClient,
  kind: PracticeKind,
  branch: PracticeBranchId | null,
): Promise<PracticeCatalog> {
  const { data, error } = await client
    .from('practice_questions')
    .select('branch, category, topic, difficulty')
    .eq('kind', kind)
    .eq('is_active', true)
  if (error) throw error
  return buildPracticeCatalog((data ?? []) as unknown as CatalogQuestionRow[], kind, branch)
}

function selectQuestionsQuery(
  client: SupabaseClient,
  input: NormalizedPracticeSessionInput,
) {
  let query = client
    .from('practice_questions')
    .select(PRACTICE_QUESTION_COLUMNS)
    .eq('kind', input.kind)
    .eq('is_active', true)
  if (input.branch) query = query.eq('branch', input.branch)
  if (input.category) query = query.eq('category', input.category)
  if (input.topic) query = query.eq('topic', input.topic)
  if (input.difficulty !== 'mixed') query = query.eq('difficulty', input.difficulty)
  return query.limit(400)
}

export async function createPracticeSession(
  client: SupabaseClient,
  studentId: string,
  input: NormalizedPracticeSessionInput,
  options: CreatePracticeSessionOptions = {},
): Promise<CreatePracticeSessionResult> {
  const { data: questionData, error: questionError } = await selectQuestionsQuery(client, input)
  if (questionError) throw questionError

  let available = (questionData ?? []) as unknown as PracticeQuestionRow[]
  let generation: PracticeGenerationSummary | null = null

  // Reuse the real bank first. Only the shortfall is generated, and only when a
  // concrete topic AND subject were chosen - a generated question must belong to
  // one topic and one subject. Stored-question practice keeps working without
  // either because the bank query above already scopes it.
  if (available.length < input.questionCount && options.generate && input.topic && input.category) {
    const target: PracticeGenerationTargetInput = {
      kind: input.kind,
      branch: input.branch,
      category: input.category ?? 'Core Subjects',
      topic: input.topic,
      difficulty: input.difficulty === 'mixed' ? 'mixed' : input.difficulty,
      count: input.questionCount,
    }
    generation = await options.generate(target, input.questionCount - available.length)
    if (generation.stored > 0) {
      const { data: freshData, error: freshError } = await selectQuestionsQuery(client, input)
      if (freshError) throw freshError
      available = (freshData ?? []) as unknown as PracticeQuestionRow[]
    }
    generation = { ...generation, reused: Math.min(available.length, input.questionCount) }
  }

  const picked = pickRandomQuestions(available, input.questionCount)
  if (picked.length === 0) return { ok: false, reason: 'no_questions' }

  const expiresAt = input.timeLimitSeconds
    ? new Date(Date.now() + input.timeLimitSeconds * 1000).toISOString()
    : null

  const { data: sessionData, error: sessionError } = await client
    .from('practice_sessions')
    .insert({
      student_id: studentId,
      kind: input.kind,
      branch: input.branch,
      category: input.category,
      topic: input.topic,
      difficulty: input.difficulty,
      mode: input.mode,
      question_count: picked.length,
      answered_count: 0,
      correct_count: 0,
      status: 'active',
      time_limit_seconds: input.timeLimitSeconds,
      expires_at: expiresAt,
    })
    .select(PRACTICE_SESSION_COLUMNS)
    .single()
  if (sessionError) throw sessionError

  const session = sessionData as unknown as PracticeSessionRow
  const rows = picked.map((question, position) => ({
    session_id: session.id,
    question_id: question.id,
    student_id: studentId,
    position,
  }))
  const { error: linkError } = await client.from('practice_session_questions').insert(rows)
  if (linkError) {
    await client.from('practice_sessions').delete().eq('id', session.id).eq('student_id', studentId)
    throw linkError
  }

  return {
    ok: true,
    generation,
    view: {
      session: mapPracticeSessionRow(session),
      questions: picked.map((question, position) => mapPracticeQuestionRow(question, position, undefined)),
    },
  }
}

export async function getPracticeSessionView(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
  now = Date.now(),
): Promise<PracticeSessionView | null> {
  const { data: sessionData, error: sessionError } = await client
    .from('practice_sessions')
    .select(PRACTICE_SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (sessionError) throw sessionError
  if (!sessionData) return null

  const session = sessionData as unknown as PracticeSessionRow

  const { data: linkData, error: linkError } = await client
    .from('practice_session_questions')
    .select(PRACTICE_SESSION_QUESTION_COLUMNS)
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .order('position', { ascending: true })
  if (linkError) throw linkError

  const links = (linkData ?? []) as unknown as PracticeSessionQuestionRow[]
  const questionIds = links.map((link) => link.question_id)

  const questions = questionIds.length > 0
    ? await client
        .from('practice_questions')
        .select(PRACTICE_QUESTION_COLUMNS)
        .in('id', questionIds)
    : { data: [], error: null }
  if (questions.error) throw questions.error

  const { data: answerData, error: answerError } = await client
    .from('practice_answers')
    .select(PRACTICE_ANSWER_COLUMNS)
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
  if (answerError) throw answerError

  const answerByQuestion = new Map<string, PracticeAnswerRow>(
    ((answerData ?? []) as unknown as PracticeAnswerRow[]).map((answer) => [answer.question_id, answer]),
  )
  const questionById = new Map<string, PracticeQuestionRow>(
    ((questions.data ?? []) as unknown as PracticeQuestionRow[]).map((question) => [question.id, question]),
  )

  const viewQuestions: PracticeQuestionView[] = []
  for (const link of links) {
    const question = questionById.get(link.question_id)
    if (!question) continue
    viewQuestions.push(
      mapPracticeQuestionRow(question, link.position, answerByQuestion.get(question.id)),
    )
  }

  return {
    session: mapPracticeSessionRow(session, now),
    questions: viewQuestions,
  }
}

async function getOwnSessionRow(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
): Promise<PracticeSessionRow | null> {
  const { data, error } = await client
    .from('practice_sessions')
    .select(PRACTICE_SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as PracticeSessionRow | null) ?? null
}

export async function recordPracticeAnswer(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
  questionId: string,
  selectedIndex: number,
  now = Date.now(),
): Promise<RecordPracticeAnswerResult> {
  const session = await getOwnSessionRow(client, sessionId, studentId)
  if (!session) return { ok: false, reason: 'not_found' }
  if (session.status !== 'active') return { ok: false, reason: 'not_active' }

  const expiresMs = session.expires_at ? Date.parse(session.expires_at) : Number.NaN
  if (Number.isFinite(expiresMs) && expiresMs <= now) {
    const { data: answerData, error: answerError } = await client
      .from('practice_answers')
      .select('is_correct')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
    if (answerError) throw answerError
    const totals = derivePracticeTotals(
      ((answerData ?? []) as unknown as Array<{ is_correct: boolean }>),
    )
    await client
      .from('practice_sessions')
      .update({
        status: 'completed',
        answered_count: totals.answered,
        correct_count: totals.correct,
        completed_at: new Date(now).toISOString(),
      })
      .eq('id', sessionId)
      .eq('student_id', studentId)
    return { ok: false, reason: 'expired' }
  }

  const { data: link, error: linkError } = await client
    .from('practice_session_questions')
    .select('id')
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (linkError) throw linkError
  if (!link) return { ok: false, reason: 'question_not_in_session' }

  const { data: questionData, error: questionError } = await client
    .from('practice_questions')
    .select('id, correct_index, explanation')
    .eq('id', questionId)
    .maybeSingle()
  if (questionError) throw questionError
  if (!questionData) return { ok: false, reason: 'question_not_in_session' }

  const question = questionData as unknown as Pick<
    PracticeQuestionRow,
    'id' | 'correct_index' | 'explanation'
  >

  const makeAnswerView = (answer: PracticeAnswerRow): PracticeAnswerView => ({
    questionId: question.id,
    selectedIndex: answer.selected_index,
    correctIndex: question.correct_index,
    isCorrect: answer.is_correct,
    explanation: question.explanation,
    answeredAt: answer.answered_at,
  })

  const { data: existing, error: existingError } = await client
    .from('practice_answers')
    .select(PRACTICE_ANSWER_COLUMNS)
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    const current = await getOwnSessionRow(client, sessionId, studentId)
    return {
      ok: true,
      duplicate: true,
      answer: makeAnswerView(existing as unknown as PracticeAnswerRow),
      session: mapPracticeSessionRow(current ?? session, now),
    }
  }

  const { data: inserted, error: insertError } = await client
    .from('practice_answers')
    .insert({
      session_id: sessionId,
      question_id: questionId,
      student_id: studentId,
      selected_index: selectedIndex,
      is_correct: selectedIndex === question.correct_index,
    })
    .select(PRACTICE_ANSWER_COLUMNS)
    .single()

  if (insertError) {
    // A concurrent answer won the unique (session_id, question_id) race. Return
    // that answer instead of double-counting.
    if ((insertError as { code?: string }).code === '23505') {
      const { data: raced } = await client
        .from('practice_answers')
        .select(PRACTICE_ANSWER_COLUMNS)
        .eq('session_id', sessionId)
        .eq('question_id', questionId)
        .eq('student_id', studentId)
        .maybeSingle()
      if (raced) {
        const current = await getOwnSessionRow(client, sessionId, studentId)
        return {
          ok: true,
          duplicate: true,
          answer: makeAnswerView(raced as unknown as PracticeAnswerRow),
          session: mapPracticeSessionRow(current ?? session, now),
        }
      }
    }
    throw insertError
  }

  const answer = inserted as unknown as PracticeAnswerRow
  const current = await getOwnSessionRow(client, sessionId, studentId)

  return {
    ok: true,
    duplicate: false,
    answer: makeAnswerView(answer),
    session: mapPracticeSessionRow(current ?? session, now),
  }
}

export async function completePracticeSession(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
  now = Date.now(),
): Promise<PracticeSessionView | null> {
  const session = await getOwnSessionRow(client, sessionId, studentId)
  if (!session) return null

  const { data: answerData, error: answerError } = await client
    .from('practice_answers')
    .select('is_correct')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
  if (answerError) throw answerError

  const totals = derivePracticeTotals(
    ((answerData ?? []) as unknown as Array<{ is_correct: boolean }>),
  )

  const { error: updateError } = await client
    .from('practice_sessions')
    .update({
      status: 'completed',
      answered_count: totals.answered,
      correct_count: totals.correct,
      completed_at: session.completed_at ?? new Date(now).toISOString(),
    })
    .eq('id', sessionId)
    .eq('student_id', studentId)
  if (updateError) throw updateError

  return getPracticeSessionView(client, sessionId, studentId, now)
}

export async function getActivePracticeSession(
  client: SupabaseClient,
  studentId: string,
  kind: PracticeKind,
  now = Date.now(),
): Promise<PracticeSessionView | null> {
  const { data, error } = await client
    .from('practice_sessions')
    .select('id')
    .eq('student_id', studentId)
    .eq('kind', kind)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return getPracticeSessionView(client, (data as { id: string }).id, studentId, now)
}

export async function listPracticeHistory(
  client: SupabaseClient,
  studentId: string,
  kind?: PracticeKind,
): Promise<PracticeHistoryItem[]> {
  let query = client
    .from('practice_sessions')
    .select(PRACTICE_SESSION_COLUMNS)
    .eq('student_id', studentId)
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query.order('started_at', { ascending: false }).limit(50)
  if (error) throw error

  return ((data ?? []) as unknown as PracticeSessionRow[]).map((row) => ({
    ...mapPracticeSessionRow(row),
    categoryLabel: row.category,
  }))
}
