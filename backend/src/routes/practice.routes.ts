import { Router } from 'express'
import {
  activeSessionHandler,
  answerHandler,
  catalogHandler,
  completeSessionHandler,
  createSessionHandler,
  getSessionHandler,
  historyHandler,
} from '../controllers/practice.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'

// Placement Preparation & Practice Hub — branch MCQ and aptitude practice.
//
//   GET   /api/practice/catalog                    question-bank catalog + counts
//   GET   /api/practice/sessions/active            latest unfinished session
//   GET   /api/practice/sessions/history           the caller's own sessions
//   POST  /api/practice/sessions                   start a practice/timed session
//   GET   /api/practice/sessions/:id               session with safe questions
//   POST  /api/practice/sessions/:id/answers       record one server-scored answer
//   POST  /api/practice/sessions/:id/complete      finalize and return the score
//
// DSA practice keeps its existing `/api/problem-solving` routes. Static paths
// precede `/:id`. Only students can access this feature.
export const practiceRouter = Router()

practiceRouter.use(requireAuth, requireRole('student'))

practiceRouter.get('/catalog', catalogHandler)
practiceRouter.get('/sessions/active', activeSessionHandler)
practiceRouter.get('/sessions/history', historyHandler)
practiceRouter.post(
  '/sessions',
  rateLimit({
    windowMs: 60_000,
    max: 10,
    scope: 'practice-start',
    code: 'practice_start_rate_limited',
    message: 'You are starting practice sessions too quickly. Please wait a minute.',
  }),
  // AI generation is billed per call, so it gets a tighter budget of its own.
  rateLimit({
    windowMs: 60_000,
    max: 5,
    scope: 'practice-generate',
    code: 'practice_generation_rate_limited',
    message: 'Too many question-generation requests. Please wait a minute.',
  }),
  createSessionHandler,
)
practiceRouter.get('/sessions/:id', getSessionHandler)
practiceRouter.post(
  '/sessions/:id/answers',
  rateLimit({
    windowMs: 60_000,
    max: 120,
    scope: 'practice-answer',
    code: 'practice_answer_rate_limited',
    message: 'You are answering too quickly. Please wait a moment.',
  }),
  answerHandler,
)
practiceRouter.post('/sessions/:id/complete', completeSessionHandler)
