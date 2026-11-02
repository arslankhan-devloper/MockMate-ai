import { Router } from 'express'
import {
  getAdminDashboardHandler,
  listAdminCollegesHandler,
  createCollegeHandler,
  updateCollegeHandler,
  listOfficersHandler,
  approveOfficerHandler,
  rejectOfficerHandler,
  suspendOfficerHandler,
  reactivateOfficerHandler,
  assignOfficerCollegeHandler,
  listStudentsHandler,
  getStudentDetailsHandler,
  updateStudentCollegeHandler,
  listAllDrivesHandler,
  createAdminDriveHandler,
  updateAdminDriveHandler,
  closeAdminDriveHandler,
  listDriveApplicationsHandler,
  updateAdminApplicationStatusHandler,
  listAuditLogsHandler,
} from '../controllers/admin.controller.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

export const adminRouter = Router()

// Every admin route strictly requires authentication and the verified 'super_admin' role
adminRouter.use(requireAuth)
adminRouter.use(requireAdmin)

// Dashboard & Analytics
adminRouter.get('/dashboard', getAdminDashboardHandler)

// Colleges
adminRouter.get('/colleges', listAdminCollegesHandler)
adminRouter.post('/colleges', createCollegeHandler)
adminRouter.patch('/colleges/:id', updateCollegeHandler)

// Placement Officers
adminRouter.get('/officers', listOfficersHandler)
adminRouter.post('/officers/:id/approve', approveOfficerHandler)
adminRouter.post('/officers/:id/reject', rejectOfficerHandler)
adminRouter.post('/officers/:id/suspend', suspendOfficerHandler)
adminRouter.post('/officers/:id/reactivate', reactivateOfficerHandler)
adminRouter.patch('/officers/:id/college', assignOfficerCollegeHandler)

// Students
adminRouter.get('/students', listStudentsHandler)
adminRouter.get('/students/:id', getStudentDetailsHandler)
adminRouter.patch('/students/:id/college', updateStudentCollegeHandler)

// Placement Drives
adminRouter.get('/drives', listAllDrivesHandler)
adminRouter.post('/drives', createAdminDriveHandler)
adminRouter.patch('/drives/:id', updateAdminDriveHandler)
adminRouter.post('/drives/:id/close', closeAdminDriveHandler)
adminRouter.get('/drives/:id/applications', listDriveApplicationsHandler)
adminRouter.patch('/drives/:id/applications/:appId', updateAdminApplicationStatusHandler)

// Audit Logs
adminRouter.get('/audit-logs', listAuditLogsHandler)
