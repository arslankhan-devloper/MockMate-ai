import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  listRoadmapProgressHandler,
  setRoadmapProgressHandler,
} from '../src/controllers/roadmap.controller.js'
import { requireRole } from '../src/middleware/auth.js'
import {
  validateRoadmapProgressBody,
  validateRoadmapTopicParams,
} from '../src/utils/roadmapValidation.js'

interface QueryError {
  code?: string
  message?: string
}

function request(options: {
  role?: 'student' | 'placement-officer'
  authenticated?: boolean
  client?: SupabaseClient
  params?: Record<string, string>
  body?: unknown
} = {}): Request {
  const role = options.role ?? 'student'
  const authenticated = options.authenticated ?? true
  return {
    auth: authenticated
      ? {
          userId: 'student-1',
          email: 'student@example.com',
          role,
          collegeId: 'college-1',
          accessToken: 'token',
        }
      : undefined,
    supabase: options.client,
    params: options.params ?? {},
    body: options.body,
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

function listClient(
  rows: unknown[],
  error: QueryError | null = null,
): { client: SupabaseClient; tables: string[] } {
  const tables: string[] = []
  let orders = 0
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.order = () => {
    orders += 1
    return orders === 2 ? Promise.resolve({ data: rows, error }) : chain
  }
  const client = {
    from(table: string) {
      tables.push(table)
      return chain
    },
  } as unknown as SupabaseClient
  return { client, tables }
}

function writeClient(
  operation: 'upsert' | 'delete',
  error: QueryError | null = null,
): { client: SupabaseClient; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = []
  const chain: Record<string, unknown> = {}
  chain.upsert = (payload: unknown, config: unknown) => {
    calls.push({ operation: 'upsert', payload, config })
    return Promise.resolve({ data: null, error })
  }
  chain.delete = () => {
    calls.push({ operation: 'delete' })
    return chain
  }
  let eqs = 0
  chain.eq = (column: string, value: unknown) => {
    calls.push({ operation: 'eq', column, value })
    eqs += 1
    if (operation === 'delete' && eqs === 3) {
      return Promise.resolve({ data: null, error })
    }
    return chain
  }
  const client = {
    from() {
      return chain
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

test('accepts the six curated domains and rejects invalid topic parameters', () => {
  for (const domainId of ['it', 'mechanical', 'electronics', 'management', 'hr', 'aptitude']) {
    const result = validateRoadmapTopicParams(domainId, 'valid-topic-1')
    assert.equal(result.ok, true)
  }

  assert.equal(validateRoadmapTopicParams('civil', 'valid-topic').ok, false)
  assert.equal(validateRoadmapTopicParams('IT', 'valid-topic').ok, false)
  assert.equal(validateRoadmapTopicParams('it', 'UPPER').ok, false)
  assert.equal(validateRoadmapTopicParams('it', 'has space').ok, false)
  assert.equal(validateRoadmapTopicParams('it', '').ok, false)
})

test('requires an exact boolean completed body and rejects server-owned fields', () => {
  assert.equal(validateRoadmapProgressBody({ completed: true }).ok, true)
  assert.equal(validateRoadmapProgressBody({ completed: false }).ok, true)

  assert.equal(validateRoadmapProgressBody({}).ok, false)
  assert.equal(validateRoadmapProgressBody({ completed: 'true' }).ok, false)
  assert.equal(validateRoadmapProgressBody({ completed: true, studentId: 'other' }).ok, false)
  assert.equal(validateRoadmapProgressBody({ completed: true, extra: 1 }).ok, false)
  assert.equal(validateRoadmapProgressBody(null).ok, false)
})

test('student role passes and placement officers are rejected by the role guard', () => {
  let studentCalled = false
  requireRole('student')(
    request({ role: 'student' }),
    response(),
    () => {
      studentCalled = true
    },
  )
  assert.equal(studentCalled, true)

  const officerRes = response()
  requireRole('student')(request({ role: 'placement-officer' }), officerRes, () => {
    assert.fail('officer must not reach a student-only handler')
  })
  assert.equal(officerRes.statusCode, 403)
})

test('progress handlers reject missing authentication', async () => {
  const listRes = response()
  await listRoadmapProgressHandler(request({ authenticated: false }), listRes)
  assert.equal(listRes.statusCode, 401)

  const writeRes = response()
  await setRoadmapProgressHandler(
    request({
      authenticated: false,
      params: { domainId: 'it', topicId: 'complexity' },
      body: { completed: true },
    }),
    writeRes,
  )
  assert.equal(writeRes.statusCode, 401)
})

test('GET returns only the caller progress in camelCase', async () => {
  const { client, tables } = listClient([
    { domain_id: 'it', topic_id: 'complexity', completed_at: '2026-10-01T10:00:00.000Z' },
  ])
  const res = response()
  await listRoadmapProgressHandler(request({ client }), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(tables, ['roadmap_topic_progress'])
  assert.deepEqual(res.payload, {
    progress: [
      {
        domainId: 'it',
        topicId: 'complexity',
        completedAt: '2026-10-01T10:00:00.000Z',
      },
    ],
  })
})

test('completing and un-completing use idempotent operations owned by auth', async () => {
  const complete = writeClient('upsert')
  const completeReq = {
    params: { domainId: 'mechanical', topicId: 'thermodynamics' },
    body: { completed: true },
  }

  const first = response()
  await setRoadmapProgressHandler(request({ client: complete.client, ...completeReq }), first)
  const second = response()
  await setRoadmapProgressHandler(request({ client: complete.client, ...completeReq }), second)

  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 200)
  assert.deepEqual(first.payload, {
    domainId: 'mechanical',
    topicId: 'thermodynamics',
    completed: true,
  })
  assert.equal(complete.calls.filter((call) => call.operation === 'upsert').length, 2)
  const upsert = complete.calls[0] as {
    payload: Record<string, unknown>
    config: Record<string, unknown>
  }
  assert.deepEqual(upsert.payload, {
    student_id: 'student-1',
    domain_id: 'mechanical',
    topic_id: 'thermodynamics',
  })
  assert.equal(upsert.config.onConflict, 'student_id,domain_id,topic_id')
  assert.equal(upsert.config.ignoreDuplicates, true)

  const remove = writeClient('delete')
  const removeReq = {
    params: { domainId: 'mechanical', topicId: 'thermodynamics' },
    body: { completed: false },
  }
  const firstRemove = response()
  await setRoadmapProgressHandler(request({ client: remove.client, ...removeReq }), firstRemove)
  const secondRemove = response()
  await setRoadmapProgressHandler(request({ client: remove.client, ...removeReq }), secondRemove)

  assert.equal(firstRemove.statusCode, 200)
  assert.equal(secondRemove.statusCode, 200)
  assert.deepEqual(firstRemove.payload, {
    domainId: 'mechanical',
    topicId: 'thermodynamics',
    completed: false,
  })
  assert.equal(remove.calls.filter((call) => call.operation === 'delete').length, 2)
  assert.deepEqual(
    remove.calls.filter((call) => call.operation === 'eq').map((call) => [call.column, call.value]),
    [
      ['student_id', 'student-1'],
      ['domain_id', 'mechanical'],
      ['topic_id', 'thermodynamics'],
      ['student_id', 'student-1'],
      ['domain_id', 'mechanical'],
      ['topic_id', 'thermodynamics'],
    ],
  )
})

test('invalid parameters and bodies are rejected before any database call', async () => {
  const { client, calls } = writeClient('upsert')
  const badDomain = response()
  await setRoadmapProgressHandler(
    request({
      client,
      params: { domainId: 'civil', topicId: 'valid-topic' },
      body: { completed: true },
    }),
    badDomain,
  )
  assert.equal(badDomain.statusCode, 400)
  assert.equal(calls.length, 0)

  const badBody = response()
  await setRoadmapProgressHandler(
    request({
      client,
      params: { domainId: 'it', topicId: 'valid-topic' },
      body: { completed: 'yes' },
    }),
    badBody,
  )
  assert.equal(badBody.statusCode, 400)
  assert.equal(calls.length, 0)
})

test('database read and write failures return stable server errors', async () => {
  const listRes = response()
  await listRoadmapProgressHandler(
    request({
      client: listClient([], { code: 'XX000', message: 'read failed' }).client,
    }),
    listRes,
  )
  assert.equal(listRes.statusCode, 500)
  assert.deepEqual(listRes.payload, {
    error: 'Could not load your roadmap progress.',
    code: 'roadmap_progress_read_failed',
  })

  const writeRes = response()
  await setRoadmapProgressHandler(
    request({
      client: writeClient('upsert', { code: 'XX000', message: 'write failed' }).client,
      params: { domainId: 'it', topicId: 'valid-topic' },
      body: { completed: true },
    }),
    writeRes,
  )
  assert.equal(writeRes.statusCode, 500)
  assert.deepEqual(writeRes.payload, {
    error: 'Could not save your roadmap progress.',
    code: 'roadmap_progress_write_failed',
  })
})
