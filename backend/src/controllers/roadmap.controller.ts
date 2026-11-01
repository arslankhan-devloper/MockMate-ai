import type { Request, Response } from 'express'
import {
  buildRoadmapPlanContext,
  completeRoadmapTopic,
  getRoadmapPlan,
  listRoadmapProgress,
  listRoadmapTopicResources,
  mapRoadmapProgressRow,
  mapRoadmapTopicResourceRow,
  saveRoadmapPlan,
  saveRoadmapTopicResources,
  uncompleteRoadmapTopic,
  type RoadmapPlanRow,
  type RoadmapProgressRow,
  type RoadmapTopicResourceRow,
} from '../services/roadmap.service.js'
import { generateRoadmapPlan } from '../services/roadmapPlan.service.js'
import { generateRoadmapTopicResources } from '../services/roadmapResources.service.js'
import { GroqError } from '../services/resume.service.js'
import { sendError } from '../utils/http.js'
import {
  asRoadmapPlan,
  validateRoadmapPlanRequest,
} from '../utils/roadmapPlanValidation.js'
import { resolveRoadmapTopic } from '../utils/roadmapResourcesValidation.js'
import {
  validateRoadmapProgressBody,
  validateRoadmapTopicParams,
} from '../utils/roadmapValidation.js'

function routeParam(req: Request, key: string): unknown {
  return req.params[key]
}

function sendWriteError(
  res: Response,
  error: { code?: string; message?: string } | null,
): void {
  if (error?.code === '42501') {
    sendError(res, 403, 'forbidden', 'You cannot change roadmap progress for this account.')
    return
  }
  if (error?.code === '23503') {
    sendError(res, 404, 'profile_not_found', 'No student profile exists for this account yet.')
    return
  }
  if (error?.code === '23514') {
    sendError(res, 400, 'validation_error', 'The roadmap topic is not valid.')
    return
  }
  sendError(res, 500, 'roadmap_progress_write_failed', 'Could not save your roadmap progress.')
}

// GET /api/roadmap/progress - the authenticated student's completed topics.
export async function listRoadmapProgressHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const { data, error } = await listRoadmapProgress(client, auth.userId)
  if (error) {
    sendError(res, 500, 'roadmap_progress_read_failed', 'Could not load your roadmap progress.')
    return
  }

  const rows = (data ?? []) as unknown as RoadmapProgressRow[]
  res.status(200).json({
    progress: rows.map(mapRoadmapProgressRow),
  })
}

// PUT /api/roadmap/progress/:domainId/:topicId
// Body: { completed: boolean }
//
// `student_id` comes only from the verified auth context. Both operations are
// idempotent, so retries cannot create duplicate rows or fail on a missing row.
export async function setRoadmapProgressHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const params = validateRoadmapTopicParams(
    routeParam(req, 'domainId'),
    routeParam(req, 'topicId'),
  )
  if (!params.ok) {
    sendError(res, 400, 'validation_error', params.message, { fields: params.fields })
    return
  }

  const body = validateRoadmapProgressBody(req.body)
  if (!body.ok) {
    sendError(res, 400, 'validation_error', body.message, { fields: body.fields })
    return
  }

  const { domainId, topicId } = params.value
  const { completed } = body.value

  const result = completed
    ? await completeRoadmapTopic(client, auth.userId, domainId, topicId)
    : await uncompleteRoadmapTopic(client, auth.userId, domainId, topicId)

  if (result.error) {
    sendWriteError(res, result.error)
    return
  }

  res.status(200).json({ domainId, topicId, completed })
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message ?? '') ||
    /could not find the table .*schema cache/i.test(error.message ?? '')
  )
}

let planStorageWarningLogged = false
let resourceStorageWarningLogged = false

// GET /api/roadmap/resources/:domainId/:topicId - AI learning resources saved
// for this student and curated topic. A missing table is reported as
// unavailable instead of failing the study panel.
export async function getRoadmapTopicResourcesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const topic = resolveRoadmapTopic(
    routeParam(req, 'domainId'),
    routeParam(req, 'topicId'),
  )
  if (!topic.ok) {
    sendError(res, 400, 'validation_error', topic.message, { fields: topic.fields })
    return
  }

  const { domainId, topicId } = topic.value
  const { data, error } = await listRoadmapTopicResources(
    client,
    auth.userId,
    domainId,
    topicId,
  )

  if (error) {
    if (isMissingRelation(error)) {
      if (!resourceStorageWarningLogged) {
        resourceStorageWarningLogged = true
        console.warn(
          '[mockmate-backend] roadmap_topic_resources is unavailable; apply migration ' +
            '20260107000000_roadmap_topic_resources.sql to persist learning resources.',
        )
      }
      res.status(200).json({
        domainId,
        topicId,
        resources: [],
        generatedAt: null,
        storageAvailable: false,
      })
      return
    }
    sendError(res, 500, 'roadmap_resources_read_failed', 'Could not load learning resources.')
    return
  }

  const rows = (data ?? []) as unknown as RoadmapTopicResourceRow[]
  const resources = rows.map(mapRoadmapTopicResourceRow)
  res.status(200).json({
    domainId,
    topicId,
    resources,
    generatedAt:
      resources
        .map((resource) => resource.generatedAt)
        .filter((value): value is string => typeof value === 'string')
        .sort()
        .at(-1) ?? null,
    storageAvailable: true,
  })
}

