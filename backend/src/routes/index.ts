import type { Express } from 'express'
import { accountRouter } from './account.routes.js'
import { applicationsRouter } from './applications.routes.js'
import { healthRouter } from './health.routes.js'
import { interviewsRouter } from './interviews.routes.js'
import { jobsRouter } from './jobs.routes.js'
import { problemSolvingRouter } from './problemSolving.routes.js'
import { profileRouter } from './profile.routes.js'
import { resumeRouter } from './resume.routes.js'
import { roadmapRouter } from './roadmap.routes.js'

// Registers all API routes under the /api prefix.
//
// Feature routers apply `requireAuth` themselves so identity, role and college
// scope always come from the verified token and the database, never from the
// request body.
export function registerRoutes(app: Express): void {
  app.use('/api/health', healthRouter)
  app.use('/api/account', accountRouter)
  app.use('/api/profile', profileRouter)
  app.use('/api/jobs', jobsRouter)
  app.use('/api/applications', applicationsRouter)
  app.use('/api/resume', resumeRouter)
  app.use('/api/roadmap', roadmapRouter)
  app.use('/api/interviews', interviewsRouter)
  app.use('/api/problem-solving', problemSolvingRouter)
}
