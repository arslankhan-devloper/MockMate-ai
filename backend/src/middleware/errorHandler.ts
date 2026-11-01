import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'

// Express recognizes this as an error handler because it takes four arguments.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (env.nodeEnv !== 'production') {
    const message = err instanceof Error ? err.stack ?? err.message : String(err)
    console.error('[mockmate-backend] Unhandled error:', message)
  }

  if (res.headersSent) {
    return
  }

  res.status(500).json({ error: 'Internal server error' })
}
