import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyToJobHandler } from '../src/controllers/jobs.controller.js'

function request(options: {
  role?: 'student' | 'placement-officer'
  authenticated?: boolean
  client?: SupabaseClient
  writer?: SupabaseClient
  body?: unknown
} = {}): Request {
  return {
    auth: options.authenticated === false
      ? undefined
      : {
          userId: 'student-1',
          email: 'student@example.com',
          role: options.role ?? 'student',
          collegeId: 'college-1',
          accessToken: 'token',
        },
    supabase: options.client,
    supabaseWrite: options.writer,
    params: { id: 'job-1' },
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

function readClient() {
  const chain: Record<string, unknown> = {}
  let table = ''
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = async () => {
    if (table === 'campus_jobs') {
      return {
        data: {
          id: 'job-1',
          college_id: 'college-1',
          company: 'Acme',
          title: 'Engineer',
          location: 'Remote',
          job_type: 'In-Campus',
          status: 'published',
          branches: ['CSE'],
          application_deadline: '2030-01-01',
          application_link: null,
        },
        error: null,
      }
    }
    if (table === 'profiles') {
      return { data: { full_name: 'Student One', branch: 'CSE' }, error: null }
    }
    if (table === 'job_applications') return { data: null, error: null }
    throw new Error(`unexpected table ${table}`)
  }
  const client = {
    from(nextTable: string) {
      table = nextTable
      return chain
    },
  } as unknown as SupabaseClient
  return client
}

function writeClient(inserted: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.insert = (patch: unknown) => {
    inserted.push(patch)
    return chain
  }
  chain.select = () => chain
  chain.single = async () => ({
    data: {
      id: 'application-1',
      job_id: 'job-1',
      student_id: 'student-1',
      student_name: 'Student One',
      status: 'Applied',
      applied_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
    },
    error: null,
  })
  return {
    from() {
      return chain
    },
  } as unknown as SupabaseClient
}

test('job applications reject non-students before any database work', async () => {
  const client = {
    from() {
      throw new Error('database should not be touched')
    },
  } as unknown as SupabaseClient

  for (const options of [
    { authenticated: false },
    { role: 'placement-officer' as const },
  ]) {
    const res = response()
    await applyToJobHandler(request({ ...options, client }), res)
    assert.ok(res.statusCode === 401 || res.statusCode === 403)
  }
})

test('job applications fail closed without a service-role client', async () => {
  const res = response()
  await applyToJobHandler(request({ client: readClient() }), res)
  assert.equal(res.statusCode, 503)
  assert.equal((res.payload as { code?: string }).code, 'write_unavailable')
})

test('job applications use the verified student id and ignore forged identity', async () => {
  const inserted: unknown[] = []
  const res = response()
  await applyToJobHandler(
    request({
      client: readClient(),
      writer: writeClient(inserted),
      body: { student_id: 'victim-1', status: 'Shortlisted' },
    }),
    res,
  )

  assert.equal(res.statusCode, 201)
  assert.deepEqual(inserted, [
    {
      job_id: 'job-1',
      student_id: 'student-1',
      student_name: 'Student One',
      status: 'Applied',
    },
  ])
})
