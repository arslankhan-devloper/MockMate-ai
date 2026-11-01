import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateRoadmapPlanHandler,
  getRoadmapPlanHandler,
} from '../src/controllers/roadmap.controller.js'
import {
  ROADMAP_RESOURCE_PROVIDERS,
  asRoadmapPlan,
  normalizeRoadmapPlan,
  validateRoadmapPlanRequest,
} from '../src/utils/roadmapPlanValidation.js'

interface QueryError {
  code?: string
  message?: string
}

function request(options: {
  client?: SupabaseClient
  body?: unknown
} = {}): Request {
  return {
    auth: {
      userId: 'student-1',
      email: 'student@example.com',
      role: 'student',
      collegeId: 'college-1',
      accessToken: 'token',
    },
    supabase: options.client,
    body: options.body,
  } as unknown as Request
}

function unauthenticatedRequest(): Request {
  return { body: undefined } as unknown as Request
}

function response(): Response & { statusCode: number; payload: unknown } {
  const res = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.payload = payload
      return this
    },
  }
  return res as unknown as Response & { statusCode: number; payload: unknown }
}

function readPlanClient(result: { data: unknown; error: QueryError | null }): SupabaseClient {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = () => Promise.resolve(result)
  return {
    from() {
      return chain
    },
  } as unknown as SupabaseClient
}

function failingContextClient(): SupabaseClient {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.order = () => chain
  chain.limit = () => chain
  chain.maybeSingle = () => Promise.reject(new Error('context unavailable'))
  return {
    from() {
      return chain
    },
  } as unknown as SupabaseClient
}

function rawPlan(taskCount = 6): Record<string, unknown> {
  const domains = ['it', 'mechanical', 'electronics', 'management', 'hr', 'aptitude']
  return {
    title: 'Placement readiness plan',
    summary: 'A focused plan built from the available branch, resume and interview evidence.',
    focusAreas: ['Problem solving', 'Communication'],
    tasks: Array.from({ length: taskCount }, (_, index) => ({
      domainId: domains[index % domains.length],
      title: `Focused study task ${index + 1}`,
      description: `Practise the key skill for task ${index + 1} and explain it clearly.`,
      estimatedMinutes: 40 + index,
      resources: [
        {
          title: `Resource ${index + 1}`,
          description: 'A structured resource for this task.',
          type: 'Course',
          providerKey: index % 2 === 0 ? 'mitocw' : 'coursera',
          searchQuery: `engineering skill ${index + 1}`,
        },
      ],
    })),
  }
}

test('request validation accepts optional resume context and removes duplicate skills', () => {
  const empty = validateRoadmapPlanRequest(undefined)
  assert.equal(empty.ok, true)
  if (empty.ok) assert.equal(empty.value.resumeContext, null)

  const valid = validateRoadmapPlanRequest({
    resumeContext: {
      targetRole: '  Backend Engineer  ',
      jobTitle: '',
      skills: ['React', ' react ', 'Node.js'],
    },
  })
  assert.equal(valid.ok, true)
  if (valid.ok) {
    assert.deepEqual(valid.value.resumeContext, {
      targetRole: 'Backend Engineer',
      jobTitle: null,
      skills: ['React', 'Node.js'],
    })
  }

  assert.equal(validateRoadmapPlanRequest({ studentId: 'other' }).ok, false)
  assert.equal(validateRoadmapPlanRequest({ resumeContext: { extra: true } }).ok, false)
  assert.equal(
    validateRoadmapPlanRequest({
      resumeContext: { skills: Array.from({ length: 21 }, (_, index) => `skill-${index}`) },
    }).ok,
    false,
  )
  assert.equal(
    validateRoadmapPlanRequest({ resumeContext: { skills: ['React', 42] } }).ok,
    false,
  )
})

test('normalisation creates stable task IDs and server-built HTTPS resource links', () => {
  const plan = normalizeRoadmapPlan(rawPlan())
  assert.ok(plan)
  if (!plan) return

  assert.equal(plan.version, 1)
  assert.equal(plan.source, 'ai')
  assert.equal(plan.tasks.length, 6)

  const ids = new Set<string>()
  for (const task of plan.tasks) {
    assert.match(task.id, /^[a-z0-9-]{1,80}$/)
    assert.equal(ids.has(task.id), false)
    ids.add(task.id)
    assert.ok(task.resources.length >= 1)

    for (const resource of task.resources) {
      const url = new URL(resource.url)
      assert.equal(url.protocol, 'https:')
      const allowed = Object.values(ROADMAP_RESOURCE_PROVIDERS).some(
        (provider) => new URL(provider.baseUrl).origin === url.origin,
      )
      assert.equal(allowed, true)
      assert.equal(url.username, '')
      assert.equal(url.password, '')
    }
  }

  assert.ok(asRoadmapPlan(plan))
})

