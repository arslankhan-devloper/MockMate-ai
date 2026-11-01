import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import {
  getActiveSessionHandler,
  hintHandler,
  nextQuestionHandler,
  openSessionHandler,
  runHandler,
  submitHandler,
} from '../src/controllers/problemSolving.controller.js'

function request(options: {
  role?: 'student' | 'placement-officer'
  authenticated?: boolean
  params?: Record<string, string>
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
    supabase: {},
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
    setHeader() {
      return this
    },
  }
  return res as unknown as Response & { statusCode: number; payload: unknown }
}

function errorCode(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const code = (payload as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

test('problem-solving handlers reject unauthenticated calls before any database work', async () => {
  for (const handler of [openSessionHandler, nextQuestionHandler, hintHandler, runHandler, submitHandler]) {
    const res = response()
    await handler(request({ authenticated: false }), res)
    assert.equal(res.statusCode, 401)
    assert.equal(errorCode(res.payload), 'not_authenticated')
  }
})

test('problem-solving writes refuse to fall back when the service client is missing', async () => {
  const validId = '11111111-1111-4111-8111-111111111111'
  const cases: Array<[typeof openSessionHandler, Record<string, string>, unknown]> = [
    [openSessionHandler, {}, undefined],
    [nextQuestionHandler, { id: validId }, undefined],
    [hintHandler, { id: validId }, undefined],
    [
      submitHandler,
      { id: validId },
      {
        language: 'python',
        code: 'def solve(): pass',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      },
    ],
  ]
  for (const [handler, params, body] of cases) {
    const res = response()
    await handler(request({ params, body }), res)
    assert.equal(res.statusCode, 503)
    assert.equal(errorCode(res.payload), 'write_unavailable')
  }
})

test('GET can return an empty workspace without a service client', async () => {
  const chain: Record<string, unknown> = {
    from() {
      return chain
    },
    select() {
      return chain
    },
    eq() {
      return chain
    },
    order() {
      return chain
    },
    limit() {
      return chain
    },
    async maybeSingle() {
      return { data: null, error: null }
    },
  }
  const req = request()
  ;(req as unknown as { supabase: unknown }).supabase = chain
  const res = response()
  await getActiveSessionHandler(req, res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.payload, {
    session: null,
    question: null,
    latestSubmission: null,
    review: null,
    progress: [],
  })
})

test('placement officers cannot open problem-solving sessions', async () => {
  const res = response()
  await openSessionHandler(request({ role: 'placement-officer' }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(errorCode(res.payload), 'forbidden')
})

test('next-question validates the session id before generation', async () => {
  const res = response()
  await nextQuestionHandler(request({ params: { id: 'not-a-uuid' } }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(errorCode(res.payload), 'invalid_session')
})

test('hint validates the problem id', async () => {
  const res = response()
  await hintHandler(request({ params: { id: 'nope' } }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(errorCode(res.payload), 'invalid_question')
})

test('submit requires a valid idempotency key before any write', async () => {
  for (const idempotencyKey of [undefined, '', 'not-a-uuid']) {
    const res = response()
    await submitHandler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        body: { language: 'python', code: 'def solve(): pass', idempotencyKey },
      }),
      res,
    )
    assert.equal(res.statusCode, 400)
    assert.equal(errorCode(res.payload), 'validation_error')
  }
})

test('run and submit reject unsupported languages before execution', async () => {
  for (const handler of [runHandler, submitHandler]) {
    const res = response()
    await handler(
      request({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        body: { language: 'c++', code: 'int main() {}' },
      }),
      res,
    )
    assert.equal(res.statusCode, 400)
    assert.equal(errorCode(res.payload), 'validation_error')
  }
})

test('run and submit reject empty or oversized code before execution', async () => {
  for (const code of ['   ', 'x'.repeat(20_001)]) {
    for (const handler of [runHandler, submitHandler]) {
      const res = response()
      await handler(
        request({
          params: { id: '11111111-1111-4111-8111-111111111111' },
          body: { language: 'python', code },
        }),
        res,
      )
      assert.equal(res.statusCode, 400)
      assert.equal(errorCode(res.payload), 'validation_error')
    }
  }
})
