import type { Request, Response } from 'express'
import {
  getExternalJobs,
  parseExternalJobsQuery,
} from '../services/externalJobs.service.js'
import { sendError } from '../utils/http.js'

export async function listExternalJobsHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const parsed = parseExternalJobsQuery(req.query as Record<string, unknown>)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message)
    return
  }

  const result = await getExternalJobs(parsed.value)
  res.status(200).json(result)
}
