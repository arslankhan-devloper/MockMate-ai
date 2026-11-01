import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CodingLanguage,
  NormalizedCodingProblem,
  ProblemDifficulty,
  ProblemTest,
} from '../utils/problemGenerationValidation.js'
import type { AdaptiveDecision, ProblemOutcome } from '../utils/problemAdaptive.js'
import { encryptProblemText } from '../utils/problemSecrets.js'

// Problem Solving persistence.
//
// Every helper filters by the verified `student_id`; caller-scoped reads are
// also protected by RLS. Privileged writes must retain that filter because the
// service role bypasses RLS. Column lists are explicit so hidden test ciphertext
// and the encrypted reference approach never leak through a `*` select.

export const SESSION_COLUMNS =
  'id, student_id, status, current_difficulty, current_topic, answered_count, ' +
  'accepted_count, created_at, updated_at'

export const QUESTION_COLUMNS =
  'id, session_id, student_id, sequence, title, difficulty, topic, concepts, ' +
  'statement, input_format, output_format, constraints, examples, visible_tests, ' +
  'hidden_tests_encrypted, function_name, parameters, return_type, starter_code, ' +
  'hints, hints_revealed, approach_encrypted, expected_complexity, adaptive_reason, ' +
  'generation_rationale, source, created_at'

export const SUBMISSION_COLUMNS =
  'id, question_id, session_id, student_id, client_submission_id, language, code, ' +
  'verdict, passed_tests, total_tests, runtime_ms, test_summary, result_details, ' +
  'all_passed, adaptive_difficulty, adaptive_focus, adaptive_reason, created_at'

export const TOPIC_PROGRESS_COLUMNS =
  'student_id, topic, attempts, accepted, partial, wrong, hints_used, ' +
  'consecutive_failures, current_difficulty, last_outcome, updated_at'

export interface ProblemSessionRow {
  id: string
  student_id: string
  status: string
  current_difficulty: string
  current_topic: string | null
  answered_count: number
  accepted_count: number
  created_at: string
  updated_at: string
}

export interface ProblemQuestionRow {
  id: string
  session_id: string
  student_id: string
  sequence: number
  title: string
  difficulty: string
  topic: string
  concepts: string[] | null
  statement: string
  input_format: string | null
  output_format: string | null
  constraints: string[] | null
  examples: unknown
  visible_tests: unknown
  hidden_tests_encrypted: string
  function_name: string
  parameters: unknown
  return_type: string
  starter_code: unknown
  hints: string[] | null
  hints_revealed: number
  approach_encrypted: string | null
  expected_complexity: string | null
  adaptive_reason: string | null
  generation_rationale: string | null
  source: string
  created_at: string
}

export interface ProblemSubmissionRow {
  id: string
  question_id: string
  session_id: string
  student_id: string
  client_submission_id: string
  language: string
  code: string
  verdict: string
  passed_tests: number
  total_tests: number
  runtime_ms: number | null
  test_summary: unknown
  result_details: unknown
  all_passed: boolean
  adaptive_difficulty: string | null
  adaptive_focus: string | null
  adaptive_reason: string
  created_at: string
}

export interface RecordedProblemSubmission {
  created: boolean
  submission: ProblemSubmissionRow
  session: ProblemSessionRow
  progress: ProblemTopicProgressRow | null
}

export interface ProblemTopicProgressRow {
  student_id: string
  topic: string
  attempts: number
  accepted: number
  partial: number
  wrong: number
  hints_used: number
  consecutive_failures: number
  current_difficulty: string
  last_outcome: string | null
  updated_at: string
}

export interface ProblemSessionResponse {
  id: string
  status: 'active' | 'completed'
  difficulty: ProblemDifficulty
  topic: string | null
  answeredCount: number
  acceptedCount: number
  createdAt: string
  updatedAt: string
}

