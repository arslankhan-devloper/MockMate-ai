import assert from 'node:assert/strict'
import test from 'node:test'
import {
  completionRate,
  pickScoreHighlights,
} from '../src/lib/analytics.ts'
import type { InterviewAnalyticsGroup, InterviewAnalyticsTotals } from '../src/lib/interviews.ts'

function group(overrides: Partial<InterviewAnalyticsGroup> = {}): InterviewAnalyticsGroup {
  return {
    key: 'technical',
    label: 'Technical',
    sessions: 1,
    evaluatedAnswers: 1,
    averageScore: 70,
    ...overrides,
  }
}

function totals(overrides: Partial<InterviewAnalyticsTotals> = {}): InterviewAnalyticsTotals {
  return {
    sessions: 10,
    completed: 6,
    inProgress: 3,
    abandoned: 1,
    answeredQuestions: 30,
    unansweredQuestions: 5,
    evaluatedAnswers: 20,
    averageScore: 72,
    ...overrides,
  }
}

test('completion rate is null without sessions and rounded otherwise', () => {
  assert.equal(completionRate(null), null)
  assert.equal(completionRate(totals({ sessions: 0, completed: 0 })), null)
  assert.equal(completionRate(totals({ sessions: 3, completed: 2 })), 67)
})

test('score highlights compare only areas with real evaluated answers', () => {
  const highlights = pickScoreHighlights([
    group({ key: 'dsa', label: 'DSA', averageScore: 82, evaluatedAnswers: 5 }),
    group({ key: 'sql', label: 'SQL', averageScore: 64, evaluatedAnswers: 3 }),
    group({ key: 'hr', label: 'HR', averageScore: null, evaluatedAnswers: 0 }),
    group({ key: 'empty', label: 'Empty', averageScore: 99, evaluatedAnswers: 0 }),
  ])

  assert.equal(highlights?.strongest.key, 'dsa')
  assert.equal(highlights?.weakest.key, 'sql')
  assert.equal(pickScoreHighlights([group()]), null)
  assert.equal(
    pickScoreHighlights([
      group({ key: 'dsa', averageScore: 80 }),
      group({ key: 'hr', averageScore: null, evaluatedAnswers: 0 }),
    ]),
    null,
  )
})
