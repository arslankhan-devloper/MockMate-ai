import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyToJobHandler } from '../src/controllers/jobs.controller.js'
import {
  listOfficerStudentsHandler,
  verifyOfficerStudentHandler,
  rejectOfficerStudentHandler,
} from '../src/controllers/applications.controller.js'
import {
  verifyAdminStudentHandler,
  rejectAdminStudentHandler,
} from '../src/controllers/admin.controller.js'
import type { CollegeVerificationStatus } from '../src/types/auth.js'

function mockResponse(): Response & { statusCode: number; payload: any } {
  const res = {
    statusCode: 200,
    payload: null as any,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.payload = payload
      return this
    },
  }
  return res as unknown as Response & { statusCode: number; payload: any }
}

function mockReadClient(jobData: any, profileData: any) {
  const chain: Record<string, any> = {}
  let currentTable = ''
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = async () => {
    if (currentTable === 'campus_jobs') return { data: jobData, error: null }
    if (currentTable === 'profiles') return { data: profileData, error: null }
    if (currentTable === 'job_applications') return { data: null, error: null }
    return { data: null, error: null }
  }
  return {
    from(table: string) {
      currentTable = table
      return chain
    },
  } as unknown as SupabaseClient
}

function mockWriteClient(inserted: any[]) {
  const chain: Record<string, any> = {}
  chain.insert = (patch: any) => {
    inserted.push(patch)
    return chain
  }
  chain.select = () => chain
  chain.single = async () => ({
    data: {
      id: 'app-1',
      job_id: 'job-1',
      student_id: 'student-1',
      student_name: 'Student One',
      status: 'Applied',
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    error: null,
  })
  return {
    from() {
      return chain
    },
  } as unknown as SupabaseClient
}

test('student with pending college verification is blocked from applying to In-Campus drives', async () => {
  const job = {
    id: 'job-incampus-1',
    college_id: 'college-alpha',
    company: 'TechCorp',
    title: 'SWE',
    location: 'Campus',
    job_type: 'In-Campus',
    status: 'published',
    branches: ['CSE'],
    application_deadline: '2030-01-01',
    application_link: null,
  }
  const profile = { full_name: 'Alex Student', branch: 'CSE' }

  const req = {
    auth: {
      userId: 'student-1',
      email: 'student@alpha.edu',
      role: 'student',
      collegeId: 'college-alpha',
      collegeVerificationStatus: 'pending' as CollegeVerificationStatus,
      accessToken: 'token',
    },
    supabase: mockReadClient(job, profile),
    params: { id: 'job-incampus-1' },
    body: {},
  } as unknown as Request

  const res = mockResponse()
  await applyToJobHandler(req, res)

  assert.equal(res.statusCode, 403)
  assert.equal(res.payload.code, 'college_verification_required')
})

test('student with rejected college verification is blocked from applying to In-Campus drives', async () => {
  const job = {
    id: 'job-incampus-1',
    college_id: 'college-alpha',
    company: 'TechCorp',
    title: 'SWE',
    location: 'Campus',
    job_type: 'In-Campus',
    status: 'published',
    branches: ['CSE'],
    application_deadline: '2030-01-01',
    application_link: null,
  }
  const profile = { full_name: 'Alex Student', branch: 'CSE' }

  const req = {
    auth: {
      userId: 'student-1',
      email: 'student@alpha.edu',
      role: 'student',
      collegeId: 'college-alpha',
      collegeVerificationStatus: 'rejected' as CollegeVerificationStatus,
      collegeVerificationReason: 'Invalid enrollment number provided',
      accessToken: 'token',
    },
    supabase: mockReadClient(job, profile),
    params: { id: 'job-incampus-1' },
    body: {},
  } as unknown as Request

  const res = mockResponse()
  await applyToJobHandler(req, res)

  assert.equal(res.statusCode, 403)
  assert.equal(res.payload.code, 'college_verification_required')
})

test('student with verified college verification can apply to In-Campus drives', async () => {
  const job = {
    id: 'job-incampus-1',
    college_id: 'college-alpha',
    company: 'TechCorp',
    title: 'SWE',
    location: 'Campus',
    job_type: 'In-Campus',
    status: 'published',
    branches: ['CSE'],
    application_deadline: '2030-01-01',
    application_link: null,
  }
  const profile = { full_name: 'Alex Student', branch: 'CSE' }
  const inserted: any[] = []

  const req = {
    auth: {
      userId: 'student-1',
      email: 'student@alpha.edu',
      role: 'student',
      collegeId: 'college-alpha',
      collegeVerificationStatus: 'verified' as CollegeVerificationStatus,
      accessToken: 'token',
    },
    supabase: mockReadClient(job, profile),
    supabaseWrite: mockWriteClient(inserted),
    params: { id: 'job-incampus-1' },
    body: {},
  } as unknown as Request

  const res = mockResponse()
  await applyToJobHandler(req, res)

  assert.equal(res.statusCode, 201)
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].student_id, 'student-1')
})

