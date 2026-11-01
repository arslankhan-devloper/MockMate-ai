import { Router } from 'express'
import {
  listApplicationsHandler,
  listMyApplicationsHandler,
  updateApplicationStatusHandler,
  withdrawApplicationHandler,
} from '../controllers/applications.controller.js'
import { requireAuth, requireCollegeMembership, requireRole } from '../middleware/auth.js'

export const applicationsRouter = Router()

applicationsRouter.use(requireAuth)

applicationsRouter.get(
  '/',
  requireRole('placement-officer'),
  requireCollegeMembership,
  listApplicationsHandler,
)
applicationsRouter.get('/me', requireRole('student'), listMyApplicationsHandler)
applicationsRouter.delete('/:id', requireRole('student'), withdrawApplicationHandler)
applicationsRouter.patch(
  '/:id',
  requireRole('placement-officer'),
  requireCollegeMembership,
  updateApplicationStatusHandler,
)