export interface ProblemTopicProgressResponse {
  topic: string
  attempts: number
  accepted: number
  partial: number
  wrong: number
  hintsUsed: number
  consecutiveFailures: number
  currentDifficulty: ProblemDifficulty
  lastOutcome: string | null
  updatedAt: string
}

export interface PublicProblem {
  id: string
  sessionId: string
  sequence: number
  title: string
  difficulty: ProblemDifficulty
  topic: string
  concepts: string[]
  statement: string
  inputFormat: string
  outputFormat: string
  constraints: string[]
  examples: unknown[]
  visibleTests: ProblemTest[]
  functionName: string
  parameters: unknown[]
  returnType: string
  starterCode: Record<string, string>
  hints: string[]
  hintsTotal: number
  hintsRevealed: number
  adaptiveReason: string
  createdAt: string
}

function asDifficulty(value: unknown): ProblemDifficulty {
  return value === 'medium' || value === 'hard' ? value : 'easy'
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') out[key] = item
  }
  return out
}

export function mapSessionRow(row: ProblemSessionRow): ProblemSessionResponse {
  return {
    id: row.id,
    status: row.status === 'completed' ? 'completed' : 'active',
    difficulty: asDifficulty(row.current_difficulty),
    topic: row.current_topic,
    answeredCount: Number(row.answered_count) || 0,
    acceptedCount: Number(row.accepted_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapProgressRow(row: ProblemTopicProgressRow): ProblemTopicProgressResponse {
  return {
    topic: row.topic,
    attempts: Number(row.attempts) || 0,
    accepted: Number(row.accepted) || 0,
    partial: Number(row.partial) || 0,
    wrong: Number(row.wrong) || 0,
    hintsUsed: Number(row.hints_used) || 0,
    consecutiveFailures: Number(row.consecutive_failures) || 0,
    currentDifficulty: asDifficulty(row.current_difficulty),
    lastOutcome: row.last_outcome,
    updatedAt: row.updated_at,
  }
}

export function mapPublicProblem(row: ProblemQuestionRow): PublicProblem {
  const visibleTests = asArray<ProblemTest>(row.visible_tests)
  const hints = asArray<string>(row.hints)
  const revealed = Math.min(Math.max(Number(row.hints_revealed) || 0, 0), hints.length)
  return {
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    title: row.title,
    difficulty: asDifficulty(row.difficulty),
    topic: row.topic,
    concepts: asArray<string>(row.concepts),
    statement: row.statement,
    inputFormat: row.input_format ?? '',
    outputFormat: row.output_format ?? '',
    constraints: asArray<string>(row.constraints),
    examples: asArray(row.examples),
    visibleTests,
    functionName: row.function_name,
    parameters: asArray(row.parameters),
    returnType: row.return_type,
    starterCode: asRecord(row.starter_code),
    // Unrevealed hints stay server-side so the client cannot inspect them.
    hints: hints.slice(0, revealed),
    hintsTotal: hints.length,
    hintsRevealed: revealed,
    adaptiveReason: row.adaptive_reason ?? '',
    createdAt: row.created_at,
  }
}

export async function findActiveSession(
  client: SupabaseClient,
  studentId: string,
): Promise<ProblemSessionRow | null> {
  const { data, error } = await client
    .from('problem_sessions')
    .select(SESSION_COLUMNS)
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as ProblemSessionRow | null) ?? null
}

export async function findSession(
  client: SupabaseClient,
  studentId: string,
  sessionId: string,
): Promise<ProblemSessionRow | null> {
  const { data, error } = await client
    .from('problem_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) throw error
  return (data as ProblemSessionRow | null) ?? null
}

export async function createSession(
  writer: SupabaseClient,
  studentId: string,
): Promise<ProblemSessionRow> {
  const { data, error } = await writer
    .from('problem_sessions')
    .insert({
      student_id: studentId,
      status: 'active',
      current_difficulty: 'easy',
      current_topic: null,
    })
    .select(SESSION_COLUMNS)
    .single()
  if (error) throw error
  return data as unknown as ProblemSessionRow
}

export async function updateSessionTopic(
  writer: SupabaseClient,
  sessionId: string,
  studentId: string,
  topic: string | null,
): Promise<void> {
  const { error } = await writer
    .from('problem_sessions')
    .update({ current_topic: topic })
    .eq('id', sessionId)
    .eq('student_id', studentId)
  if (error) throw error
}

export async function getLatestQuestion(
  client: SupabaseClient,
  sessionId: string,
): Promise<ProblemQuestionRow | null> {
  const { data, error } = await client
    .from('problem_questions')
    .select(QUESTION_COLUMNS)
    .eq('session_id', sessionId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as ProblemQuestionRow | null) ?? null
}

export async function getQuestion(
  client: SupabaseClient,
  studentId: string,
  questionId: string,
): Promise<ProblemQuestionRow | null> {
  const { data, error } = await client
    .from('problem_questions')
    .select(QUESTION_COLUMNS)
    .eq('id', questionId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) throw error
  return (data as ProblemQuestionRow | null) ?? null
}

export async function nextQuestionSequence(
  client: SupabaseClient,
  sessionId: string,
): Promise<number> {
  const latest = await getLatestQuestion(client, sessionId)
  return latest ? latest.sequence + 1 : 1
}

export async function recentQuestionTitles(
  client: SupabaseClient,
  studentId: string,
  limit = 25,
): Promise<string[]> {
  const { data, error } = await client
    .from('problem_questions')
    .select('title, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return Array.isArray(data)
    ? data.map((row) => (typeof row.title === 'string' ? row.title : '')).filter(Boolean)
    : []
}

export async function recentQuestionTopics(
  client: SupabaseClient,
  studentId: string,
  limit = 12,
): Promise<string[]> {
  const { data, error } = await client
    .from('problem_questions')
    .select('topic, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const topics = new Set<string>()
  if (Array.isArray(data)) {
    for (const row of data) {
      if (typeof row.topic === 'string' && row.topic.trim()) topics.add(row.topic.trim())
    }
  }
  return [...topics]
}

export async function saveQuestion(
  writer: SupabaseClient,
  input: {
    sessionId: string
    studentId: string
    sequence: number
    problem: NormalizedCodingProblem
    hiddenTestsEncrypted: string
    adaptiveReason: string
  },
): Promise<ProblemQuestionRow> {
  const { problem } = input
  const { data, error } = await writer
    .from('problem_questions')
    .insert({
      session_id: input.sessionId,
      student_id: input.studentId,
      sequence: input.sequence,
      title: problem.title,
      difficulty: problem.difficulty,
      topic: problem.topic,
      concepts: problem.concepts,
      statement: problem.statement,
      input_format: problem.inputFormat,
      output_format: problem.outputFormat,
      constraints: problem.constraints,
      examples: problem.examples,
      visible_tests: problem.visibleTests,
      hidden_tests_encrypted: input.hiddenTestsEncrypted,
      function_name: problem.functionName,
      parameters: problem.parameters,
      return_type: problem.returnType,
      starter_code: problem.starterCode,
      hints: problem.hints,
      hints_revealed: 0,
      approach_encrypted: encryptProblemText(problem.approach),
      expected_complexity: problem.expectedComplexity,
      adaptive_reason: input.adaptiveReason,
      generation_rationale: problem.generationRationale,
      source: 'ai',
    })
    .select(QUESTION_COLUMNS)
    .single()
  if (error) throw error
  return data as unknown as ProblemQuestionRow
}

export async function revealNextHint(
  writer: SupabaseClient,
  question: ProblemQuestionRow,
): Promise<{ hint: string | null; hintsRevealed: number; hintsTotal: number }> {
  const hints = asArray<string>(question.hints)
  const next = Math.min(hints.length, Math.max(0, Number(question.hints_revealed) || 0) + 1)
  const { error } = await writer
    .from('problem_questions')
    .update({ hints_revealed: next })
    .eq('id', question.id)
    .eq('student_id', question.student_id)
  if (error) throw error
  return {
    hint: next > 0 ? hints[next - 1] ?? null : null,
    hintsRevealed: next,
    hintsTotal: hints.length,
  }
}

export async function listQuestionSubmissions(
  client: SupabaseClient,
  studentId: string,
  questionId: string,
): Promise<ProblemSubmissionRow[]> {
  const { data, error } = await client
    .from('problem_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('question_id', questionId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return Array.isArray(data) ? (data as unknown as ProblemSubmissionRow[]) : []
}

export async function findSubmissionByIdempotencyKey(
  client: SupabaseClient,
  studentId: string,
  questionId: string,
  clientSubmissionId: string,
): Promise<ProblemSubmissionRow | null> {
  const { data, error } = await client
    .from('problem_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .eq('client_submission_id', clientSubmissionId)
    .maybeSingle()
  if (error) throw error
  return (data as ProblemSubmissionRow | null) ?? null
}

export async function recordProblemSubmission(
  writer: SupabaseClient,
  input: {
    studentId: string
    question: ProblemQuestionRow
    clientSubmissionId: string
    language: CodingLanguage
    code: string
    verdict: string
    passedTests: number
    totalTests: number
    testSummary: unknown[]
    resultDetails: unknown[]
    allPassed: boolean
    hintsUsed: number
    outcome: ProblemOutcome
    nextDifficulty: ProblemDifficulty
    nextFocus: AdaptiveDecision['focus']
    nextTopic: string | null
    nextReason: string
  },
): Promise<RecordedProblemSubmission> {
  const { data, error } = await writer.rpc('record_problem_submission', {
    p_student_id: input.studentId,
    p_question_id: input.question.id,
    p_client_submission_id: input.clientSubmissionId,
    p_language: input.language,
    p_code: input.code,
    p_verdict: input.verdict,
    p_passed_tests: input.passedTests,
    p_total_tests: input.totalTests,
    p_test_summary: input.testSummary,
    p_result_details: input.resultDetails,
    p_all_passed: input.allPassed,
    p_hints_used: input.hintsUsed,
    p_outcome: input.outcome,
    p_next_difficulty: input.nextDifficulty,
    p_next_focus: input.nextFocus,
    p_next_topic: input.nextTopic,
    p_next_reason: input.nextReason,
  })
  if (error) throw error
  if (typeof data !== 'object' || data === null) {
    throw new Error('Problem submission RPC returned no result.')
  }
  const result = data as unknown as RecordedProblemSubmission
  if (!result.submission || !result.session) {
    throw new Error('Problem submission RPC returned an incomplete result.')
  }
  return result
}

export async function listTopicProgress(
  client: SupabaseClient,
  studentId: string,
): Promise<ProblemTopicProgressRow[]> {
  const { data, error } = await client
    .from('problem_topic_progress')
    .select(TOPIC_PROGRESS_COLUMNS)
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return Array.isArray(data) ? (data as unknown as ProblemTopicProgressRow[]) : []
}

export async function getTopicProgress(
  client: SupabaseClient,
  studentId: string,
  topic: string,
): Promise<ProblemTopicProgressRow | null> {
  const { data, error } = await client
    .from('problem_topic_progress')
    .select(TOPIC_PROGRESS_COLUMNS)
    .eq('student_id', studentId)
    .eq('topic', topic)
    .maybeSingle()
  if (error) throw error
  return (data as ProblemTopicProgressRow | null) ?? null
}

export async function getStudentBranch(
  client: SupabaseClient,
  studentId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('profiles')
    .select('branch')
    .eq('id', studentId)
    .maybeSingle()
  if (error) return null
  const branch = data?.branch
  return typeof branch === 'string' && branch.trim() ? branch.trim() : null
}

export function isMissingProblemTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')
}