test('placement officer cannot list students without an assigned college', async () => {
  const req = {
    auth: {
      userId: 'officer-1',
      role: 'placement-officer',
      collegeId: null,
    },
    query: {},
  } as unknown as Request

  const res = mockResponse()
  await listOfficerStudentsHandler(req, res)

  assert.equal(res.statusCode, 403)
  assert.equal(res.payload.code, 'no_college')
})

test('placement officer cannot verify student from another college (strict college isolation)', async () => {
  const studentInOtherCollege = {
    id: 'student-beta-1',
    email: 'other@beta.edu',
    full_name: 'Other Student',
    role: 'student',
    college_id: 'college-beta',
    roll_number: 'BETA-001',
    college_verification_status: 'pending',
  }

  const mockAdmin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: studentInOtherCollege, error: null }),
                  }
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient

  const req = {
    auth: {
      userId: 'officer-alpha',
      role: 'placement-officer',
      collegeId: 'college-alpha',
    },
    supabaseWrite: mockAdmin,
    params: { id: 'student-beta-1' },
    body: {},
  } as unknown as Request

  const res = mockResponse()
  await verifyOfficerStudentHandler(req, res)

  assert.equal(res.statusCode, 403)
  assert.equal(res.payload.code, 'forbidden')
  assert.match(res.payload.error, /Student does not belong to your college/i)
})

test('placement officer duplicate roll number verification is rejected with 409 conflict', async () => {
  const student = {
    id: 'student-alpha-2',
    email: 'two@alpha.edu',
    full_name: 'Second Student',
    role: 'student',
    college_id: 'college-alpha',
    roll_number: 'ALPHA-007',
    college_verification_status: 'pending',
  }

  const existingVerified = [
    {
      id: 'student-alpha-1',
      roll_number: 'alpha-007',
    },
  ]

  const mockAdmin = {
    from() {
      return {
        select() {
          return {
            eq(col: string) {
              if (col === 'id') {
                return {
                  eq: () => ({
                    maybeSingle: async () => ({ data: student, error: null }),
                  }),
                }
              }
              return {
                eq: () => ({
                  eq: () => ({
                    neq: async () => ({ data: existingVerified, error: null }),
                  }),
                }),
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient

  const req = {
    auth: {
      userId: 'officer-alpha',
      role: 'placement-officer',
      collegeId: 'college-alpha',
    },
    supabaseWrite: mockAdmin,
    params: { id: 'student-alpha-2' },
    body: {},
  } as unknown as Request

  const res = mockResponse()
  await verifyOfficerStudentHandler(req, res)

  assert.equal(res.statusCode, 409)
  assert.equal(res.payload.code, 'duplicate_roll_number')
  assert.match(res.payload.error, /already verified/i)
})

test('placement officer can successfully verify student with unique roll number', async () => {
  const student = {
    id: 'student-alpha-3',
    email: 'three@alpha.edu',
    full_name: 'Third Student',
    role: 'student',
    college_id: 'college-alpha',
    roll_number: 'ALPHA-101',
    college_verification_status: 'pending',
  }

  let updatedPayload: any = null
  const mockAdmin = {
    from() {
      return {
        select() {
          return {
            eq(col: string) {
              if (col === 'id') {
                return {
                  eq: () => ({
                    maybeSingle: async () => ({ data: student, error: null }),
                  }),
                }
              }
              return {
                eq: () => ({
                  eq: () => ({
                    neq: async () => ({ data: [], error: null }),
                  }),
                }),
              }
            },
          }
        },
        update(patch: any) {
          updatedPayload = patch
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { ...student, ...patch },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        },
      }
    },
  } as unknown as SupabaseClient

  const req = {
    auth: {
      userId: 'officer-alpha',
      role: 'placement-officer',
      collegeId: 'college-alpha',
    },
    supabaseWrite: mockAdmin,
    params: { id: 'student-alpha-3' },
    body: {},
  } as unknown as Request

  const res = mockResponse()
  await verifyOfficerStudentHandler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(updatedPayload?.college_verification_status, 'verified')
  assert.equal(updatedPayload?.verified_by, 'officer-alpha')
  assert.ok(updatedPayload?.verified_at)
})

test('placement officer can reject student verification with reason', async () => {
  const student = {
    id: 'student-alpha-4',
    email: 'four@alpha.edu',
    full_name: 'Fourth Student',
    role: 'student',
    college_id: 'college-alpha',
  }

  let updatedPayload: any = null
  const mockAdmin = {
    from() {
      return {
        select() {
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: student, error: null }),
              }),
            }),
          }
        },
        update(patch: any) {
          updatedPayload = patch
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { ...student, ...patch },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        },
      }
    },
  } as unknown as SupabaseClient

  const req = {
    auth: {
      userId: 'officer-alpha',
      role: 'placement-officer',
      collegeId: 'college-alpha',
    },
    supabaseWrite: mockAdmin,
    params: { id: 'student-alpha-4' },
    body: { reason: 'Roll number not found in university records' },
  } as unknown as Request

  const res = mockResponse()
  await rejectOfficerStudentHandler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(updatedPayload?.college_verification_status, 'rejected')
  assert.equal(updatedPayload?.college_verification_reason, 'Roll number not found in university records')
  assert.equal(updatedPayload?.verified_by, 'officer-alpha')
})

