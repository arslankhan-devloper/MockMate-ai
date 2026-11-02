import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ANALYTICS_UPDATED_EVENT,
  dashboardIsEmpty,
  emptyModules,
  formatCount,
  formatDuration,
  formatPercent,
  formatScore,
  humanizeToken,
  minutesSince,
  notifyAnalyticsUpdated,
  rangeLabel,
  scopeLabel,
  trendDelta,
} from '../src/lib/analyticsFormat.ts'
import type { AnalyticsDashboard } from '../src/lib/analyticsDashboard.ts'

// ---------------------------------------------------------------------------
// Formatting: null means "no data", never zero
// ---------------------------------------------------------------------------

test('formatPercent keeps one decimal and renders missing data as a dash', () => {
  assert.equal(formatPercent(66.66), '66.7%')
  assert.equal(formatPercent(100), '100%')
  assert.equal(formatPercent(0), '0%')
  assert.equal(formatPercent(null), '—')
  assert.equal(formatPercent(undefined), '—')
  assert.equal(formatPercent(Number.NaN), '—')
})

test('formatScore keeps one decimal and never shows a fake zero', () => {
  assert.equal(formatScore(71.44), '71.4')
  assert.equal(formatScore(0), '0')
  assert.equal(formatScore(null), '—')
  assert.equal(formatScore(Number.POSITIVE_INFINITY), '—')
})

test('formatCount distinguishes "unavailable" from zero', () => {
  assert.equal(formatCount(0), '0')
  assert.equal(formatCount(1234), '1,234')
  assert.equal(formatCount(null), '—')
  assert.equal(formatCount(undefined), '—')
})

test('formatDuration renders seconds and minutes, or a dash', () => {
  assert.equal(formatDuration(0), '0s')
  assert.equal(formatDuration(45), '45s')
  assert.equal(formatDuration(60), '1m')
  assert.equal(formatDuration(100), '1m 40s')
  assert.equal(formatDuration(null), '—')
  assert.equal(formatDuration(-5), '—')
})

test('humanizeToken produces readable labels from stored tokens', () => {
  assert.equal(humanizeToken('wrong_answer'), 'Wrong Answer')
  assert.equal(humanizeToken('under-review'), 'Under Review')
  assert.equal(humanizeToken('hr'), 'HR')
  assert.equal(humanizeToken('dsa'), 'DSA')
  assert.equal(humanizeToken(''), 'Unknown')
})

test('rangeLabel and scopeLabel describe the current view', () => {
  assert.equal(rangeLabel('1w'), 'Last 7 days')
  assert.equal(rangeLabel('1m'), 'Last 30 days')
  assert.equal(rangeLabel('3m'), 'Last 90 days')
  assert.equal(rangeLabel('all'), 'All time')
  assert.equal(scopeLabel('student'), 'Your activity')
  assert.equal(scopeLabel('college'), 'College-wide aggregates')
})

test('minutesSince is null for an unparseable timestamp and clamps future values', () => {
  const now = Date.parse('2026-01-10T12:00:00.000Z')
  assert.equal(minutesSince('2026-01-10T11:30:00.000Z', now), 30)
  assert.equal(minutesSince('2026-01-10T13:00:00.000Z', now), 0)
  assert.equal(minutesSince('not-a-date', now), null)
})

// ---------------------------------------------------------------------------
// Trend delta
// ---------------------------------------------------------------------------

test('trendDelta needs two periods and real earlier data', () => {
  assert.equal(trendDelta([10]), null)
  assert.equal(trendDelta([]), null)
  // Earlier half is all zeros: no meaningful baseline, so no fabricated change.
  assert.equal(trendDelta([0, 0, 5, 5]), null)
})

test('trendDelta reports direction and percentage across the two halves', () => {
  assert.deepEqual(trendDelta([10, 10, 15, 15]), { direction: 'up', deltaPercent: 50 })
  assert.deepEqual(trendDelta([10, 10, 5, 5]), { direction: 'down', deltaPercent: -50 })
  assert.deepEqual(trendDelta([10, 10, 10, 10]), { direction: 'flat', deltaPercent: 0 })
})

// ---------------------------------------------------------------------------
// Dashboard emptiness helpers
// ---------------------------------------------------------------------------

