import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adaptiveNextQuestionHandler,
  updateSessionHandler,
} from '../src/controllers/interviews.controller.js'

interface QueryError {
  code?: string
  message?: string
}

function request(options: {
  authenticated?: boolean
  client?: SupabaseClient
  writeClient?: SupabaseClient
  params?: Record<string, string>
  body?: unknown
} = {}): Request {
  return {
    auth: options.authenticated === false
      ? undefined
      : {
          userId: 'student-1',
          email: 'student@example.com',
          role: 'student',
          collegeId: 'college-1',
          accessToken: 'token',
        },
    supabase: options.client,
    supabaseWrite: options.writeClient,
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

function sessionRow() {
  return {
    id: 'session-1',
    student_id: 'student-1',
    interview_type: 'technical',
    mode: 'technical',
    difficulty: 'Medium',
    experience: 'Fresher',
    target_role: 'Software Engineer',
    target_company: 'Acme',
    language: 'en',
    status: 'in_progress',
    overall_score: null,
    skill_scores: null,
    strengths: [],
    improvement_areas: [],
    config: { typeLabel: 'Technical', branch: 'CSE' },
    client_session_id: null,
    started_at: '2026-01-01T10:00:00.000Z',
    completed_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
  }
}

function updateClient(existing: ReturnType<typeof sessionRow>) {
  const calls: Record<string, unknown>[] = []
  let mode: 'read' | 'update' = 'read'
  const chain: Record<string, unknown> = {}
  chain.select = (columns: string) => {
    calls.push({ operation: 'select', columns, mode })
    return chain
  }
  chain.update = (patch: unknown) => {
    mode = 'update'
    calls.push({ operation: 'update', patch })
    return chain
  }
  chain.eq = (column: string, value: unknown) => {
    calls.push({ operation: 'eq', column, value, mode })
    return chain
  }
  chain.maybeSingle = async () => ({ data: existing, error: null as QueryError | null })
  const client = {
    from(table: string) {
      calls.push({ operation: 'from', table })
      mode = 'read'
      return chain
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

function analysis() {
  return {
    version: 1,
    capturedAt: '2026-01-01T10:05:00.000Z',
    camera: {
      access: 'granted',
      used: true,
      model: 'running',
      samples: 10,
      faceDetected: 9,
      framing: { good: 9, 'too-close': 0, 'too-far': 0, 'off-center': 0, 'no-face': 1 },
      head: { center: 8, left: 1, right: 0, unknown: 0 },
      eyeContact: { onCamera: 8, away: 1, unavailable: 0 },
      movement: { still: 8, moving: 1, unknown: 0 },
    },
    audio: { access: 'granted', used: true, speechRecognitionSupported: true },
  }
}

test('rejects unauthenticated session updates before touching the database', async () => {
  const res = response()
  await updateSessionHandler(
    request({ authenticated: false, params: { id: 'session-1' }, body: { status: 'completed' } }),
    res,
  )
  assert.equal(res.statusCode, 401)
})

test('adaptive next-question rejects missing authentication before any database call', async () => {
  const res = response()
  await adaptiveNextQuestionHandler(
    request({
      authenticated: false,
      params: { id: '00000000-0000-4000-8000-000000000001', index: '0' },
      body: {},
    }),
    res,
  )
  assert.equal(res.statusCode, 401)
})

test('adaptive next-question validates the session id and question index', async () => {
  const invalidId = response()
  await adaptiveNextQuestionHandler(
    request({
      client: {} as SupabaseClient,
      params: { id: 'not-an-id', index: '0' },
      body: {},
    }),
    invalidId,
  )
  assert.equal(invalidId.statusCode, 400)

  const invalidIndex = response()
  await adaptiveNextQuestionHandler(
    request({
      client: {} as SupabaseClient,
      params: { id: '00000000-0000-4000-8000-000000000001', index: '-1' },
      body: {},
    }),
    invalidIndex,
  )
  assert.equal(invalidIndex.statusCode, 400)
})

test('adaptive next-question scopes the session lookup to the authenticated caller', async () => {
  const calls: { column?: string; value?: unknown; table?: string }[] = []
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (column: string, value: unknown) => {
    calls.push({ column, value })
    return chain
  }
  chain.maybeSingle = async () => ({ data: null, error: null })
  const client = {
    from(table: string) {
      calls.push({ table })
      return chain
    },
  } as unknown as SupabaseClient

  const res = response()
  await adaptiveNextQuestionHandler(
    request({
      client,
      params: { id: '00000000-0000-4000-8000-000000000001', index: '0' },
      body: {},
    }),
    res,
  )

  assert.equal(res.statusCode, 404)
  assert.ok(
    calls.some(
      (call) => call.column === 'student_id' && call.value === 'student-1',
    ),
  )
})

test('refuses session writes when no service-role client is configured', async () => {
  const { client } = updateClient(sessionRow())
  const res = response()
  await updateSessionHandler(
    request({
      client,
      params: { id: 'session-1' },
      body: { status: 'completed' },
    }),
    res,
  )
  assert.equal(res.statusCode, 503)
})

test('updates only the caller-owned session and preserves existing config', async () => {
  const { client, calls } = updateClient(sessionRow())
  const res = response()
  await updateSessionHandler(
    request({
      client,
      writeClient: client,
      params: { id: 'session-1' },
      body: { status: 'completed', analysis: analysis() },
    }),
    res,
  )

  assert.equal(res.statusCode, 200)
  const update = calls.find((call) => call.operation === 'update') as {
    patch: Record<string, unknown>
  }
  const config = update.patch.config as Record<string, unknown>
  assert.equal(config.typeLabel, 'Technical')
  assert.equal(config.branch, 'CSE')
  assert.deepEqual(config.analysis, analysis())

  const ownershipFilters = calls.filter(
    (call) => call.operation === 'eq' && call.column === 'student_id',
  )
  assert.equal(ownershipFilters.length, 2)
  assert.ok(ownershipFilters.every((call) => call.value === 'student-1'))
})

test('persists analysis consent metadata with the caller-owned session', async () => {
  const { client, calls } = updateClient(sessionRow())
  const res = response()
  const withConsent = {
    ...analysis(),
    consent: { cameraPresentation: false, communication: true },
  }
  await updateSessionHandler(
    request({
      client,
      writeClient: client,
      params: { id: 'session-1' },
      body: { status: 'completed', analysis: withConsent },
    }),
    res,
  )

  assert.equal(res.statusCode, 200)
  const update = calls.find((call) => call.operation === 'update') as {
    patch: Record<string, unknown>
  }
  const config = update.patch.config as Record<string, unknown>
  assert.deepEqual((config.analysis as Record<string, unknown>).consent, {
    cameraPresentation: false,
    communication: true,
  })
})

test('rejects malformed or half-formed analysis consent', async () => {
  for (const consent of [
    'yes',
    { cameraPresentation: true },
    { cameraPresentation: 'true', communication: true },
    { cameraPresentation: true, communication: null },
  ]) {
    const { client } = updateClient(sessionRow())
    const res = response()
    await updateSessionHandler(
      request({
        client,
        writeClient: client,
        params: { id: 'session-1' },
        body: { status: 'completed', analysis: { ...analysis(), consent } },
      }),
      res,
    )
    assert.equal(res.statusCode, 400)
  }
})

test('older analysis payloads without consent still save unchanged', async () => {
  const { client, calls } = updateClient(sessionRow())
  const res = response()
  await updateSessionHandler(
    request({
      client,
      writeClient: client,
      params: { id: 'session-1' },
      body: { status: 'completed', analysis: analysis() },
    }),
    res,
  )

  assert.equal(res.statusCode, 200)
  const update = calls.find((call) => call.operation === 'update') as {
    patch: Record<string, unknown>
  }
  const config = update.patch.config as Record<string, unknown>
  assert.equal('consent' in (config.analysis as Record<string, unknown>), false)
})