test('super admin can verify student across any college', async () => {
  const student = {
    id: 'student-any-5',
    email: 'five@any.edu',
    full_name: 'Fifth Student',
    role: 'student',
    college_id: 'college-gamma',
    roll_number: 'GAMMA-505',
    college_verification_status: 'pending',
  }

  let updatedPayload: any = null
  const mockAdmin = {
    from() {
      return {
        select() {
          return {
            eq(col: string) {
              if (col === 'id') {
                return {
                  eq: () => ({
                    maybeSingle: async () => ({ data: student, error: null }),
                  }),
                }
              }
              return {
                eq: () => ({
                  eq: () => ({
                    neq: async () => ({ data: [], error: null }),
                  }),
                }),
              }
            },
          }
        },
        update(patch: any) {
          updatedPayload = patch
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { ...student, ...patch },
                  error: null,
                }),
              }),
            }),
          }
        },
      }
    },
  } as unknown as SupabaseClient

  const req = {
    auth: {
      userId: 'super-admin-root',
      role: 'super_admin',
    },
    supabaseWrite: mockAdmin,
    params: { id: 'student-any-5' },
    body: {},
  } as unknown as Request

  const res = mockResponse()
  await verifyAdminStudentHandler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(updatedPayload?.college_verification_status, 'verified')
  assert.equal(updatedPayload?.verified_by, 'super-admin-root')
})

test('super admin can reject student verification with reason', async () => {
  const student = {
    id: 'student-any-6',
    email: 'six@any.edu',
    full_name: 'Sixth Student',
    role: 'student',
    college_id: 'college-delta',
    roll_number: 'DELTA-606',
    college_verification_status: 'pending',
  }

  let updatedPayload: any = null
  const mockAdmin = {
    from() {
      return {
        update(patch: any) {
          updatedPayload = patch
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { ...student, ...patch },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        },
      }
    },
  } as unknown as SupabaseClient

  const req = {
    auth: {
      userId: 'super-admin-root',
      role: 'super_admin',
    },
    supabaseWrite: mockAdmin,
    params: { id: 'student-any-6' },
    body: { reason: 'Forged documentation' },
  } as unknown as Request

  const res = mockResponse()
  await rejectAdminStudentHandler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(updatedPayload?.college_verification_status, 'rejected')
  assert.equal(updatedPayload?.college_verification_reason, 'Forged documentation')
  assert.equal(updatedPayload?.verified_by, 'super-admin-root')
})
