import { Router } from 'express'
import {
  generateRoadmapPlanHandler,
  generateRoadmapTopicResourcesHandler,
  getRoadmapPlanHandler,
  getRoadmapTopicResourcesHandler,
  listRoadmapProgressHandler,
  setRoadmapProgressHandler,
} from '../controllers/roadmap.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

// Authenticated, student-only roadmap progress and AI plan.
//
//   GET /api/roadmap/progress                         the caller's completed topics
//   PUT /api/roadmap/progress/:domainId/:topicId      idempotent completion toggle
//   GET /api/roadmap/resources/:domainId/:topicId     saved learning resources
//   POST /api/roadmap/resources/:domainId/:topicId    generate + upsert four resources
//   GET /api/roadmap/plan                             the caller's latest AI plan
//   POST /api/roadmap/plan                            generate and save a fresh plan
//
// `requireAuth` derives the owner from the verified token, and `requireRole`
// keeps placement officers out of student roadmap data.
export const roadmapRouter = Router()

roadmapRouter.use(requireAuth)
roadmapRouter.use(requireRole('student'))
roadmapRouter.get('/progress', listRoadmapProgressHandler)
roadmapRouter.put('/progress/:domainId/:topicId', setRoadmapProgressHandler)
roadmapRouter.get('/resources/:domainId/:topicId', getRoadmapTopicResourcesHandler)
roadmapRouter.post('/resources/:domainId/:topicId', generateRoadmapTopicResourcesHandler)
roadmapRouter.get('/plan', getRoadmapPlanHandler)
roadmapRouter.post('/plan', generateRoadmapPlanHandler)
