import { Router } from 'express'
import {
  getActiveSessionHandler,
  hintHandler,
  nextQuestionHandler,
  openSessionHandler,
  progressHandler,
  runHandler,
  submitHandler,
} from '../controllers/problemSolving.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'

// Authenticated problem-solving workspace.
//
//   POST  /api/problem-solving/sessions                  open/restore active session
//   GET   /api/problem-solving/sessions/active           restore without generating
//   POST  /api/problem-solving/sessions/:id/next-question next adaptive problem
//   POST  /api/problem-solving/questions/:id/hint        reveal one hint
//   POST  /api/problem-solving/questions/:id/run         run visible tests only
//   POST  /api/problem-solving/questions/:id/submit      idempotent visible + hidden grading
//   GET   /api/problem-solving/progress                  per-topic progress
//
// `requireAuth` derives the student from the verified Supabase token. The
// student id is never accepted from the request body. Static routes precede
// `/:id`, and only students can access this feature.
export const problemSolvingRouter = Router()

problemSolvingRouter.use(requireAuth, requireRole('student'))

problemSolvingRouter.post(
  '/sessions',
  rateLimit({
    windowMs: 60_000,
    max: 10,
    scope: 'problem-open',
    code: 'problem_generation_rate_limited',
    message: 'You are opening problem sessions too quickly. Please wait a minute.',
  }),
  openSessionHandler,
)
problemSolvingRouter.get('/sessions/active', getActiveSessionHandler)
problemSolvingRouter.post(
  '/sessions/:id/next-question',
  rateLimit({
    windowMs: 60_000,
    max: 6,
    scope: 'problem-next',
    code: 'problem_generation_rate_limited',
    message: 'You are generating problems too quickly. Please wait a minute.',
  }),
  nextQuestionHandler,
)
problemSolvingRouter.post('/questions/:id/hint', hintHandler)
problemSolvingRouter.post(
  '/questions/:id/run',
  rateLimit({
    windowMs: 60_000,
    max: 30,
    scope: 'problem-run',
    code: 'code_run_rate_limited',
    message: 'You have run code too many times this minute. Please wait a moment.',
  }),
  runHandler,
)
problemSolvingRouter.post(
  '/questions/:id/submit',
  rateLimit({
    windowMs: 60_000,
    max: 12,
    scope: 'problem-submit',
    code: 'problem_submit_rate_limited',
    message: 'You have submitted too many times this minute. Please wait a moment.',
  }),
  submitHandler,
)
problemSolvingRouter.get('/progress', progressHandler)
