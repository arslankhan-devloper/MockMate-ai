import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'

// Set the key before importing the service: env.ts captures configuration at
// module load, and dotenv never overrides an existing process value.
process.env.ONLINECOMPILER_API_KEY = 'test-onlinecompiler-key'
process.env.ONLINECOMPILER_API_URL = 'https://api.onlinecompiler.test'

const { validateCodingRun } = await import('../src/utils/codingRoundValidation.js')
const { CodingProviderError, runOnlineCompiler } = await import('../src/services/onlineCompiler.service.js')
const { mapCodingAttemptRow } = await import('../src/services/codingRound.service.js')
const { runCodingRoundHandler, listCodingRoundAttemptsHandler } = await import(
  '../src/controllers/codingRound.controller.js'
)

test('coding validation accepts a bounded run and defaults', () => {
  const parsed = validateCodingRun({
    language: 'python',
    code: 'print(input())',
    input: 'hello',
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value.language, 'python')
  assert.equal(parsed.value.timeLimit, 5)
  assert.equal(parsed.value.questionIndex, 0)
})

test('coding validation rejects unknown languages and empty code', () => {
  const unknownLanguage = validateCodingRun({ language: 'brainfuck', code: 'x' })
  assert.equal(unknownLanguage.ok, false)
  if (!unknownLanguage.ok) assert.match(unknownLanguage.fields.language, /Must be one of/)

  const emptyCode = validateCodingRun({ language: 'python', code: '   ' })
  assert.equal(emptyCode.ok, false)
  if (!emptyCode.ok) assert.match(emptyCode.fields.code, /cannot be empty/)
})

test('coding validation enforces provider limits', () => {
  const tooMuchCode = validateCodingRun({ language: 'python', code: 'x'.repeat(100_001) })
  assert.equal(tooMuchCode.ok, false)
  if (!tooMuchCode.ok) assert.match(tooMuchCode.fields.code, /at most/)

  const badTime = validateCodingRun({ language: 'python', code: 'x', timeLimit: 31 })
  assert.equal(badTime.ok, false)
  if (!badTime.ok) assert.match(badTime.fields.timeLimit, /1 to 30/)

  const badIndex = validateCodingRun({ language: 'python', code: 'x', questionIndex: -1 })
  assert.equal(badIndex.ok, false)
  if (!badIndex.ok) assert.match(badIndex.fields.questionIndex, /integer/)
})

test('online compiler sends the bare key and mapped compiler id', async () => {
  let call: { url: string; init: RequestInit } | null = null
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    call = { url: String(url), init: init ?? {} }
    return new Response(
      JSON.stringify({
        output: 'hello\n',
        error: '',
        status: 'success',
        exit_code: 0,
        signal: null,
        truncated: false,
        time: '0.02',
        total: '0.03',
        memory: '8192',
        time_limit: 5,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch

  const result = await runOnlineCompiler(
    { language: 'javascript', code: 'console.log("hello")', input: '', timeLimit: 5 },
    fakeFetch,
  )

  assert.equal(result.output, 'hello\n')
  assert.equal(result.exitCode, 0)
  assert.equal(result.provider, 'onlinecompiler')

  assert.ok(call)
  assert.equal(call!.url, 'https://api.onlinecompiler.test/api/run-code-sync/')
  const headers = call!.init.headers as Record<string, string>
  assert.equal(headers.Authorization, 'test-onlinecompiler-key')
  assert.equal(headers.Authorization.startsWith('Bearer '), false)
  const body = JSON.parse(String(call!.init.body)) as Record<string, unknown>
  assert.equal(body.compiler, 'nodejs-24')
  assert.equal(body.code, 'console.log("hello")')
  assert.equal(body.time_limit, 5)
})

test('online compiler maps provider failures without leaking details', async () => {
  const rateLimited = (async () =>
    new Response(JSON.stringify({ error: 'Submission rate limit exceeded.' }), { status: 429 })) as typeof fetch
  await assert.rejects(
    () => runOnlineCompiler({ language: 'python', code: 'x', input: '', timeLimit: 5 }, rateLimited),
    (error: unknown) => {
      assert.ok(error instanceof CodingProviderError)
      assert.equal(error.code, 'rate_limited')
      return true
    },
  )

  const invalidKey = (async () =>
    new Response(JSON.stringify({ error: 'Invalid or inactive API key' }), { status: 404 })) as typeof fetch
  await assert.rejects(
    () => runOnlineCompiler({ language: 'python', code: 'x', input: '', timeLimit: 5 }, invalidKey),
    (error: unknown) => {
      assert.ok(error instanceof CodingProviderError)
      assert.equal(error.code, 'auth')
      return true
    },
  )

  const networkError = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch
  await assert.rejects(
    () => runOnlineCompiler({ language: 'python', code: 'x', input: '', timeLimit: 5 }, networkError),
    (error: unknown) => {
      assert.ok(error instanceof CodingProviderError)
      assert.equal(error.code, 'unavailable')
      return true
    },
  )

  const malformed = (async () => new Response(JSON.stringify({ nope: true }), { status: 200 })) as typeof fetch
  await assert.rejects(
    () => runOnlineCompiler({ language: 'python', code: 'x', input: '', timeLimit: 5 }, malformed),
    (error: unknown) => {
      assert.ok(error instanceof CodingProviderError)
      assert.equal(error.code, 'invalid_response')
      return true
    },
  )
})

test('coding attempt rows map to the browser shape', () => {
  const mapped = mapCodingAttemptRow({
    id: 'attempt-1',
    session_id: 'session-1',
    student_id: 'student-1',
    question_index: 2,
    language: 'cpp',
    compiler_id: 'g++-15',
    code: 'int main(){}',
    stdin: '',
    stdout: '',
    stderr: '',
    exit_code: 1,
    status: 'error',
    signal: null,
    truncated: false,
    time_seconds: '0.02',
    total_seconds: '0.03',
    memory_kb: '9000',
    provider: 'onlinecompiler',
    created_at: '2026-11-01T00:00:00.000Z',
  })
  assert.equal(mapped.sessionId, 'session-1')
  assert.equal(mapped.questionIndex, 2)
  assert.equal(mapped.timeSeconds, 0.02)
  assert.equal(mapped.memoryKb, 9000)
  assert.equal(mapped.status, 'error')
})

function fakeResponse() {
  const state: { status: number; body: unknown; headers: Record<string, string> } = {
    status: 0,
    body: null,
    headers: {},
  }
  const res = {
    status(code: number) {
      state.status = code
      return res
    },
    json(payload: unknown) {
      state.body = payload
      return res
    },
    setHeader(key: string, value: string) {
      state.headers[key] = value
      return res
    },
  }
  return { res: res as unknown as Response, state }
}

test('coding handlers reject unauthenticated requests before any database work', async () => {
  const runRes = fakeResponse()
  await runCodingRoundHandler(
    { auth: undefined, supabase: undefined, params: { id: 'session-1' }, body: {} } as unknown as Request,
    runRes.res,
  )
  assert.equal(runRes.state.status, 401)

  const listRes = fakeResponse()
  await listCodingRoundAttemptsHandler(
    { auth: undefined, supabase: undefined, params: { id: 'session-1' } } as unknown as Request,
    listRes.res,
  )
  assert.equal(listRes.state.status, 401)
})

test('coding run validates the body before touching the session', async () => {
  const { res, state } = fakeResponse()
  await runCodingRoundHandler(
    {
      auth: { userId: 'student-1', role: 'student' },
      supabase: { from: () => { throw new Error('must not read') } },
      params: { id: 'session-1' },
      body: { language: 'brainfuck', code: 'x' },
    } as unknown as Request,
    res,
  )
  assert.equal(state.status, 400)
  const body = state.body as { code?: string; fields?: Record<string, string> }
  assert.equal(body.code, 'validation_error')
  assert.match(body.fields?.language ?? '', /Must be one of/)
})

test('coding run refuses a session that is not a Coding Round', async () => {
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'session-1', interview_type: 'technical' },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }
  const { res, state } = fakeResponse()
  await runCodingRoundHandler(
    {
      auth: { userId: 'student-1', role: 'student' },
      supabase: client,
      params: { id: 'session-1' },
      body: { language: 'python', code: 'print(1)' },
    } as unknown as Request,
    res,
  )
  assert.equal(state.status, 400)
  assert.equal((state.body as { code?: string }).code, 'not_coding_session')
})
