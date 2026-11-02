import { Router } from 'express'
import { dashboardHandler } from '../controllers/analytics.controller.js'
import { requireAuth } from '../middleware/auth.js'

// Unified student performance & placement analytics.
//
//   GET  /api/analytics/dashboard?range=1w|1m|3m|all
//
// Scope (own records vs own college) is derived from the verified session, never
// from the request. The endpoint only returns aggregates and counts.
export const analyticsRouter = Router()

analyticsRouter.use(requireAuth)

analyticsRouter.get('/dashboard', dashboardHandler)
