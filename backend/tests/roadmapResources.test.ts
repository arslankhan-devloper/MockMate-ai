import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateRoadmapTopicResourcesHandler,
  getRoadmapTopicResourcesHandler,
} from '../src/controllers/roadmap.controller.js'
import {
  ROADMAP_TOPIC_CATALOG,
  ROADMAP_TOPIC_RESOURCE_TYPES,
  normalizeGeneratedTopicResources,
  resolveRoadmapTopic,
} from '../src/utils/roadmapResourcesValidation.js'
import {
  isAllowedRoadmapResourceUrl,
} from '../src/utils/roadmapPlanValidation.js'
import {
  mapRoadmapTopicResourceRow,
  saveRoadmapTopicResources,
  type RoadmapTopicResourceRow,
} from '../src/services/roadmap.service.js'
import type { GeneratedTopicResource } from '../src/utils/roadmapResourcesValidation.js'

const VALID_TOPIC = {
  domainId: 'it' as const,
  title: 'Databases, transactions, and APIs',
}

function validRawResources(): Record<string, unknown> {
  return {
    resources: [
      {
        resourceType: 'video',
        title: 'Database transaction walkthrough',
        description: 'A visual explanation of ACID transactions and isolation.',
        providerKey: 'youtube',
        searchQuery: 'database transactions acid isolation',
      },
      {
        resourceType: 'roadmap',
        title: 'Backend API learning path',
        description: 'A structured path from HTTP basics to API design.',
        providerKey: 'microsoftlearn',
        searchQuery: 'backend api design learning path',
      },
      {
        resourceType: 'docs',
        title: 'SQL reference',
        description: 'Reference material for SQL queries and indexes.',
        providerKey: 'microsoftlearn',
        searchQuery: 'sql queries indexes documentation',
        // Model-supplied URLs must never be used.
        url: 'https://evil.example/phishing',
      },
      {
        resourceType: 'practice',
        title: 'SQL practice exercises',
        description: 'Hands-on exercises for joins, indexes and transactions.',
        providerKey: 'khanacademy',
        searchQuery: 'sql joins practice exercises',
      },
    ],
  }
}

function validResources(): GeneratedTopicResource[] {
  const resources = normalizeGeneratedTopicResources(validRawResources(), VALID_TOPIC)
  assert.ok(resources)
  return resources
}

function request(options: {
  client?: SupabaseClient
  domainId?: string
  topicId?: string
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
    params: {
      domainId: options.domainId ?? VALID_TOPIC.domainId,
      topicId: options.topicId ?? 'databases-and-apis',
    },
    body: undefined,
  } as unknown as Request
}

