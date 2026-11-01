import assert from 'node:assert/strict'
import test from 'node:test'
import { profileSnapshot, validateProfileForm } from '../src/lib/profileForm.ts'
import type { ProfileData } from '../src/data/profiles.ts'
import type { InterviewAnalytics } from '../src/lib/interviews.ts'

function profile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    fullName: 'Ada Student',
    email: 'ada@example.com',
    phone: '',
    collegeName: 'Example College',
    branch: 'Computer Science',
    gradYear: '2026',
    designation: '',
    department: '',
    ...overrides,
  }
}

function analytics(overrides: Partial<InterviewAnalytics> = {}): InterviewAnalytics {
  return {
    scope: 'student',
    range: 'all',
    generatedAt: '2026-01-01T00:00:00.000Z',
    availability: {
      sessions: true,
      turns: true,
      topics: true,
      evaluations: true,
      applications: true,
    },
    totals: {
      sessions: 5,
      completed: 3,
      inProgress: 1,
      abandoned: 1,
      answeredQuestions: 12,
      unansweredQuestions: 3,
      evaluatedAnswers: 10,
      averageScore: 71.6,
    },
    byDomain: [],
    byDifficulty: [],
    byTopic: [],
    strengths: [],
    weaknesses: [],
    applications: {
      total: 4,
      inRange: 4,
      byStatus: [
        { status: 'Applied', count: 2 },
        { status: 'Shortlisted', count: 2 },
      ],
    },
    recentSessions: [],
    trend: null,
    notes: [],
    ...overrides,
  }
}

test('profile validation requires the same fields as a complete profile', () => {
  assert.deepEqual(validateProfileForm(profile()), {})

  const empty = validateProfileForm(profile({ fullName: ' ', branch: '', gradYear: '' }))
  assert.equal(empty.fullName, 'Full name is required.')
  assert.equal(empty.branch, 'Branch is required.')
  assert.equal(empty.gradYear, 'Graduation year is required.')

  const tooLong = validateProfileForm(profile({ fullName: 'x'.repeat(121), phone: '1'.repeat(33) }))
  assert.equal(tooLong.fullName, 'Must be at most 120 characters.')
  assert.equal(tooLong.phone, 'Must be at most 32 characters.')
})

test('profile snapshot uses persisted analytics and never invents unavailable values', () => {
  const snapshot = profileSnapshot(analytics())
  assert.equal(snapshot?.sessions, 5)
  assert.equal(snapshot?.completed, 3)
  assert.equal(snapshot?.completionRate, 60)
  assert.equal(snapshot?.averageScore, 71.6)
  assert.equal(snapshot?.applications, 4)
  assert.deepEqual(snapshot?.applicationStatuses, analytics().applications?.byStatus)

  assert.equal(profileSnapshot(null), null)

  const unavailable = profileSnapshot(analytics({
    availability: {
      sessions: false,
      turns: false,
      topics: false,
      evaluations: false,
      applications: false,
    },
    applications: null,
  }))
  assert.equal(unavailable?.sessions, null)
  assert.equal(unavailable?.completed, null)
  assert.equal(unavailable?.completionRate, null)
  assert.equal(unavailable?.averageScore, null)
  assert.equal(unavailable?.applications, null)
  assert.deepEqual(unavailable?.applicationStatuses, [])
})

test('zero sessions and no applications stay zero instead of becoming null', () => {
  const snapshot = profileSnapshot(analytics({
    totals: {
      sessions: 0,
      completed: 0,
      inProgress: 0,
      abandoned: 0,
      answeredQuestions: 0,
      unansweredQuestions: 0,
      evaluatedAnswers: 0,
      averageScore: null,
    },
    applications: { total: 0, inRange: 0, byStatus: [] },
  }))

  assert.equal(snapshot?.sessions, 0)
  assert.equal(snapshot?.completed, 0)
  assert.equal(snapshot?.completionRate, null)
  assert.equal(snapshot?.averageScore, null)
  assert.equal(snapshot?.applications, 0)
})
