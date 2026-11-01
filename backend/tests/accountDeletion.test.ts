import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import {
  ACCOUNT_DELETION_CONFIRMATION,
  AccountDeletionError,
  OWNED_DATA_STEPS,
  runAccountDeletion,
  type AccountDeletionGateway,
  type DeletionResult,
} from '../src/services/accountDeletion.service.js'
import { createDeleteAccountHandler } from '../src/controllers/account.controller.js'
import { requireJsonContentType } from '../src/routes/account.routes.js'
import { rateLimit } from '../src/middleware/rateLimit.js'

interface GatewayCall {
  operation: string
  table?: string
}

function fakeGateway(options: {
  missingTables?: string[]
  failTable?: string
  failAuth?: boolean
  failComplete?: boolean
} = {}) {
  const calls: GatewayCall[] = []
  const resources: Record<string, string>[] = []
  const failures: { step: string; code: string }[] = []
  const gateway: AccountDeletionGateway = {
    async createRequest() {
      calls.push({ operation: 'createRequest' })
      return 'request-1'
    },
    async recordStep(_requestId, step, snapshot) {
      calls.push({ operation: 'recordStep', table: step })
      resources.push({ ...snapshot })
    },
    async markCompleted() {
      calls.push({ operation: 'markCompleted' })
      if (options.failComplete) throw new Error('tracking failed')
    },
    async markFailed(_requestId, step, code) {
      calls.push({ operation: 'markFailed', table: step })
      failures.push({ step, code })
    },
    async deleteOwnedRows(table): Promise<DeletionResult> {
      calls.push({ operation: 'deleteOwnedRows', table })
      if (table === options.failTable) return { ok: false, errorCode: 'XX000' }
      if (options.missingTables?.includes(table)) {
        return { ok: false, errorCode: '42P01', missingRelation: true }
      }
      return { ok: true }
    },
    async deleteAuthUser() {
      calls.push({ operation: 'deleteAuthUser' })
      if (options.failAuth) return { ok: false, errorCode: 'AUTH_FAILED' }
      return { ok: true }
    },
  }
  return { gateway, calls, resources, failures }
}

