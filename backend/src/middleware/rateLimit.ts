import type { NextFunction, Request, Response } from 'express'
import { sendError } from '../utils/http.js'

// Small in-process rate limiter for expensive problem-solving endpoints.
//
// This is intentionally dependency-free and per-process. A multi-instance
// deployment should put a shared limiter (or an API gateway) in front of it, but
// this still prevents one user from hammering AI generation or the sandbox in a
// single-node deployment.
interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function prune(now: number): void {
  if (buckets.size < 1000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function rateLimit(options: {
  windowMs: number
  max: number
  scope: string
  code?: string
  message?: string
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const identity = req.auth?.userId ?? req.ip ?? 'anonymous'
    const key = `${options.scope}:${identity}`
    const now = Date.now()
    prune(now)
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      sendError(
        res,
        429,
        options.code ?? 'rate_limited',
        options.message ?? 'Too many requests. Please wait a moment and try again.',
      )
      return
    }
    next()
  }
}
