import { Router } from 'express'
import { listExternalJobsHandler } from '../controllers/externalJobs.controller.js'
import {
  applyToJobHandler,
  closeJobHandler,
  createJobHandler,
  getJobHandler,
  listJobApplicationsHandler,
  listJobsHandler,
  publishJobHandler,
  updateJobHandler,
} from '../controllers/jobs.controller.js'
import { requireAuth, requireCollegeMembership, requireRole } from '../middleware/auth.js'

export const jobsRouter = Router()

// Every route requires a verified access token. Role and college membership
// checks use the values loaded from the database by `requireAuth`.
jobsRouter.use(requireAuth)

jobsRouter.get('/', listJobsHandler)
jobsRouter.get('/external', listExternalJobsHandler)
jobsRouter.get('/:id', getJobHandler)

const officerOnly = [requireRole('placement-officer'), requireCollegeMembership] as const

jobsRouter.post('/', ...officerOnly, createJobHandler)
jobsRouter.patch('/:id', ...officerOnly, updateJobHandler)
jobsRouter.post('/:id/publish', ...officerOnly, publishJobHandler)
jobsRouter.post('/:id/close', ...officerOnly, closeJobHandler)
jobsRouter.get('/:id/applications', ...officerOnly, listJobApplicationsHandler)

jobsRouter.post('/:id/applications', requireRole('student'), applyToJobHandler)
