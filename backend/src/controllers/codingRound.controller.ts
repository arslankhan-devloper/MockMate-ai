// Coding Round HTTP handlers.
//
// Every handler is mounted behind `requireAuth`; ownership is re-checked against
// the caller's own interview session before a run is executed or an attempt is
// read. The browser never sees the OnlineCompiler.io key.

import type { Request, Response } from 'express'
import {
  insertCodingAttempt,
  isMissingCodingAttemptTable,
  listCodingAttempts,
  mapCodingAttemptRow,
  type CodingAttemptRow,
} from '../services/codingRound.service.js'
import { getOwnSession, type SessionRow } from '../services/interviews.service.js'
import { CodingProviderError, runOnlineCompiler } from '../services/onlineCompiler.service.js'
import { sendError } from '../utils/http.js'
import { validateCodingRun } from '../utils/codingRoundValidation.js'
import { getServiceWriteClient } from '../utils/serviceWriteClient.js'

let codingAttemptTableWarned = false

function routeId(req: Request): string {
  const raw = req.params.id
  return typeof raw === 'string' ? raw : ''
}

function mapProviderError(res: Response, error: CodingProviderError): void {
  switch (error.code) {
    case 'not_configured':
    case 'auth':
      sendError(res, 503, 'coding_not_configured', 'Coding Round execution is not available right now.')
      return
    case 'invalid_request':
      sendError(res, 400, 'coding_request_rejected', error.message)
      return
    case 'rate_limited':
      res.setHeader('Retry-After', '5')
      sendError(res, 429, 'coding_rate_limited', error.message)
      return
    case 'timeout':
      sendError(res, 504, 'coding_timeout', error.message)
      return
    case 'invalid_response':
      sendError(res, 502, 'coding_provider_error', error.message)
      return
    case 'unavailable':
    default:
      sendError(res, 502, 'coding_unavailable', error.message)
  }
}

// POST /api/interviews/:id/coding/run
// Body: { language, code, input?, timeLimit?, questionIndex? }
export async function runCodingRoundHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const sessionId = routeId(req)
  if (!sessionId) {
    sendError(res, 400, 'invalid_id', 'A session id is required.')
    return
  }

  const parsed = validateCodingRun(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  const { data: session, error: sessionError } = await getOwnSession(client, sessionId, auth.userId)
  if (sessionError) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview session.')
    return
  }
  if (!session) {
    sendError(res, 404, 'interview_not_found', 'Interview session not found.')
    return
  }
  if ((session as unknown as SessionRow).interview_type !== 'coding') {
    sendError(res, 400, 'not_coding_session', 'This session is not a Coding Round.')
    return
  }

  let result
  try {
    result = await runOnlineCompiler({
      language: parsed.value.language,
      code: parsed.value.code,
      input: parsed.value.input,
      timeLimit: parsed.value.timeLimit,
    })
  } catch (error) {
    if (error instanceof CodingProviderError) {
      mapProviderError(res, error)
      return
    }
    console.error('[mockmate-backend] unexpected coding runner error')
    sendError(res, 500, 'coding_run_failed', 'The code run failed unexpectedly. Retry.')
    return
  }

  // Persist the attempt for the owning session. A missing migration must not
  // hide a successful run, so it degrades to `persisted: false`.
  const writer = getServiceWriteClient(req)
  let attempt = null
  let persisted = false
  let warning: string | undefined

  if (!writer) {
    warning = 'Run history is not configured; this attempt was not saved.'
  } else {
    const { data, error } = await insertCodingAttempt(writer, {
      sessionId,
      studentId: auth.userId,
      questionIndex: parsed.value.questionIndex,
      language: parsed.value.language,
      code: parsed.value.code,
      input: parsed.value.input,
      result,
    })
    if (error) {
      if (isMissingCodingAttemptTable(error)) {
        if (!codingAttemptTableWarned) {
          codingAttemptTableWarned = true
          console.warn(
            '[mockmate-backend] interview_coding_attempts is unavailable; apply migration ' +
              '20260113000000_interview_coding_attempts.sql to persist coding runs.',
          )
        }
        warning = 'Run history is not available until the coding-attempts migration is applied.'
      } else {
        console.error(`[mockmate-backend] coding attempt store error: ${error.message ?? error.code ?? 'unknown'}`)
        warning = 'The run completed, but its attempt could not be saved.'
      }
    } else if (data) {
      attempt = mapCodingAttemptRow(data as unknown as CodingAttemptRow)
      persisted = true
    }
  }

  res.status(200).json({
    result,
    attempt,
    persisted,
    ...(warning ? { warning } : {}),
  })
}

// GET /api/interviews/:id/coding/attempts
export async function listCodingRoundAttemptsHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const sessionId = routeId(req)
  if (!sessionId) {
    sendError(res, 400, 'invalid_id', 'A session id is required.')
    return
  }

  const { data: session, error: sessionError } = await getOwnSession(client, sessionId, auth.userId)
  if (sessionError) {
    sendError(res, 500, 'interview_read_failed', 'Could not load the interview session.')
    return
  }
  if (!session) {
    sendError(res, 404, 'interview_not_found', 'Interview session not found.')
    return
  }

  const { data, error } = await listCodingAttempts(client, sessionId, auth.userId)
  if (error) {
    if (isMissingCodingAttemptTable(error)) {
      res.status(200).json({ attempts: [], available: false })
      return
    }
    sendError(res, 500, 'coding_attempts_read_failed', 'Could not load coding attempts.')
    return
  }

  const rows = (data ?? []) as unknown as CodingAttemptRow[]
  res.status(200).json({ attempts: rows.map(mapCodingAttemptRow), available: true })
}
