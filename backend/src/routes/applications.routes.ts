import { Router } from 'express'
import {
  listApplicationsHandler,
  listMyApplicationsHandler,
  updateApplicationStatusHandler,
  withdrawApplicationHandler,
  listOfficerStudentsHandler,
  verifyOfficerStudentHandler,
  rejectOfficerStudentHandler,
} from '../controllers/applications.controller.js'
import { requireAuth, requireCollegeMembership, requireRole } from '../middleware/auth.js'

export const applicationsRouter = Router()

applicationsRouter.use(requireAuth)

const officerOnly = [requireRole('placement-officer'), requireCollegeMembership] as const

// Application routes
applicationsRouter.get(
  '/',
  ...officerOnly,
  listApplicationsHandler,
)
applicationsRouter.get('/me', requireRole('student'), listMyApplicationsHandler)
applicationsRouter.delete('/:id', requireRole('student'), withdrawApplicationHandler)
applicationsRouter.patch(
  '/:id',
  ...officerOnly,
  updateApplicationStatusHandler,
)

// Officer student verification routes (strictly scoped to officer's college)
applicationsRouter.get('/students', ...officerOnly, listOfficerStudentsHandler)
applicationsRouter.post('/students/:id/verify', ...officerOnly, verifyOfficerStudentHandler)
applicationsRouter.post('/students/:id/reject', ...officerOnly, rejectOfficerStudentHandler)
