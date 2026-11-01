import assert from 'node:assert/strict'
import test from 'node:test'
import {
  recommendJobs,
  type RecommendationJob,
  type RecommendationSignals,
} from '../src/lib/jobRecommendations.ts'

function job(overrides: Partial<RecommendationJob> = {}): RecommendationJob {
  return {
    id: 'job-1',
    source: 'external',
    title: 'Software Engineer',
    company: 'Acme',
    location: 'India',
    remote: true,
    description: 'Build web applications.',
    employmentType: 'Full Time',
    seniority: 'Mid-level',
    category: 'Software Engineering',
    ...overrides,
  }
}

function signals(overrides: Partial<RecommendationSignals> = {}): RecommendationSignals {
  return {
    targetRole: 'Software Engineer',
    skills: [],
    branch: null,
    preferredLocation: null,
    preferredWorkMode: null,
    ...overrides,
  }
}

test('returns no recommendations when no profile or resume signals exist', () => {
  const result = recommendJobs(
    [job()],
    signals({ targetRole: null }),
  )

  assert.equal(result.hasSignals, false)
  assert.deepEqual(result.recommendations, [])
  assert.equal(result.availability.targetRole, false)
  assert.equal(result.availability.skills, false)
  assert.equal(result.availability.eligibility, false)
})

test('normalizes role and skill formatting before matching', () => {
  const result = recommendJobs(
    [
      job({
        title: 'FRONT-END ENGINEER',
        description: 'React.js, NODEJS and TypeScript experience required.',
      }),
    ],
    signals({
      targetRole: 'front end developer',
      skills: ['React', 'Node.js', 'TypeScript'],
    }),
  )

  assert.equal(result.recommendations.length, 1)
  assert.equal(result.recommendations[0].job.title, 'FRONT-END ENGINEER')
  assert.deepEqual(
    result.recommendations[0].matchedSkills,
    ['React', 'Node.js', 'TypeScript'],
  )
  assert.ok(result.recommendations[0].reasons.some(reason => reason.kind === 'role'))
  assert.ok(result.recommendations[0].reasons.some(reason => reason.kind === 'skills'))
})

test('ranks strong role and skill matches ahead of weak matches', () => {
  const result = recommendJobs(
    [
      job({
        id: 'weak',
        title: 'Marketing Manager',
        description: 'Mention React once.',
      }),
      job({
        id: 'strong',
        title: 'Senior Software Engineer',
        description: 'React, Node.js and TypeScript.',
        category: 'TypeScript',
      }),
    ],
    signals({ skills: ['React', 'Node.js', 'TypeScript'] }),
  )

  assert.deepEqual(
    result.recommendations.map(item => item.job.id),
    ['strong', 'weak'],
  )
  assert.equal(result.recommendations[0].score, 75)
})

test('does not treat a missing branch as a mismatch', () => {
  const result = recommendJobs(
    [
      job({
        source: 'campus',
        branches: ['Mechanical'],
      }),
    ],
    signals({ branch: null }),
  )

  assert.equal(result.recommendations.length, 1)
  assert.equal(
    result.recommendations[0].reasons.some(reason => reason.kind === 'eligibility'),
    false,
  )
})

test('removes a campus job when the known branch is not eligible', () => {
  const result = recommendJobs(
    [
      job({
        source: 'campus',
        branches: ['Mechanical'],
      }),
    ],
    signals({ branch: 'Computer Science' }),
  )

  assert.deepEqual(result.recommendations, [])
})

test('adds a branch-eligibility reason for a matching campus job', () => {
  const result = recommendJobs(
    [
      job({
        source: 'campus',
        branches: ['Computer Science', 'Information Technology'],
      }),
    ],
    signals({ branch: 'Computer Science' }),
  )

  assert.equal(result.recommendations.length, 1)
  assert.ok(
    result.recommendations[0].reasons.some(reason => reason.kind === 'eligibility'),
  )
})

test('deduplicates the same job and keeps the stronger match', () => {
  const result = recommendJobs(
    [
      job({
        id: 'campus-copy',
        source: 'campus',
        description: 'Build web applications.',
      }),
      job({
        id: 'external-copy',
        source: 'external',
        description: 'React and TypeScript.',
      }),
    ],
    signals({ skills: ['React', 'TypeScript'] }),
  )

  assert.equal(result.recommendations.length, 1)
  assert.equal(result.recommendations[0].job.id, 'external-copy')
  assert.ok(result.recommendations[0].score > 0)
})

test('returns an empty result when there are no jobs to match', () => {
  const result = recommendJobs([], signals())

  assert.equal(result.hasSignals, true)
  assert.deepEqual(result.recommendations, [])
})

test('returns an empty result when loaded jobs have no matching signal', () => {
  const result = recommendJobs(
    [
      job({
        title: 'Accountant',
        description: 'Prepare tax filings.',
        category: 'Finance',
      }),
    ],
    signals({ skills: ['React', 'TypeScript'] }),
  )

  assert.equal(result.hasSignals, true)
  assert.deepEqual(result.recommendations, [])
})

test('scores a real stored location and work-mode preference when provided', () => {
  const result = recommendJobs(
    [job({ location: 'Bengaluru, India', remote: true })],
    signals({
      targetRole: 'Software Engineer',
      preferredLocation: 'Bengaluru',
      preferredWorkMode: 'remote',
    }),
  )

  assert.equal(result.recommendations.length, 1)
  assert.ok(
    result.recommendations[0].reasons.some(reason => reason.kind === 'location'),
  )
})

test('honours the requested result limit', () => {
  const jobs = Array.from({ length: 6 }, (_, index) => job({
    id: `job-${index}`,
    company: `Company ${index}`,
  }))

  const result = recommendJobs(jobs, signals(), 3)
  assert.equal(result.recommendations.length, 3)
})
