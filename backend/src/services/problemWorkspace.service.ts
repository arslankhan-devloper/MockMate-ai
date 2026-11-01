import type { SupabaseClient } from '@supabase/supabase-js'
import {
  decideNextProblem,
  nextProblemDifficulty,
  outcomeFromVerdict,
  type AdaptiveDecision,
} from '../utils/problemAdaptive.js'
import {
  normalizeDifficulty,
  type CodingLanguage,
} from '../utils/problemGenerationValidation.js'
import { decryptHiddenTests, decryptProblemText, encryptHiddenTests } from '../utils/problemSecrets.js'
import {
  evaluateCode,
  type EvaluationResult,
} from './problemExecution.service.js'
import { generateCodingProblem, type ProblemPerformanceContext } from './problemGeneration.service.js'
import {
  createSession,
  findActiveSession,
  findSession,
  findSubmissionByIdempotencyKey,
  getLatestQuestion,
  getQuestion,
  getStudentBranch,
  getTopicProgress,
  listQuestionSubmissions,
  listTopicProgress,
  mapProgressRow,
  mapPublicProblem,
  mapSessionRow,
  nextQuestionSequence,
  recentQuestionTitles,
  recentQuestionTopics,
  recordProblemSubmission,
  revealNextHint,
  saveQuestion,
  updateSessionTopic,
  type ProblemQuestionRow,
  type ProblemSessionRow,
  type ProblemSessionResponse,
  type ProblemSubmissionRow,
  type ProblemTopicProgressResponse,
  type PublicProblem,
} from './problemSolving.service.js'

// Orchestrates the Problem Solving workspace. All identity values are passed in
// from the verified auth context; nothing here trusts a request body.

export interface ProblemSubmissionSummary {
  id: string
  language: string
  verdict: string
  passedTests: number
  totalTests: number
  createdAt: string
  testSummary: Array<{ index: number; passed: boolean; hidden: boolean }>
}

export interface ProblemReview {
  approach: string
  expectedComplexity: string
  hints: string[]
}

export interface ProblemWorkspace {
  session: ProblemSessionResponse
  question: PublicProblem
  latestSubmission: ProblemSubmissionSummary | null
  review: ProblemReview | null
  progress: ProblemTopicProgressResponse[]
}

export interface SubmitProblemResult {
  session: ProblemSessionResponse
  submission: ProblemSubmissionSummary
  results: EvaluationResult['results']
  allPassed: boolean
  review: ProblemReview
  adaptive: {
    difficulty: ReturnType<typeof nextProblemDifficulty>
    focus: AdaptiveDecision['focus']
    reason: string
  }
  progress: ProblemTopicProgressResponse
}

export interface SubmitProblemOptions {
  grade?: typeof evaluateCode
}

function mapSubmission(row: ProblemSubmissionRow): ProblemSubmissionSummary {
  const summary = Array.isArray(row.test_summary)
    ? (row.test_summary as Array<{ index?: unknown; passed?: unknown; hidden?: unknown }>)
        .map((item, index) => ({
          index: typeof item.index === 'number' ? item.index : index,
          passed: item.passed === true,
          hidden: item.hidden === true,
        }))
    : []
  return {
    id: row.id,
    language: row.language,
    verdict: row.verdict,
    passedTests: Number(row.passed_tests) || 0,
    totalTests: Number(row.total_tests) || 0,
    createdAt: row.created_at,
    testSummary: summary,
  }
}

function reviewFor(question: ProblemQuestionRow): ProblemReview {
  return {
    approach: question.approach_encrypted ? decryptProblemText(question.approach_encrypted) : '',
    expectedComplexity: question.expected_complexity ?? '',
    hints: Array.isArray(question.hints) ? question.hints : [],
  }
}

const ADAPTIVE_FOCI: AdaptiveDecision['focus'][] = [
  'harder',
  'same_topic',
  'edge_case',
  'prerequisite',
  'optimization',
]

function storedResults(row: ProblemSubmissionRow): EvaluationResult['results'] {
  return Array.isArray(row.result_details)
    ? (row.result_details as EvaluationResult['results'])
    : []
}