// POST /api/roadmap/resources/:domainId/:topicId - generate exactly four
// resources and upsert them into the student's type slots.
export async function generateRoadmapTopicResourcesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const topic = resolveRoadmapTopic(
    routeParam(req, 'domainId'),
    routeParam(req, 'topicId'),
  )
  if (!topic.ok) {
    sendError(res, 400, 'validation_error', topic.message, { fields: topic.fields })
    return
  }

  const { domainId, topicId } = topic.value

  try {
    const resources = await generateRoadmapTopicResources(topic.value)
    const generatedAt = new Date().toISOString()
    const saveResult = await saveRoadmapTopicResources(
      client,
      auth.userId,
      domainId,
      topicId,
      resources,
      generatedAt,
    )

    const missingStorage = isMissingRelation(saveResult.error)
    if (missingStorage) {
      if (!resourceStorageWarningLogged) {
        resourceStorageWarningLogged = true
        console.warn(
          '[mockmate-backend] roadmap_topic_resources is unavailable; generated learning ' +
            'resources will not persist until migration 20260107000000_roadmap_topic_resources.sql is applied.',
        )
      }
    } else if (saveResult.error) {
      console.error(
        `[mockmate-backend] roadmap resources save failed: ` +
          `${saveResult.error.message ?? saveResult.error.code ?? 'unknown'}`,
      )
    }

    res.status(200).json({
      domainId,
      topicId,
      resources: resources.map((resource) => ({
        ...resource,
        domainId,
        topicId,
        generatedAt,
      })),
      generatedAt,
      persisted: !saveResult.error,
      storageAvailable: !missingStorage,
    })
  } catch (err) {
    if (err instanceof GroqError) {
      sendError(res, err.status, err.code, err.message)
      return
    }
    sendError(res, 502, 'roadmap_resources_failed', 'Could not generate learning resources.')
  }
}

// GET /api/roadmap/plan - the caller's most recently generated plan, if any.
// A missing table is reported as unavailable rather than failing the page, so the
// browser can still show its built-in starter plan.
export async function getRoadmapPlanHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const { data, error } = await getRoadmapPlan(client, auth.userId)
  if (error) {
    if (isMissingRelation(error)) {
      if (!planStorageWarningLogged) {
        planStorageWarningLogged = true
        console.warn(
          '[mockmate-backend] roadmap_ai_plans is unavailable; apply migration ' +
            '20260106000000_roadmap_ai_plans.sql to persist AI plans.',
        )
      }
      res.status(200).json({ plan: null, generatedAt: null, storageAvailable: false })
      return
    }
    sendError(res, 500, 'roadmap_plan_read_failed', 'Could not load your AI roadmap plan.')
    return
  }

  const row = (data ?? null) as RoadmapPlanRow | null
  res.status(200).json({
    plan: row ? asRoadmapPlan(row.plan) : null,
    generatedAt: row?.generated_at ?? null,
    storageAvailable: true,
  })
}

// POST /api/roadmap/plan - generate a fresh plan from the student's profile,
// optional resume context and evaluated interview history. The generated plan is
// saved when possible; an unavailable plan table does not discard the result.
export async function generateRoadmapPlanHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const body = validateRoadmapPlanRequest(req.body)
  if (!body.ok) {
    sendError(res, 400, 'validation_error', body.message, { fields: body.fields })
    return
  }

  try {
    const context = await buildRoadmapPlanContext(client, auth.userId, body.value)
    const plan = await generateRoadmapPlan(context)
    const generatedAt = new Date().toISOString()
    const saveResult = await saveRoadmapPlan(client, auth.userId, plan, generatedAt)

    if (saveResult.error) {
      if (isMissingRelation(saveResult.error)) {
        if (!planStorageWarningLogged) {
          planStorageWarningLogged = true
          console.warn(
            '[mockmate-backend] roadmap_ai_plans is unavailable; generated plans will not persist until ' +
              'migration 20260106000000_roadmap_ai_plans.sql is applied.',
          )
        }
      } else {
        console.error(
          `[mockmate-backend] roadmap plan save failed: ` +
            `${saveResult.error.message ?? saveResult.error.code ?? 'unknown'}`,
        )
      }
    }

    res.status(200).json({
      plan,
      generatedAt,
      persisted: !saveResult.error,
    })
  } catch (err) {
    if (err instanceof GroqError) {
      sendError(res, err.status, err.code, err.message)
      return
    }
    sendError(res, 502, 'roadmap_plan_failed', 'Could not generate your roadmap plan.')
  }
}
