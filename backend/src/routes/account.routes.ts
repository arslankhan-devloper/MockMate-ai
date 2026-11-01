import { Router, type NextFunction, type Request, type Response } from 'express'
import { deleteAccountHandler } from '../controllers/account.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { sendError } from '../utils/http.js'

// Account deletion is a self-service action. The user id is always taken from
// the verified bearer token; the body carries only the password reauthentication
// proof and the explicit confirmation phrase.
//
// Requiring JSON would otherwise be a simple cross-site form post. Bearer tokens
// are not sent automatically by browsers, and the CORS allowlist rejects
// unapproved origins, but the JSON check adds a second layer.
export const accountRouter = Router()

accountRouter.use(requireAuth)

export function requireJsonContentType(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.is('application/json')) {
    sendError(res, 415, 'json_required', 'Account deletion must be sent as JSON.')
    return
  }
  next()
}

accountRouter.delete(
  '/',
  requireJsonContentType,
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    scope: 'account-deletion',
    code: 'account_deletion_rate_limited',
    message: 'Too many account deletion attempts. Please wait and try again later.',
  }),
  deleteAccountHandler,
)