function storedAdaptive(
  row: ProblemSubmissionRow,
  session: ProblemSessionRow,
): SubmitProblemResult['adaptive'] {
  const difficulty =
    normalizeDifficulty(row.adaptive_difficulty ?? '') ??
    normalizeDifficulty(session.current_difficulty) ??
    'easy'
  const focus = ADAPTIVE_FOCI.includes(row.adaptive_focus as AdaptiveDecision['focus'])
    ? (row.adaptive_focus as AdaptiveDecision['focus'])
    : 'same_topic'
  return {
    difficulty,
    focus,
    reason: row.adaptive_reason,
  }
}

function assertSameSubmission(
  row: ProblemSubmissionRow,
  language: CodingLanguage,
  code: string,
): void {
  if (row.language !== language || row.code !== code) {
    throw new WorkspaceError(
      409,
      'idempotency_conflict',
      'That submission key was already used for different code or language.',
    )
  }
}

function buildSubmissionResult(
  question: ProblemQuestionRow,
  submission: ProblemSubmissionRow,
  session: ProblemSessionRow,
  progress: ProblemTopicProgressResponse | null,
): SubmitProblemResult {
  if (!progress) {
    throw new WorkspaceError(
      500,
      'problem_solving_failed',
      'The submission was recorded without its topic progress.',
    )
  }
  return {
    session: mapSessionRow(session),
    submission: mapSubmission(submission),
    results: storedResults(submission),
    allPassed: submission.all_passed === true,
    review: reviewFor(question),
    adaptive: storedAdaptive(submission, session),
    progress,
  }
}

function mapRecordedRpcError(err: unknown): never {
  const message = typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message?: unknown }).message ?? '')
    : ''
  if (message.includes('question_not_found')) {
    throw new WorkspaceError(404, 'question_not_found', 'That problem was not found.')
  }
  if (message.includes('session_completed')) {
    throw new WorkspaceError(409, 'session_completed', 'This problem session is no longer active.')
  }
  if (message.includes('idempotency_conflict')) {
    throw new WorkspaceError(
      409,
      'idempotency_conflict',
      'That submission key was already used for different code or language.',
    )
  }
  throw err
}

function progressContext(
  rows: ProblemTopicProgressResponse[],
  topic: string | null,
): ProblemPerformanceContext {
  const focus = topic ? rows.find((row) => row.topic === topic) : undefined
  return {
    attempts: rows.reduce((total, row) => total + row.attempts, 0),
    accepted: rows.reduce((total, row) => total + row.accepted, 0),
    partial: rows.reduce((total, row) => total + row.partial, 0),
    wrong: rows.reduce((total, row) => total + row.wrong, 0),
    hintsUsed: rows.reduce((total, row) => total + row.hintsUsed, 0),
    consecutiveFailures: focus?.consecutiveFailures ?? 0,
    lastOutcome: focus?.lastOutcome ?? null,
  }
}

function adaptiveReasonFor(session: ProblemSessionRow, problemDifficulty: string): string {
  if (session.answered_count === 0) {
    return 'Starting with a baseline problem so the workspace can adapt to your real performance.'
  }
  const topic = session.current_topic ? ` on ${session.current_topic}` : ''
  return `Continuing at ${problemDifficulty}${topic} based on your recent submissions.`
}

async function generateForSession(
  client: SupabaseClient,
  writer: SupabaseClient,
  studentId: string,
  session: ProblemSessionRow,
  branch: string | null,
): Promise<ProblemQuestionRow> {
  const difficulty = normalizeDifficulty(session.current_difficulty) ?? 'easy'
  const progressRows = (await listTopicProgress(client, studentId)).map(mapProgressRow)
  const recentTitles = await recentQuestionTitles(client, studentId)
  const recentTopics = await recentQuestionTopics(client, studentId)
  const topic = session.current_topic

  const problem = await generateCodingProblem({
    difficulty,
    topic,
    adaptiveReason: adaptiveReasonFor(session, difficulty),
    recentTitles,
    recentTopics,
    targetRole: null,
    branch,
    performance: progressContext(progressRows, topic),
  })

  const sequence = await nextQuestionSequence(client, session.id)
  let saved: ProblemQuestionRow
  try {
    saved = await saveQuestion(writer, {
      sessionId: session.id,
      studentId,
      sequence,
      problem,
      hiddenTestsEncrypted: encryptHiddenTests(problem.hiddenTests),
      adaptiveReason: adaptiveReasonFor(session, problem.difficulty),
    })
  } catch (err) {
    // A concurrent open/next request already inserted this sequence. Return the
    // winner's real question instead of creating a duplicate.
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505') {
      const existing = await getLatestQuestion(client, session.id)
      if (existing) return existing
    }
    throw err
  }
  await updateSessionTopic(writer, session.id, studentId, problem.topic)
  return saved
}