function request(options: {
  authenticated?: boolean
  email?: string | null
  body?: unknown
} = {}): Request {
  return {
    auth:
      options.authenticated === false
        ? undefined
        : {
            userId: 'user-1',
            email: options.email === undefined ? 'user@example.com' : options.email,
            role: 'student',
            collegeId: null,
            accessToken: 'token',
          },
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

test('deletes every owned resource before the Auth user, never institution data', async () => {
  const { gateway, calls, resources } = fakeGateway()
  const outcome = await runAccountDeletion(gateway, 'user-1')

  assert.equal(outcome.requestId, 'request-1')
  assert.equal(outcome.trackingComplete, true)
  assert.equal(calls[0].operation, 'createRequest')
  assert.equal(calls.at(-1)?.operation, 'markCompleted')

  const deletedTables = calls
    .filter(call => call.operation === 'deleteOwnedRows')
    .map(call => call.table)
  assert.deepEqual(
    deletedTables,
    OWNED_DATA_STEPS.map(step => step.table),
  )
  assert.equal(deletedTables.includes('campus_jobs'), false)
  assert.equal(deletedTables.includes('colleges'), false)
  assert.equal(deletedTables.includes('profiles'), false)
  assert.equal(calls.at(-2)?.operation, 'deleteAuthUser')
  assert.equal(resources.at(-1)?.interview_sessions, 'deleted')
})

test('optional missing tables are skipped, but a required table failure stops deletion', async () => {
  const skipped = fakeGateway({ missingTables: ['roadmap_ai_plans'] })
  const skippedOutcome = await runAccountDeletion(skipped.gateway, 'user-1')
  assert.equal(skippedOutcome.trackingComplete, true)
  assert.equal(
    skipped.resources.at(-1)?.roadmap_ai_plans,
    'skipped_missing_table',
  )

  const failed = fakeGateway({ failTable: 'interview_sessions' })
  await assert.rejects(
    () => runAccountDeletion(failed.gateway, 'user-1'),
    AccountDeletionError,
  )
  assert.equal(
    failed.calls.some(call => call.operation === 'deleteAuthUser'),
    false,
  )
  assert.deepEqual(failed.failures, [
    { step: 'interview_sessions', code: 'account_deletion_failed' },
  ])
})

test('a partial failure is retry-safe and does not report success', async () => {
  const first = fakeGateway({ failTable: 'problem_submissions' })
  await assert.rejects(() => runAccountDeletion(first.gateway, 'user-1'))

  const retry = fakeGateway()
  const outcome = await runAccountDeletion(retry.gateway, 'user-1')
  assert.equal(outcome.trackingComplete, true)
  assert.equal(retry.calls.at(-2)?.operation, 'deleteAuthUser')
})

test('Auth deletion failure marks the request failed and never reports completion', async () => {
  const { gateway, calls, failures } = fakeGateway({ failAuth: true })
  await assert.rejects(() => runAccountDeletion(gateway, 'user-1'))

  assert.equal(calls.some(call => call.operation === 'markCompleted'), false)
  assert.deepEqual(failures, [{ step: 'auth', code: 'account_deletion_failed' }])
})

test('a failed audit write after a real Auth deletion is not a false deletion failure', async () => {
  const { gateway } = fakeGateway({ failComplete: true })
  const outcome = await runAccountDeletion(gateway, 'user-1')

  assert.equal(outcome.trackingComplete, false)
  assert.ok(outcome.completedAt)
})

test('Delete Account rejects unauthenticated and malformed requests', async () => {
  const unauthenticated = response()
  await createDeleteAccountHandler({
    verifyPassword: async () => true,
    gateway: fakeGateway().gateway,
  })(request({ authenticated: false }), unauthenticated)

  assert.equal(unauthenticated.statusCode, 401)

  const missingPhrase = response()
  await createDeleteAccountHandler({
    verifyPassword: async () => true,
    gateway: fakeGateway().gateway,
  })(
    request({ body: { password: 'correct-password', confirmation: 'yes' } }),
    missingPhrase,
  )
  assert.equal(missingPhrase.statusCode, 400)
})

test('Delete Account requires server-side password reauthentication', async () => {
  const { gateway, calls } = fakeGateway()
  const res = response()
  await createDeleteAccountHandler({
    verifyPassword: async () => false,
    gateway,
  })(
    request({
      body: {
        password: 'wrong-password',
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
        user_id: 'someone-else',
      },
    }),
    res,
  )

  assert.equal(res.statusCode, 403)
  assert.equal(calls.length, 0)
})

test('Delete Account uses only the verified caller id and ignores a forged body id', async () => {
  const { gateway, calls } = fakeGateway()
  let verifiedUserId = ''
  const res = response()
  await createDeleteAccountHandler({
    verifyPassword: async (_email, _password, userId) => {
      verifiedUserId = userId
      return true
    },
    gateway,
  })(
    request({
      body: {
        password: 'correct-password',
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
        user_id: 'another-user',
        userId: 'another-user',
      },
    }),
    res,
  )

  assert.equal(res.statusCode, 200)
  assert.equal(verifiedUserId, 'user-1')
  assert.equal(
    calls.filter(call => call.operation === 'deleteAuthUser').length,
    1,
  )
  assert.deepEqual(res.payload, {
    deleted: true,
    completedAt: (res.payload as { completedAt: string }).completedAt,
    trackingComplete: true,
    retentionDays: 30,
  })
})

test('Delete Account returns 503 without a privileged backend client', async () => {
  let verified = false
  const res = response()
  await createDeleteAccountHandler({
    verifyPassword: async () => {
      verified = true
      return true
    },
    gateway: null,
  })(
    request({
      body: {
        password: 'correct-password',
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      },
    }),
    res,
  )

  assert.equal(res.statusCode, 503)
  assert.equal(verified, false)
})

test('Delete Account rejects an account without an email reauthentication path', async () => {
  const res = response()
  await createDeleteAccountHandler({
    verifyPassword: async () => true,
    gateway: fakeGateway().gateway,
  })(
    request({
      email: null,
      body: {
        password: 'correct-password',
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      },
    }),
    res,
  )

  assert.equal(res.statusCode, 400)
})

test('account deletion rejects cross-site form content types', () => {
  const makeRes = () =>
    ({
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
    }) as unknown as Response & { statusCode: number; payload: unknown }

  const rejected = makeRes()
  let nextCalled = false
  requireJsonContentType(
    { is: () => false } as unknown as Request,
    rejected,
    () => {
      nextCalled = true
    },
  )
  assert.equal(nextCalled, false)
  assert.equal(rejected.statusCode, 415)

  const accepted = makeRes()
  requireJsonContentType(
    { is: () => 'application/json' } as unknown as Request,
    accepted,
    () => {
      nextCalled = true
    },
  )
  assert.equal(nextCalled, true)
  assert.equal(accepted.statusCode, 200)
})

test('account deletion rate limiting rejects repeated attempts per caller', async () => {
  const options = {
    windowMs: 60_000,
    max: 2,
    scope: `account-deletion-test-${Math.random()}`,
  }
  const middleware = rateLimit(options)
  const makeRes = () =>
    ({
      statusCode: 200,
      payload: null as unknown,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this.headers[name] = value
        return this
      },
      status(code: number) {
        this.statusCode = code
        return this
      },
      json(payload: unknown) {
        this.payload = payload
        return this
      },
    }) as unknown as Response & {
      statusCode: number
      payload: unknown
      headers: Record<string, string>
    }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = makeRes()
    let nextCalled = false
    middleware(
      { auth: { userId: 'rate-user' } } as Request,
      res,
      () => {
        nextCalled = true
      },
    )
    assert.equal(nextCalled, true)
  }

  const limited = makeRes()
  let nextCalled = false
  middleware(
    { auth: { userId: 'rate-user' } } as Request,
    limited,
    () => {
      nextCalled = true
    },
  )
  assert.equal(nextCalled, false)
  assert.equal(limited.statusCode, 429)
  assert.ok(limited.headers['Retry-After'])
})
