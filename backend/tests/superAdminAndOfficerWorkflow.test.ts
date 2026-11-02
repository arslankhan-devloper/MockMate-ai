import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response, NextFunction } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  requireRole,
  requireAdmin,
  requireCollegeMembership,
} from '../src/middleware/auth.js'
import { listJobs } from '../src/services/jobs.service.js'
import type { AppRole, ApprovalStatus } from '../src/types/auth.js'

function mockRequest(options: {
  role?: AppRole
  approvalStatus?: ApprovalStatus | null
  rejectionReason?: string | null
  collegeId?: string | null
  authenticated?: boolean
} = {}): Request {
  return {
    auth: options.authenticated === false
      ? undefined
      : {
          userId: 'usr-1',
          email: 'user@example.com',
          role: options.role ?? 'student',
          approvalStatus: options.approvalStatus ?? 'approved',
          rejectionReason: options.rejectionReason ?? null,
          collegeId: options.collegeId ?? null,
          accessToken: 'valid-test-token',
        },
  } as unknown as Request
}

function mockResponse(): Response & { statusCode: number; payload: unknown } {
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

// ---------------------------------------------------------------------------
// 1. Super Admin Authorization & Role Guards
// ---------------------------------------------------------------------------

test('requireAdmin rejects unauthenticated calls with 401', () => {
  const req = mockRequest({ authenticated: false })
  const res = mockResponse()
  let nextCalled = false

  requireAdmin(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 401)
  assert.equal(nextCalled, false)
})

test('requireAdmin rejects student callers with 403', () => {
  const req = mockRequest({ role: 'student' })
  const res = mockResponse()
  let nextCalled = false

  requireAdmin(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 403)
  assert.equal(nextCalled, false)
})

test('requireAdmin rejects placement officers with 403', () => {
  const req = mockRequest({ role: 'placement-officer', approvalStatus: 'approved', collegeId: 'col-1' })
  const res = mockResponse()
  let nextCalled = false

  requireAdmin(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 403)
  assert.equal(nextCalled, false)
})

test('requireAdmin permits verified super_admin callers', () => {
  const req = mockRequest({ role: 'super_admin' })
  const res = mockResponse()
  let nextCalled = false

  requireAdmin(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 200)
  assert.equal(nextCalled, true)
})

// ---------------------------------------------------------------------------
// 2. Officer Approval Workflow & Access Restrictions
// ---------------------------------------------------------------------------

test('pending placement officer cannot access officer routes', () => {
  const req = mockRequest({
    role: 'placement-officer',
    approvalStatus: 'pending',
    collegeId: 'col-1',
  })
  const res = mockResponse()
  let nextCalled = false

  const guard = requireRole('placement-officer')
  guard(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 403)
  assert.equal(nextCalled, false)
  const payload = res.payload as { code: string; status: string }
  assert.equal(payload.code, 'officer_not_approved')
  assert.equal(payload.status, 'pending')
})

test('suspended placement officer cannot access officer routes', () => {
  const req = mockRequest({
    role: 'placement-officer',
    approvalStatus: 'suspended',
    rejectionReason: 'Account suspended for policy violation',
    collegeId: 'col-1',
  })
  const res = mockResponse()
  let nextCalled = false

  const guard = requireRole('placement-officer')
  guard(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 403)
  assert.equal(nextCalled, false)
  const payload = res.payload as { code: string; status: string; rejectionReason: string }
  assert.equal(payload.code, 'officer_suspended')
  assert.equal(payload.status, 'suspended')
  assert.equal(payload.rejectionReason, 'Account suspended for policy violation')
})

test('rejected placement officer cannot access officer routes', () => {
  const req = mockRequest({
    role: 'placement-officer',
    approvalStatus: 'rejected',
    rejectionReason: 'Could not verify institutional email',
    collegeId: 'col-1',
  })
  const res = mockResponse()
  let nextCalled = false

  const guard = requireRole('placement-officer')
  guard(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 403)
  assert.equal(nextCalled, false)
  const payload = res.payload as { code: string; status: string }
  assert.equal(payload.code, 'officer_rejected')
  assert.equal(payload.status, 'rejected')
})

test('approved placement officer with valid status can access officer routes', () => {
  const req = mockRequest({
    role: 'placement-officer',
    approvalStatus: 'approved',
    collegeId: 'col-1',
  })
  const res = mockResponse()
  let nextCalled = false

  const guard = requireRole('placement-officer')
  guard(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 200)
  assert.equal(nextCalled, true)
})

// ---------------------------------------------------------------------------
// 3. College Membership & Global Admin Oversight
// ---------------------------------------------------------------------------

test('requireCollegeMembership allows super_admin regardless of collegeId', () => {
  const req = mockRequest({ role: 'super_admin', collegeId: null })
  const res = mockResponse()
  let nextCalled = false

  requireCollegeMembership(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 200)
  assert.equal(nextCalled, true)
})

test('requireCollegeMembership rejects officer with null collegeId', () => {
  const req = mockRequest({
    role: 'placement-officer',
    approvalStatus: 'approved',
    collegeId: null,
  })
  const res = mockResponse()
  let nextCalled = false

  requireCollegeMembership(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 403)
  assert.equal(nextCalled, false)
})

test('requireCollegeMembership permits officer with assigned collegeId', () => {
  const req = mockRequest({
    role: 'placement-officer',
    approvalStatus: 'approved',
    collegeId: 'college-stanford-uuid',
  })
  const res = mockResponse()
  let nextCalled = false

  requireCollegeMembership(req, res, () => {
    nextCalled = true
  })

  assert.equal(res.statusCode, 200)
  assert.equal(nextCalled, true)
})

// ---------------------------------------------------------------------------
// 4. College-Wise Data Isolation
// ---------------------------------------------------------------------------

test('placement officer query is strictly isolated to assigned college', async () => {
  const calls: { column: string; value: unknown }[] = []

  const mockClient = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            order(_col: string, _opt: unknown) {
              return {
                eq(column: string, value: unknown) {
                  calls.push({ column, value })
                  return { data: [], error: null }
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient

  await listJobs(mockClient, 'placement-officer', 'college-mit-uuid')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].column, 'college_id')
  assert.equal(calls[0].value, 'college-mit-uuid')
})

test('officer without assigned college receives an empty dataset without hitting DB', async () => {
  const mockClient = {
    from() {
      throw new Error('Database must not be queried when college is unassigned')
    },
  } as unknown as SupabaseClient

  const result = await listJobs(mockClient, 'placement-officer', null)

  assert.deepEqual(result.data, [])
  assert.equal(result.error, null)
})