function requireWriter(writer: SupabaseClient | null): SupabaseClient {
  if (!writer) {
    throw new WorkspaceError(
      503,
      'write_unavailable',
      'Problem-solving storage is not configured for writes.',
    )
  }
  return writer
}

export async function ensureWorkspace(
  client: SupabaseClient,
  writer: SupabaseClient | null,
  studentId: string,
  options: { allowCreate?: boolean } = {},
): Promise<ProblemWorkspace | null> {
  let session = await findActiveSession(client, studentId)
  if (!session) {
    if (options.allowCreate === false) return null
    const write = requireWriter(writer)
    try {
      session = await createSession(write, studentId)
    } catch (err) {
      const existing = await findActiveSession(client, studentId)
      if (!existing) throw err
      session = existing
    }
  }

  let question = await getLatestQuestion(client, session.id)
  if (!question) {
    const write = requireWriter(writer)
    const branch = await getStudentBranch(client, studentId)
    question = await generateForSession(client, write, studentId, session, branch)
    session = (await findSession(client, studentId, session.id)) ?? session
  }

  const submissions = await listQuestionSubmissions(client, studentId, question.id)
  const progress = (await listTopicProgress(client, studentId)).map(mapProgressRow)

  return {
    session: mapSessionRow(session),
    question: mapPublicProblem(question),
    latestSubmission: submissions.length > 0 ? mapSubmission(submissions[submissions.length - 1]) : null,
    review: submissions.length > 0 ? reviewFor(question) : null,
    progress,
  }
}

export async function getActiveWorkspace(
  client: SupabaseClient,
  writer: SupabaseClient | null,
  studentId: string,
): Promise<ProblemWorkspace | null> {
  return ensureWorkspace(client, writer, studentId, { allowCreate: false })
}

export async function generateNextProblem(
  client: SupabaseClient,
  writer: SupabaseClient,
  studentId: string,
  sessionId: string,
): Promise<ProblemWorkspace> {
  const session = await findSession(client, studentId, sessionId)
  if (!session) throw new WorkspaceError(404, 'session_not_found', 'That problem session was not found.')
  if (session.status !== 'active') {
    throw new WorkspaceError(409, 'session_completed', 'This problem session is already complete.')
  }

  // Learners can move on at any time. Skipped problems are not recorded as
  // attempts or outcomes, so the next problem continues from the last real
  // submission (or starts at the baseline when there is none).
  const branch = await getStudentBranch(client, studentId)
  const question = await generateForSession(client, writer, studentId, session, branch)
  const updated = (await findSession(client, studentId, session.id)) ?? session
  const progress = (await listTopicProgress(client, studentId)).map(mapProgressRow)

  return {
    session: mapSessionRow(updated),
    question: mapPublicProblem(question),
    latestSubmission: null,
    review: null,
    progress,
  }
}

export async function runVisibleTests(
  client: SupabaseClient,
  studentId: string,
  questionId: string,
  language: CodingLanguage,
  code: string,
): Promise<EvaluationResult> {
  const question = await getQuestion(client, studentId, questionId)
  if (!question) throw new WorkspaceError(404, 'question_not_found', 'That problem was not found.')
  const session = await findSession(client, studentId, question.session_id)
  if (!session || session.status !== 'active') {
    throw new WorkspaceError(409, 'session_completed', 'This problem session is no longer active.')
  }
  const tests = Array.isArray(question.visible_tests)
    ? (question.visible_tests as Array<{ args: unknown[]; expected: unknown }>)
    : []
  if (tests.length === 0) {
    throw new WorkspaceError(409, 'no_visible_tests', 'This problem has no visible tests to run.')
  }
  return evaluateCode({
    language,
    code,
    functionName: question.function_name,
    tests,
    revealDetails: true,
  })
}

export async function revealHint(
  client: SupabaseClient,
  writer: SupabaseClient,
  studentId: string,
  questionId: string,
): Promise<{ hint: string | null; hintsRevealed: number; hintsTotal: number }> {
  const question = await getQuestion(client, studentId, questionId)
  if (!question) throw new WorkspaceError(404, 'question_not_found', 'That problem was not found.')
  const total = Array.isArray(question.hints) ? question.hints.length : 0
  if (Number(question.hints_revealed) >= total) {
    throw new WorkspaceError(409, 'no_hints_left', 'All hints for this problem have already been revealed.')
  }
  return revealNextHint(writer, question)
}

