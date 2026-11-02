import { apiRequest } from './api'
import type { InterviewAnalytics, InterviewAnalyticsRange } from './interviews'

// Typed client for the unified analytics dashboard.
//
// Every field maps 1:1 to an aggregate the backend computed from stored rows.
// A `null` always means "this module is unavailable or has no data yet" â€” it is
// never coerced to zero. Nothing here is derived from mock or seeded data.

export interface AnalyticsScoreGroup {
  key: string
  label: string
  answered: number
  correct: number
  accuracy: number | null
}

export interface PracticeTrendBucket {
  periodStart: string
  label: string
  sessions: number
  answered: number
  correct: number
  accuracy: number | null
}

export interface PracticeRecentSession {
  id: string
  kind: string
  category: string | null
  topic: string | null
  difficulty: string
  mode: string
  status: 'completed' | 'active' | 'abandoned'
  startedAt: string
  completedAt: string | null
  questionCount: number
  answered: number
  correct: number
  accuracy: number | null
}

export interface PracticeAnalytics {
  sessionsAttempted: number
  sessionsCompleted: number
  sessionsInProgress: number
  sessionsAbandoned: number
  questionsAnswered: number
  correctAnswers: number
  incorrectAnswers: number
  accuracy: number | null
  byCategory: AnalyticsScoreGroup[]
  byTopic: AnalyticsScoreGroup[]
  byDifficulty: AnalyticsScoreGroup[]
  byMode: AnalyticsScoreGroup[]
  byKind: AnalyticsScoreGroup[]
  trend: PracticeTrendBucket[]
  trendGranularity: 'day' | 'month'
  recentSessions: PracticeRecentSession[]
}

export interface DsaTopicBreakdown {
  key: string
  label: string
  attempts: number
  solved: number
  accepted: number
  accuracy: number | null
}

export interface DsaTrendBucket {
  periodStart: string
  label: string
  submissions: number
  accepted: number
}

export interface DsaRecentSubmission {
  id: string
  questionId: string
  title: string
  topic: string
  difficulty: string
  language: string
  verdict: string
  createdAt: string
}

export interface DsaAnalytics {
  problemsAttempted: number
  problemsSolved: number
  solveRate: number | null
  submissions: number
  acceptedSubmissions: number
  failedSubmissions: number
  successRate: number | null
  byLanguage: { key: string; label: string; count: number }[]
  byDifficulty: DsaTopicBreakdown[]
  byTopic: DsaTopicBreakdown[]
  trend: DsaTrendBucket[]
  trendGranularity: 'day' | 'month'
  recentSubmissions: DsaRecentSubmission[]
}

export interface CodingTrendBucket {
  periodStart: string
  label: string
  attempts: number
  successes: number
}

export interface CodingRecentAttempt {
  id: string
  sessionId: string
  questionIndex: number
  language: string
  status: 'success' | 'error'
  createdAt: string
}

export interface CodingAnalytics {
  attempts: number
  successes: number
  failures: number
  successRate: number | null
  averageSeconds: number | null
  byLanguage: { key: string; label: string; count: number }[]
  trend: CodingTrendBucket[]
  trendGranularity: 'day' | 'month'
  recentAttempts: CodingRecentAttempt[]
}

export interface RoadmapDomainProgress {
  key: string
  label: string
  completed: number
}

export interface RoadmapCompletedTopic {
  domainId: string
  domainLabel: string
  topicId: string
  completedAt: string
}

export interface RoadmapAnalytics {
  topicsCompleted: number
  topicsCompletedInRange: number
  /** Null: a saved plan counts tasks, not the catalog topic ids progress uses. */
  topicsPlanned: number | null
  /** Not persisted anywhere â€” always null. */
  topicsInProgress: null
  /** Not persisted anywhere â€” always null. */
  topicsPending: null
  progressPercent: null
  planGeneratedAt: string | null
  byDomain: RoadmapDomainProgress[]
  recentlyCompleted: RoadmapCompletedTopic[]
}

export interface PlacementTrendBucket {
  periodStart: string
  label: string
  applications: number
}

export interface PlacementAnalytics {
  total: number
  byStatus: { status: string; count: number }[]
  trend: PlacementTrendBucket[]
  trendGranularity: 'day' | 'month'
}

export interface ReadinessComponent {
  key: string
  label: string
  weight: number
  value: number | null
  included: boolean
  detail: string
}

export interface ReadinessScore {
  available: boolean
  score: number | null
  coverage: number
  components: ReadinessComponent[]
  formula: string
  reason: string | null
}

export interface AnalyticsOverview {
  interviewsCompleted: number
  averageInterviewScore: number | null
  practiceTestsAttempted: number | null
  practiceTestsCompleted: number | null
  practiceQuestionsAnswered: number | null
  practiceAccuracy: number | null
  dsaProblemsSolved: number | null
  dsaProblemsAttempted: number | null
  dsaSubmissions: number | null
  dsaSuccessRate: number | null
  codingAttempts: number | null
  codingSuccessRate: number | null
  roadmapTopicsCompleted: number | null
  applicationsTotal: number | null
  applicationsByStatus: { status: string; count: number }[] | null
  resumeAtsScore: null
}

export interface AnalyticsActivityItem {
  id: string
  kind: 'interview' | 'practice' | 'dsa' | 'coding' | 'application'
  title: string
  detail: string
  at: string
}

export interface AnalyticsDashboardAvailability {
  interviews: boolean
  practice: boolean
  dsa: boolean
  coding: boolean
  applications: boolean
  roadmap: boolean
  resume: false
}

export interface AnalyticsDashboard {
  scope: 'student' | 'college'
  range: InterviewAnalyticsRange
  generatedAt: string
  availability: AnalyticsDashboardAvailability
  overview: AnalyticsOverview
  readiness: ReadinessScore
  interviews: InterviewAnalytics
  practice: PracticeAnalytics | null
  dsa: DsaAnalytics | null
  coding: CodingAnalytics | null
  roadmap: RoadmapAnalytics | null
  applications: PlacementAnalytics | null
  recentActivity: AnalyticsActivityItem[]
  notes: string[]
}

export async function getAnalyticsDashboard(
  accessToken: string,
  range: InterviewAnalyticsRange = 'all',
  signal?: AbortSignal,
): Promise<AnalyticsDashboard> {
  return apiRequest<AnalyticsDashboard>(`/api/analytics/dashboard?range=${range}`, {
    accessToken,
    signal,
  })
}

/** Window event a data-writing module fires so a mounted dashboard re-fetches. */
export const ANALYTICS_UPDATED_EVENT = 'mockmate:analytics-updated'

/**
 * Ask the analytics dashboard to re-fetch. Called after practice completion,
 * DSA submission, interview end and job application. Cheap and idempotent: with
 * no dashboard mounted there is simply no listener.
 */
export function notifyAnalyticsUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ANALYTICS_UPDATED_EVENT))
}