test('normalisation rejects short or structurally invalid plans and supplies a fallback resource', () => {
  assert.equal(normalizeRoadmapPlan(rawPlan(4)), null)
  assert.equal(normalizeRoadmapPlan({ tasks: 'not-an-array' }), null)

  const noResources = rawPlan()
  const tasks = noResources.tasks as Record<string, unknown>[]
  tasks[0].resources = []
  const normalized = normalizeRoadmapPlan(noResources)
  assert.ok(normalized)
  assert.ok(normalized?.tasks[0].resources[0].url.startsWith('https://'))

  const unknownProvider = rawPlan()
  const unknownTasks = unknownProvider.tasks as Record<string, unknown>[]
  unknownTasks[0].resources = [
    {
      title: 'Unknown',
      providerKey: 'not-a-provider',
      searchQuery: 'anything',
    },
  ]
  assert.ok(normalizeRoadmapPlan(unknownProvider))
})

test('stored plans with an unapproved resource URL are rejected', () => {
  const plan = normalizeRoadmapPlan(rawPlan())
  assert.ok(plan)
  if (!plan) return

  const altered = structuredClone(plan)
  altered.tasks[0].resources[0].url = 'https://example.com/not-allowed'
  assert.equal(asRoadmapPlan(altered), null)
})

test('GET returns null when storage is unavailable and the saved plan when present', async () => {
  const missingRes = response()
  await getRoadmapPlanHandler(
    request({
      client: readPlanClient({
        data: null,
        error: { code: '42P01', message: 'relation "roadmap_ai_plans" does not exist' },
      }),
    }),
    missingRes,
  )
  assert.equal(missingRes.statusCode, 200)
  assert.deepEqual(missingRes.payload, {
    plan: null,
    generatedAt: null,
    storageAvailable: false,
  })

  const plan = normalizeRoadmapPlan(rawPlan())
  assert.ok(plan)
  const savedRes = response()
  await getRoadmapPlanHandler(
    request({
      client: readPlanClient({
        data: { plan, generated_at: '2026-10-20T10:00:00.000Z' },
        error: null,
      }),
    }),
    savedRes,
  )
  assert.equal(savedRes.statusCode, 200)
  assert.deepEqual(savedRes.payload, {
    plan,
    generatedAt: '2026-10-20T10:00:00.000Z',
    storageAvailable: true,
  })
})

test('GET reports read failures and rejects missing authentication', async () => {
  const readRes = response()
  await getRoadmapPlanHandler(
    request({
      client: readPlanClient({ data: null, error: { code: 'XX000', message: 'read failed' } }),
    }),
    readRes,
  )
  assert.equal(readRes.statusCode, 500)
  assert.deepEqual(readRes.payload, {
    error: 'Could not load your AI roadmap plan.',
    code: 'roadmap_plan_read_failed',
  })

  const authRes = response()
  await getRoadmapPlanHandler(unauthenticatedRequest(), authRes)
  assert.equal(authRes.statusCode, 401)
})

test('POST rejects invalid bodies before generation and requires authentication', async () => {
  const emptyClient = {} as SupabaseClient
  const invalidRes = response()
  await generateRoadmapPlanHandler(
    request({ client: emptyClient, body: { studentId: 'someone-else' } }),
    invalidRes,
  )
  assert.equal(invalidRes.statusCode, 400)

  const authRes = response()
  await generateRoadmapPlanHandler(unauthenticatedRequest(), authRes)
  assert.equal(authRes.statusCode, 401)
})

test('POST returns a controlled 502 when context loading fails before generation', async () => {
  const res = response()
  await generateRoadmapPlanHandler(
    request({ client: failingContextClient(), body: undefined }),
    res,
  )
  assert.equal(res.statusCode, 502)
  assert.deepEqual(res.payload, {
    error: 'Could not generate your roadmap plan.',
    code: 'roadmap_plan_failed',
  })
})
