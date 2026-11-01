import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GroqError } from '../services/resume.service.js'
import {
  ensureWorkspace,
  generateNextProblem,
  getActiveWorkspace,
  revealHint,
  runVisibleTests,
  submitProblem,
  WorkspaceError,
} from '../services/problemWorkspace.service.js'
import { SandboxError } from '../services/problemExecution.service.js'
import {
  isMissingProblemTable,
  listTopicProgress,
  mapProgressRow,
} from '../services/problemSolving.service.js'
import { ProblemSecretError } from '../utils/problemSecrets.js'
import { isUuid } from '../utils/interviewEvaluationValidation.js'
import { sendError } from '../utils/http.js'
import { getServiceWriteClient } from '../utils/serviceWriteClient.js'
import { validateCodeRequest, validateSubmissionRequest } from '../utils/problemValidation.js'

// Problem Solving API handlers. Every identity value comes from `req.auth` /
// `req.supabase`; no handler reads a student id, difficulty or verdict from the
// request body.

function routeId(req: Request): string {
  const raw = req.params.id
  return typeof raw === 'string' ? raw : ''
}

function requireStudent(req: Request, res: Response): boolean {
  if (!req.auth || !req.supabase) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return false
  }
  if (req.auth.role !== 'student') {
    sendError(res, 403, 'forbidden', 'Problem solving is available to students only.')
    return false
  }
  return true
}

function requireWriter(req: Request, res: Response): SupabaseClient | null {
  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Problem-solving storage is not configured.')
    return null
  }
  return writer
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof WorkspaceError) {
    sendError(res, err.status, err.code, err.message)
    return
  }
  if (err instanceof SandboxError) {
    sendError(res, err.status, err.code, err.message)
    return
  }
  if (err instanceof GroqError) {
    sendError(res, err.status, err.code, err.message)
    return
  }
  if (err instanceof ProblemSecretError) {
    sendError(res, 503, err.code, err.message)
    return
  }
  if (isMissingProblemTable(err as { code?: string; message?: string } | null)) {
    sendError(
      res,
      503,
      'problem_solving_not_configured',
      'Problem solving is not set up yet. Apply migration 20260109000000_problem_solving.sql.',
    )
    return
  }
  const code = typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code ?? '')
    : ''
  const message = typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message?: unknown }).message ?? '')
    : ''
  if (
    (code === '42703' || code === '42883') &&
    /client_submission_id|record_problem_submission/i.test(message)
  ) {
    sendError(
      res,
      503,
      'problem_solving_not_configured',
      'Problem solving is not set up yet. Apply migration 20260112000000_problem_submission_idempotency.sql.',
    )
    return
  }
  if (code === '42501') {
    sendError(res, 403, 'forbidden', 'You cannot access this problem-solving data.')
    return
  }
  console.error('[mockmate-backend] problem solving request failed:', err)
  sendError(res, 500, 'problem_solving_failed', 'Something went wrong in the problem-solving workspace.')
}

// POST /api/problem-solving/sessions
// Opens the caller's active workspace (restoring it if one already exists) and
// returns the current problem. Starting twice never creates parallel sessions.
export async function openSessionHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const writer = requireWriter(req, res)
  if (!writer) return
  try {
    const workspace = await ensureWorkspace(req.supabase!, writer, req.auth!.userId)
    res.status(200).json(workspace)
  } catch (err) {
    handleError(res, err)
  }
}

// GET /api/problem-solving/sessions/active
export async function getActiveSessionHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  try {
    const workspace = await getActiveWorkspace(
      req.supabase!,
      getServiceWriteClient(req),
      req.auth!.userId,
    )
    if (!workspace) {
      res.status(200).json({ session: null, question: null, latestSubmission: null, review: null, progress: [] })
      return
    }
    res.status(200).json(workspace)
  } catch (err) {
    handleError(res, err)
  }
}

// POST /api/problem-solving/sessions/:id/next-question
// Generates the next adaptive problem. The current problem must have at least
// one submission so the next step is based on real evidence.
export async function nextQuestionHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const sessionId = routeId(req)
  if (!isUuid(sessionId)) {
    sendError(res, 400, 'invalid_session', 'Invalid session id.')
    return
  }
  const writer = requireWriter(req, res)
  if (!writer) return
  try {
    const workspace = await generateNextProblem(
      req.supabase!,
      writer,
      req.auth!.userId,
      sessionId,
    )
    res.status(201).json(workspace)
  } catch (err) {
    handleError(res, err)
  }
}

// POST /api/problem-solving/questions/:id/hint
export async function hintHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const questionId = routeId(req)
  if (!isUuid(questionId)) {
    sendError(res, 400, 'invalid_question', 'Invalid problem id.')
    return
  }
  const writer = requireWriter(req, res)
  if (!writer) return
  try {
    const result = await revealHint(req.supabase!, writer, req.auth!.userId, questionId)
    res.status(200).json(result)
  } catch (err) {
    handleError(res, err)
  }
}

// POST /api/problem-solving/questions/:id/run
// Runs only the visible tests. This never persists a submission and never
// touches hidden tests.
export async function runHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const questionId = routeId(req)
  if (!isUuid(questionId)) {
    sendError(res, 400, 'invalid_question', 'Invalid problem id.')
    return
  }
  const parsed = validateCodeRequest(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }
  try {
    const evaluation = await runVisibleTests(
      req.supabase!,
      req.auth!.userId,
      questionId,
      parsed.language,
      parsed.code,
    )
    res.status(200).json({
      verdict: evaluation.verdict,
      visiblePassed: evaluation.passedTests === evaluation.totalTests && evaluation.totalTests > 0,
      passedTests: evaluation.passedTests,
      totalTests: evaluation.totalTests,
      results: evaluation.results,
    })
  } catch (err) {
    handleError(res, err)
  }
}

// POST /api/problem-solving/questions/:id/submit
// Runs visible + hidden tests, records the real verdict, updates topic progress
// and returns the bounded adaptive decision for the next problem.
export async function submitHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const questionId = routeId(req)
  if (!isUuid(questionId)) {
    sendError(res, 400, 'invalid_question', 'Invalid problem id.')
    return
  }
  const parsed = validateSubmissionRequest(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }
  const writer = requireWriter(req, res)
  if (!writer) return
  try {
    const result = await submitProblem(
      req.supabase!,
      writer,
      req.auth!.userId,
      questionId,
      parsed.language,
      parsed.code,
      parsed.idempotencyKey,
    )
    res.status(201).json(result)
  } catch (err) {
    handleError(res, err)
  }
}

// GET /api/problem-solving/progress
export async function progressHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  try {
    const rows = await listTopicProgress(req.supabase!, req.auth!.userId)
    res.status(200).json({ topics: rows.map(mapProgressRow) })
  } catch (err) {
    handleError(res, err)
  }
}
