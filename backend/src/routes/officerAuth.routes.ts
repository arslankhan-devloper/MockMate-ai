import { Router } from 'express'
import { listPublicCollegesHandler, officerRegisterHandler } from '../controllers/officerAuth.controller.js'
import { rateLimit } from '../middleware/rateLimit.js'

export const officerAuthRouter = Router()

// Public listing of colleges for dropdown selection
officerAuthRouter.get('/colleges', listPublicCollegesHandler)

// Officer registration: rate-limited to 10 requests per 15 minutes per IP
officerAuthRouter.post(
  '/register',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    scope: 'officer-register',
    code: 'officer_registration_rate_limited',
    message: 'Too many registration attempts. Please try again later.',
  }),
  officerRegisterHandler,
)