function unauthenticatedRequest(): Request {
  return {
    params: { domainId: VALID_TOPIC.domainId, topicId: 'databases-and-apis' },
  } as unknown as Request
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

function resourceReadClient(result: { data: unknown; error: unknown }): SupabaseClient {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.order = () => Promise.resolve(result)
  return {
    from() {
      return chain
    },
  } as unknown as SupabaseClient
}

test('catalog exposes all 25 curated topics and rejects unknown topics', () => {
  const topicKeys = new Set<string>()
  let count = 0

  for (const [domainId, topics] of Object.entries(ROADMAP_TOPIC_CATALOG)) {
    for (const topic of topics) {
      count += 1
      topicKeys.add(`${domainId}:${topic.id}`)
      const resolved = resolveRoadmapTopic(domainId, topic.id)
      assert.equal(resolved.ok, true, `${domainId}:${topic.id}`)
      if (resolved.ok) {
        assert.equal(resolved.value.topicTitle, topic.title)
      }
    }
  }

  assert.equal(count, 25)
  assert.equal(topicKeys.size, 25)
  assert.equal(resolveRoadmapTopic('it', 'not-a-topic').ok, false)
  assert.equal(resolveRoadmapTopic('civil', 'thermodynamics').ok, false)
  assert.equal(resolveRoadmapTopic('it', 'UPPER').ok, false)
})

test('normalisation returns exactly one resource per supported type with server-built URLs', () => {
  const resources = validResources()

  assert.deepEqual(
    resources.map((resource) => resource.type),
    [...ROADMAP_TOPIC_RESOURCE_TYPES],
  )

  for (const resource of resources) {
    assert.equal(resource.verified, true)
    assert.equal(isAllowedRoadmapResourceUrl(resource.url), true)
    assert.notEqual(resource.url, 'https://evil.example/phishing')
    assert.ok(resource.title.trim())
    assert.ok(resource.description.trim())
    assert.ok(resource.provider.trim())
  }
})

test('normalisation rejects partial, duplicate or type-mismatched resources', () => {
  const partial = validRawResources()
  ;(partial.resources as unknown[]).pop()
  assert.equal(normalizeGeneratedTopicResources(partial, VALID_TOPIC), null)

  const duplicated = validRawResources()
  const duplicateList = duplicated.resources as Record<string, unknown>[]
  duplicateList[1].resourceType = 'video'
  assert.equal(normalizeGeneratedTopicResources(duplicated, VALID_TOPIC), null)

  const mismatched = validRawResources()
  const mismatchedList = mismatched.resources as Record<string, unknown>[]
  mismatchedList[2].providerKey = 'youtube'
  assert.equal(normalizeGeneratedTopicResources(mismatched, VALID_TOPIC), null)

  assert.equal(normalizeGeneratedTopicResources({ resources: 'nope' }, VALID_TOPIC), null)
  assert.equal(normalizeGeneratedTopicResources(null, VALID_TOPIC), null)
})

test('stored rows are only marked verified when the URL is still allowlisted', () => {
  const base = validResources()[0]
  const row: RoadmapTopicResourceRow = {
    domain_id: 'it',
    topic_id: 'databases-and-apis',
    resource_type: base.type,
    title: base.title,
    description: base.description,
    provider: base.provider,
    url: base.url,
    is_verified: true,
    generated_at: '2026-10-21T10:00:00.000Z',
  }

  assert.equal(mapRoadmapTopicResourceRow(row).verified, true)
  assert.equal(
    mapRoadmapTopicResourceRow({ ...row, url: 'https://evil.example/resource' }).verified,
    false,
  )
  assert.equal(
    mapRoadmapTopicResourceRow({ ...row, url: 'javascript:alert(1)' }).verified,
    false,
  )
})

test('saving resources upserts four type slots instead of appending duplicates', async () => {
  const resources = validResources()
  let payload: unknown
  let options: unknown
  const chain = {
    upsert(nextPayload: unknown, nextOptions: unknown) {
      payload = nextPayload
      options = nextOptions
      return Promise.resolve({ error: null })
    },
  }
  const client = {
    from(table: string) {
      assert.equal(table, 'roadmap_topic_resources')
      return chain
    },
  } as unknown as SupabaseClient

  const result = await saveRoadmapTopicResources(
    client,
    'student-1',
    'it',
    'databases-and-apis',
    resources,
    '2026-10-21T10:00:00.000Z',
  )

  assert.equal(result.error, null)
  assert.ok(Array.isArray(payload))
  assert.equal(payload.length, 4)
  assert.deepEqual(options, {
    onConflict: 'student_id,domain_id,topic_id,resource_type',
  })
  for (const row of payload) {
    assert.equal(row.student_id, 'student-1')
    assert.equal(row.is_verified, true)
  }
})

test('GET reports missing storage and returns saved verified resources', async () => {
  const missing = response()
  await getRoadmapTopicResourcesHandler(
    request({
      client: resourceReadClient({
        data: null,
        error: {
          code: 'PGRST205',
          message: "Could not find the table 'public.roadmap_topic_resources' in the schema cache",
        },
      }),
    }),
    missing,
  )
  assert.equal(missing.statusCode, 200)
  assert.deepEqual(missing.payload, {
    domainId: 'it',
    topicId: 'databases-and-apis',
    resources: [],
    generatedAt: null,
    storageAvailable: false,
  })

  const resource = validResources()[0]
  const saved = response()
  await getRoadmapTopicResourcesHandler(
    request({
      client: resourceReadClient({
        data: [
          {
            domain_id: 'it',
            topic_id: 'databases-and-apis',
            resource_type: resource.type,
            title: resource.title,
            description: resource.description,
            provider: resource.provider,
            url: resource.url,
            is_verified: true,
            generated_at: '2026-10-21T10:00:00.000Z',
          },
        ],
        error: null,
      }),
    }),
    saved,
  )
  assert.equal(saved.statusCode, 200)
  const payload = saved.payload as {
    resources: unknown[]
    generatedAt: string
    storageAvailable: boolean
  }
  assert.equal(payload.resources.length, 1)
  assert.equal(payload.generatedAt, '2026-10-21T10:00:00.000Z')
  assert.equal(payload.storageAvailable, true)
})

test('resource handlers reject invalid topics and missing authentication', async () => {
  const invalid = response()
  await getRoadmapTopicResourcesHandler(
    request({ client: {} as SupabaseClient, topicId: 'not-a-topic' }),
    invalid,
  )
  assert.equal(invalid.statusCode, 400)

  const getAuth = response()
  await getRoadmapTopicResourcesHandler(unauthenticatedRequest(), getAuth)
  assert.equal(getAuth.statusCode, 401)

  const postAuth = response()
  await generateRoadmapTopicResourcesHandler(unauthenticatedRequest(), postAuth)
  assert.equal(postAuth.statusCode, 401)

  const postInvalid = response()
  await generateRoadmapTopicResourcesHandler(
    request({ client: {} as SupabaseClient, domainId: 'civil' }),
    postInvalid,
  )
  assert.equal(postInvalid.statusCode, 400)
})