export async function submitProblem(
  client: SupabaseClient,
  writer: SupabaseClient,
  studentId: string,
  questionId: string,
  language: CodingLanguage,
  code: string,
  clientSubmissionId: string,
  options: SubmitProblemOptions = {},
): Promise<SubmitProblemResult> {
  const question = await getQuestion(client, studentId, questionId)
  if (!question) throw new WorkspaceError(404, 'question_not_found', 'That problem was not found.')

  // A retry must not execute code or write anything. If the key is already
  // stored, verify that it belongs to the same logical payload and return the
  // persisted result.
  const existing = await findSubmissionByIdempotencyKey(
    client,
    studentId,
    question.id,
    clientSubmissionId,
  )
  if (existing) {
    assertSameSubmission(existing, language, code)
    const existingSession = await findSession(client, studentId, existing.session_id)
    if (!existingSession) {
      throw new WorkspaceError(404, 'session_not_found', 'That problem session was not found.')
    }
    const existingProgress = await getTopicProgress(client, studentId, question.topic)
    return buildSubmissionResult(
      question,
      existing,
      existingSession,
      existingProgress ? mapProgressRow(existingProgress) : null,
    )
  }

  const session = await findSession(client, studentId, question.session_id)
  if (!session || session.status !== 'active') {
    throw new WorkspaceError(409, 'session_completed', 'This problem session is no longer active.')
  }

  const visibleTests = Array.isArray(question.visible_tests)
    ? (question.visible_tests as Array<{ args: unknown[]; expected: unknown }>)
    : []
  const hiddenTests = decryptHiddenTests(question.hidden_tests_encrypted)
  const tests = [...visibleTests, ...hiddenTests]
  if (tests.length === 0) {
    throw new WorkspaceError(409, 'no_tests', 'This problem has no tests to grade.')
  }

  // Hidden tests are evaluated in the same sandbox call, but `evaluateCode`
  // omits their inputs/expected values from the results before they leave the
  // server.
  const grade = options.grade ?? evaluateCode
  const evaluation = await grade({
    language,
    code,
    functionName: question.function_name,
    tests,
    revealDetails: true,
    hiddenFromIndex: visibleTests.length,
  })

  const previous = await listQuestionSubmissions(client, studentId, question.id)
  const { outcome, allTestsPassed } = outcomeFromVerdict(
    evaluation.verdict,
    evaluation.passedTests,
    evaluation.totalTests,
  )

  const currentDifficulty = normalizeDifficulty(question.difficulty) ?? 'easy'
  const topic = question.topic.trim() || null
  const topicProgress = topic ? await getTopicProgress(client, studentId, topic) : null
  const consecutiveFailures = outcome === 'accepted'
    ? 0
    : (topicProgress?.consecutive_failures ?? 0) + 1
  const decision = decideNextProblem({
    currentDifficulty,
    outcome,
    allTestsPassed,
    attemptsOnProblem: previous.length + 1,
    consecutiveFailures,
    hintsUsed: Number(question.hints_revealed) || 0,
    topic,
    inefficient: false,
  })

  let recorded
  try {
    recorded = await recordProblemSubmission(writer, {
      studentId,
      question,
      clientSubmissionId,
      language,
      code,
      verdict: evaluation.verdict,
      passedTests: evaluation.passedTests,
      totalTests: evaluation.totalTests,
      testSummary: evaluation.results.map(({ index, passed, hidden }) => ({ index, passed, hidden })),
      resultDetails: evaluation.results,
      allPassed: allTestsPassed,
      hintsUsed: Number(question.hints_revealed) || 0,
      outcome,
      nextDifficulty: decision.difficulty,
      nextFocus: decision.focus,
      nextTopic: decision.topic,
      nextReason: decision.reason,
    })
  } catch (err) {
    mapRecordedRpcError(err)
  }

  // A concurrent request with the same key may have won the insert race. Do not
  // apply counters again; verify the payload matches and return its result.
  if (!recorded.created) {
    assertSameSubmission(recorded.submission, language, code)
  }

  return buildSubmissionResult(
    question,
    recorded.submission,
    recorded.session,
    recorded.progress ? mapProgressRow(recorded.progress) : null,
  )
}

export class WorkspaceError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'WorkspaceError'
    this.status = status
    this.code = code
  }
}
