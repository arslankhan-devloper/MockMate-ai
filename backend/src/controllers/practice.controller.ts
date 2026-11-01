// HTTP handlers for the Placement Preparation & Practice Hub.
//
// Every handler runs behind `requireAuth` + `requireRole('student')`. Identity
// comes from the verified token; the browser never supplies a student id, a
// score or a correct answer.

import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  completePracticeSession,
  createPracticeSession,
  getActivePracticeSession,
  getPracticeSessionView,
  isMissingPracticeTable,
  listPracticeCatalog,
  listPracticeHistory,
  recordPracticeAnswer,
} from '../services/practice.service.js'
import { generatePracticeQuestions } from '../services/practiceGeneration.service.js'
import { GroqError } from '../services/resume.service.js'
import { isUuid } from '../utils/interviewEvaluationValidation.js'
import { sendError } from '../utils/http.js'
import {
  isPracticeBranch,
  isPracticeKind,
  validatePracticeAnswer,
  validatePracticeSession,
  type PracticeBranchId,
  type PracticeKind,
} from '../utils/practiceValidation.js'
import { getServiceWriteClient } from '../utils/serviceWriteClient.js'

function requireStudent(req: Request, res: Response): boolean {
  if (!req.auth || !req.supabase) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return false
  }
  if (req.auth.role !== 'student') {
    sendError(res, 403, 'forbidden', 'Practice is available to student accounts only.')
    return false
  }
  return true
}

function requireBank(req: Request, res: Response): SupabaseClient | null {
  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'practice_not_configured', 'Practice storage is not configured.')
    return null
  }
  return writer
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof GroqError) {
    sendError(res, err.status, err.code, err.message)
    return
  }
  if (isMissingPracticeTable(err as { code?: string; message?: string } | null)) {
    sendError(
      res,
      503,
      'practice_not_configured',
      'Practice is not set up yet. Apply migration 20260114000000_practice_hub.sql.',
    )
    return
  }
  const code = typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code ?? '')
    : ''
  if (code === '42501') {
    sendError(res, 403, 'forbidden', 'You cannot access this practice data.')
    return
  }
  console.error('[mockmate-backend] practice request failed:', err)
  sendError(res, 500, 'practice_failed', 'Something went wrong in practice. Please retry.')
}

function routeId(req: Request): string {
  const raw = req.params.id
  return typeof raw === 'string' ? raw : ''
}

function queryString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseKind(value: unknown): PracticeKind | null {
  return isPracticeKind(value) ? value : null
}

// GET /api/practice/catalog?kind=branch_mcq&branch=cse
export async function catalogHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const kind = parseKind(req.query.kind)
  if (!kind) {
    sendError(res, 400, 'invalid_kind', 'kind must be branch_mcq or aptitude.')
    return
  }
  const rawBranch = queryString(req.query.branch)
  let branch: PracticeBranchId | null = null
  if (kind === 'branch_mcq') {
    if (!isPracticeBranch(rawBranch)) {
      sendError(res, 400, 'invalid_branch', 'A valid branch is required for branch MCQ practice.')
      return
    }
    branch = rawBranch
  }
  const bank = requireBank(req, res)
  if (!bank) return

  try {
    const catalog = await listPracticeCatalog(bank, kind, branch)
    res.status(200).json(catalog)
  } catch (err) {
    handleError(res, err)
  }
}

// POST /api/practice/sessions
export async function createSessionHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const parsed = validatePracticeSession(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }
  const bank = requireBank(req, res)
  if (!bank) return

  try {
    const result = await createPracticeSession(bank, req.auth!.userId, parsed.value, {
      // Reuses the existing Groq configuration; the key never leaves the server.
      generate: (target, missing) => generatePracticeQuestions(bank, target, missing),
    })
    if (!result.ok) {
      sendError(
        res,
        409,
        'practice_no_questions',
        'No questions are available for this selection yet.',
      )
      return
    }
    res.status(201).json({ ...result.view, generation: result.generation })
  } catch (err) {
    handleError(res, err)
  }
}

// GET /api/practice/sessions/active?kind=branch_mcq
export async function activeSessionHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const kind = parseKind(req.query.kind)
  if (!kind) {
    sendError(res, 400, 'invalid_kind', 'kind must be branch_mcq or aptitude.')
    return
  }
  const bank = requireBank(req, res)
  if (!bank) return

  try {
    const view = await getActivePracticeSession(bank, req.auth!.userId, kind)
    res.status(200).json(view ?? { session: null, questions: [] })
  } catch (err) {
    handleError(res, err)
  }
}

// GET /api/practice/sessions/history?kind=branch_mcq
export async function historyHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const rawKind = queryString(req.query.kind)
  const kind = rawKind ? parseKind(rawKind) : undefined
  if (rawKind && !kind) {
    sendError(res, 400, 'invalid_kind', 'kind must be branch_mcq or aptitude.')
    return
  }
  const bank = requireBank(req, res)
  if (!bank) return

  try {
    const sessions = await listPracticeHistory(bank, req.auth!.userId, kind ?? undefined)
    res.status(200).json({ sessions })
  } catch (err) {
    handleError(res, err)
  }
}

// GET /api/practice/sessions/:id
export async function getSessionHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const sessionId = routeId(req)
  if (!isUuid(sessionId)) {
    sendError(res, 400, 'invalid_session', 'Invalid practice session id.')
    return
  }
  const bank = requireBank(req, res)
  if (!bank) return

  try {
    const view = await getPracticeSessionView(bank, sessionId, req.auth!.userId)
    if (!view) {
      sendError(res, 404, 'practice_session_not_found', 'Practice session not found.')
      return
    }
    res.status(200).json(view)
  } catch (err) {
    handleError(res, err)
  }
}

// POST /api/practice/sessions/:id/answers
export async function answerHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const sessionId = routeId(req)
  if (!isUuid(sessionId)) {
    sendError(res, 400, 'invalid_session', 'Invalid practice session id.')
    return
  }
  const parsed = validatePracticeAnswer(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }
  const bank = requireBank(req, res)
  if (!bank) return

  try {
    const result = await recordPracticeAnswer(
      bank,
      sessionId,
      req.auth!.userId,
      parsed.value.questionId,
      parsed.value.selectedIndex,
    )
    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          sendError(res, 404, 'practice_session_not_found', 'Practice session not found.')
          return
        case 'not_active':
          sendError(res, 409, 'practice_session_not_active', 'This practice session has already ended.')
          return
        case 'expired':
          sendError(res, 409, 'practice_session_expired', 'The timed practice session has ended.')
          return
        case 'question_not_in_session':
          sendError(res, 400, 'practice_question_mismatch', 'That question does not belong to this session.')
          return
      }
    }
    res.status(200).json({
      duplicate: result.duplicate,
      answer: result.answer,
      session: result.session,
    })
  } catch (err) {
    handleError(res, err)
  }
}

// POST /api/practice/sessions/:id/complete
export async function completeSessionHandler(req: Request, res: Response): Promise<void> {
  if (!requireStudent(req, res)) return
  const sessionId = routeId(req)
  if (!isUuid(sessionId)) {
    sendError(res, 400, 'invalid_session', 'Invalid practice session id.')
    return
  }
  const bank = requireBank(req, res)
  if (!bank) return

  try {
    const view = await completePracticeSession(bank, sessionId, req.auth!.userId)
    if (!view) {
      sendError(res, 404, 'practice_session_not_found', 'Practice session not found.')
      return
    }
    res.status(200).json(view)
  } catch (err) {
    handleError(res, err)
  }
}
