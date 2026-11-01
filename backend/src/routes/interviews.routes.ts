import { Router } from 'express'
import {
  adaptiveNextQuestionHandler,
  createSessionHandler,
  evaluateTurnHandler,
  getAnalyticsHandler,
  getSessionHandler,
  listSessionsHandler,
  updateSessionHandler,
  upsertTurnHandler,
} from '../controllers/interviews.controller.js'
import {
  listCodingRoundAttemptsHandler,
  runCodingRoundHandler,
} from '../controllers/codingRound.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'

// Authenticated interview-session persistence.
//
//   POST  /api/interviews                          start a session for the caller
//   GET   /api/interviews                          list the caller's own sessions
//   GET   /api/interviews/analytics                aggregated metrics for the caller
//   GET   /api/interviews/:id                      one session + its turns + evaluations
//   PATCH /api/interviews/:id                      update the caller's own session
//   PUT   /api/interviews/:id/turns/:index         upsert one question/answer turn
//   POST  /api/interviews/:id/turns/:index/evaluate evaluate one stored answer
//   POST  /api/interviews/:id/turns/:index/next-question
//                                                   evaluate + generate the next question
//   POST  /api/interviews/:id/coding/run            execute Coding Round code (provider-backed)
//   GET   /api/interviews/:id/coding/attempts       the caller's runs for this session
//
// `requireAuth` derives identity from the verified Supabase token, so every
// handler is scoped to the caller. The caller's `student_id` is never read from
// the request body.
export const interviewsRouter = Router()

interviewsRouter.use(requireAuth)
interviewsRouter.post('/', createSessionHandler)
interviewsRouter.get('/', listSessionsHandler)
// Static route MUST precede `/:id`, otherwise "analytics" is captured as an id.
interviewsRouter.get('/analytics', getAnalyticsHandler)
interviewsRouter.get('/:id', getSessionHandler)
interviewsRouter.patch('/:id', updateSessionHandler)
interviewsRouter.put('/:id/turns/:index', upsertTurnHandler)
interviewsRouter.post('/:id/turns/:index/evaluate', evaluateTurnHandler)
interviewsRouter.post('/:id/turns/:index/next-question', adaptiveNextQuestionHandler)
interviewsRouter.post('/:id/coding/run', rateLimit({
  windowMs: 60_000,
  max: 20,
  scope: 'coding-run',
  code: 'coding_rate_limited',
  message: 'You have run code too many times this minute. Please wait a moment.',
}), runCodingRoundHandler)
interviewsRouter.get('/:id/coding/attempts', listCodingRoundAttemptsHandler)
