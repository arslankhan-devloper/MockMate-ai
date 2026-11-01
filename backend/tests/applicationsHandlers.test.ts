import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  updateApplicationStatusHandler,
  withdrawApplicationHandler,
} from '../src/controllers/applications.controller.js'

interface Call {
  operation: string
  table?: string
  column?: string
  value?: unknown
  patch?: unknown
}

function request(options: {
  client?: SupabaseClient
  writer?: SupabaseClient
  role?: 'student' | 'placement-officer'
  params?: Record<string, string>
  body?: unknown
} = {}): Request {
  return {
    auth: {
      userId: 'officer-1',
      email: 'officer@example.com',
      role: options.role ?? 'placement-officer',
      collegeId: 'college-1',
      accessToken: 'token',
    },
    supabase: options.client,
    supabaseWrite: options.writer,
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
    send(payload?: unknown) {
      this.payload = payload
      return this
    },
  }
  return res as unknown as Response & { statusCode: number; payload: unknown }
}

function applicationRow() {
  return {
    id: 'application-1',
    job_id: 'job-1',
    student_id: 'student-1',
    student_name: 'Student One',
    status: 'Applied',
    applied_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
  }
}

function readClient(row = applicationRow()) {
  const calls: Call[] = []
  const chain: Record<string, unknown> = {}
  let table = ''
  chain.select = () => chain
  chain.eq = (column: string, value: unknown) => {
    calls.push({ operation: 'eq', table, column, value })
    return chain
  }
  chain.maybeSingle = async () => {
    if (table === 'job_applications') return { data: row, error: null }
    return {
      data: {
        id: 'job-1',
        college_id: 'college-1',
        company: 'Acme',
        title: 'Engineer',
        location: 'Remote',
        job_type: 'In-Campus',
        status: 'published',
        application_deadline: '2030-01-01',
        application_link: null,
        link_label: null,
      },
      error: null,
    }
  }
  const client = {
    from(nextTable: string) {
      table = nextTable
      calls.push({ operation: 'from', table: nextTable })
      return chain
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

function writeClient(options: { data?: unknown } = {}) {
  const calls: Call[] = []
  const chain: Record<string, unknown> = {}
  chain.update = (patch: unknown) => {
    calls.push({ operation: 'update', patch })
    return chain
  }
  chain.eq = (column: string, value: unknown) => {
    calls.push({ operation: 'eq', column, value })
    return chain
  }
  chain.select = () => chain
  chain.maybeSingle = async () => ({
    data: options.data === undefined ? { ...applicationRow(), status: 'Shortlisted' } : options.data,
    error: null,
  })
  const client = {
    from(table: string) {
      calls.push({ operation: 'from', table })
      return chain
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

test('application mutations fail closed without a service-role client', async () => {
  const { client } = readClient()

  const withdraw = response()
  await withdrawApplicationHandler(
    request({
      client,
      role: 'student',
      params: { id: 'application-1' },
    }),
    withdraw,
  )
  assert.equal(withdraw.statusCode, 503)

  const status = response()
  await updateApplicationStatusHandler(
    request({
      client,
      params: { id: 'application-1' },
      body: { status: 'Shortlisted' },
    }),
    status,
  )
  assert.equal(status.statusCode, 503)
})

test('officer status updates are scoped to the current job and status', async () => {
  const { client, calls: readCalls } = readClient()
  const { client: writer, calls: writeCalls } = writeClient()
  const res = response()

  await updateApplicationStatusHandler(
    request({
      client,
      writer,
      params: { id: 'application-1' },
      body: { status: 'Shortlisted' },
    }),
    res,
  )

  assert.equal(res.statusCode, 200)
  assert.ok(!readCalls.some((call) => call.operation === 'update'))
  assert.deepEqual(
    writeCalls.find((call) => call.operation === 'update')?.patch,
    { status: 'Shortlisted' },
  )
  assert.deepEqual(
    writeCalls
      .filter((call) => call.operation === 'eq')
      .map((call) => [call.column, call.value]),
    [
      ['id', 'application-1'],
      ['job_id', 'job-1'],
      ['status', 'Applied'],
    ],
  )
})

test('a concurrent status change is reported as a conflict', async () => {
  const { client } = readClient()
  const { client: writer } = writeClient({ data: null })
  const res = response()

  await updateApplicationStatusHandler(
    request({
      client,
      writer,
      params: { id: 'application-1' },
      body: { status: 'Shortlisted' },
    }),
    res,
  )

  assert.equal(res.statusCode, 409)
  assert.equal((res.payload as { code?: string }).code, 'application_changed')
})