function dashboard(overrides: {
  overview?: Partial<AnalyticsDashboard['overview']>
  availability?: Partial<AnalyticsDashboard['availability']>
  interviewsSessions?: number
  practiceSessions?: number | null
  dsaSubmissions?: number | null
  codingAttempts?: number | null
  roadmapCompleted?: number | null
  applicationsTotal?: number | null
} = {}): AnalyticsDashboard {
  const availability = {
    interviews: true,
    practice: true,
    dsa: true,
    coding: true,
    applications: true,
    roadmap: true,
    resume: false as const,
    ...overrides.availability,
  }
  return {
    scope: 'student',
    range: 'all',
    generatedAt: '2026-01-20T00:00:00.000Z',
    availability,
    overview: {
      interviewsCompleted: 0,
      averageInterviewScore: null,
      practiceTestsAttempted: null,
      practiceTestsCompleted: null,
      practiceQuestionsAnswered: null,
      practiceAccuracy: null,
      dsaProblemsSolved: null,
      dsaProblemsAttempted: null,
      dsaSubmissions: null,
      dsaSuccessRate: null,
      codingAttempts: null,
      codingSuccessRate: null,
      roadmapTopicsCompleted: null,
      applicationsTotal: null,
      applicationsByStatus: null,
      resumeAtsScore: null,
      ...overrides.overview,
    },
    readiness: {
      available: false,
      score: null,
      coverage: 0,
      components: [],
      formula: 'documented formula',
      reason: 'Not enough data',
    },
    interviews: {
      scope: 'student',
      range: 'all',
      generatedAt: '2026-01-20T00:00:00.000Z',
      availability: { sessions: true, turns: false, topics: false, evaluations: false, applications: true },
      totals: {
        sessions: overrides.interviewsSessions ?? 0,
        completed: 0,
        inProgress: 0,
        abandoned: 0,
        answeredQuestions: null,
        unansweredQuestions: null,
        evaluatedAnswers: 0,
        averageScore: null,
      },
      byDomain: [],
      byDifficulty: [],
      byTopic: [],
      strengths: [],
      weaknesses: [],
      applications: null,
      recentSessions: [],
      trend: null,
      notes: [],
    } as unknown as AnalyticsDashboard['interviews'],
    practice:
      overrides.practiceSessions === null
        ? null
        : ({ sessionsAttempted: overrides.practiceSessions ?? 0 } as AnalyticsDashboard['practice']),
    dsa:
      overrides.dsaSubmissions === null
        ? null
        : ({ submissions: overrides.dsaSubmissions ?? 0 } as AnalyticsDashboard['dsa']),
    coding:
      overrides.codingAttempts === null
        ? null
        : ({ attempts: overrides.codingAttempts ?? 0 } as AnalyticsDashboard['coding']),
    roadmap:
      overrides.roadmapCompleted === null
        ? null
        : ({ topicsCompleted: overrides.roadmapCompleted ?? 0 } as AnalyticsDashboard['roadmap']),
    applications:
      overrides.applicationsTotal === null
        ? null
        : ({ total: overrides.applicationsTotal ?? 0 } as AnalyticsDashboard['applications']),
    recentActivity: [],
    notes: [],
  }
}

test('dashboardIsEmpty is true only when every module reports zero rows', () => {
  assert.equal(dashboardIsEmpty(null), false)
  assert.equal(dashboardIsEmpty(dashboard()), true)
  assert.equal(dashboardIsEmpty(dashboard({ interviewsSessions: 1 })), false)
  assert.equal(dashboardIsEmpty(dashboard({ dsaSubmissions: 2 })), false)
  assert.equal(dashboardIsEmpty(dashboard({ applicationsTotal: 1 })), false)
})

test('dashboardIsEmpty treats unavailable modules as absent rather than empty', () => {
  // Every optional module is unavailable and no interviews exist.
  assert.equal(
    dashboardIsEmpty(
      dashboard({
        practiceSessions: null,
        dsaSubmissions: null,
        codingAttempts: null,
        roadmapCompleted: null,
        applicationsTotal: null,
      }),
    ),
    true,
  )
})

test('emptyModules lists only available modules with no data', () => {
  assert.deepEqual(emptyModules(dashboard()), [
    'Interviews',
    'Practice Hub',
    'DSA',
    'Coding Round',
    'Roadmap',
    'Placement',
  ])

  assert.deepEqual(
    emptyModules(dashboard({ dsaSubmissions: null, roadmapCompleted: null, applicationsTotal: null })),
    ['Interviews', 'Practice Hub', 'Coding Round'],
  )

  assert.deepEqual(
    emptyModules(
      dashboard({
        interviewsSessions: 2,
        practiceSessions: 3,
        dsaSubmissions: 4,
        codingAttempts: 5,
        roadmapCompleted: 6,
        applicationsTotal: 7,
      }),
    ),
    [],
  )
})

// ---------------------------------------------------------------------------
// Refresh event
// ---------------------------------------------------------------------------

test('notifyAnalyticsUpdated dispatches the documented window event', () => {
  const seen: string[] = []
  const handler = () => seen.push('hit')
  const target = new EventTarget()
  const originalWindow = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = {
    dispatchEvent: (event: Event) => target.dispatchEvent(event),
  }
  target.addEventListener(ANALYTICS_UPDATED_EVENT, handler)

  try {
    notifyAnalyticsUpdated()
    assert.deepEqual(seen, ['hit'])
    assert.equal(ANALYTICS_UPDATED_EVENT, 'mockmate:analytics-updated')
  } finally {
    target.removeEventListener(ANALYTICS_UPDATED_EVENT, handler)
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
})

test('notifyAnalyticsUpdated is a no-op when no window exists', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  delete (globalThis as { window?: unknown }).window
  try {
    assert.doesNotThrow(() => notifyAnalyticsUpdated())
  } finally {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
})
