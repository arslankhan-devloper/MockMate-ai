import type { Request, Response } from 'express'
import { sendError } from '../utils/http.js'
import {
  buildApplicationStats,
  buildInterviewAnalytics,
  fetchAnalyticsApplications,
  fetchAnalyticsEvaluations,
  fetchAnalyticsSessions,
  fetchAnalyticsTurns,
  isMissingRelation,
  normalizeAnalyticsRange,
  rangeSince,
  type AnalyticsApplicationRow,
  type AnalyticsEvaluationRow,
  type AnalyticsRangeKey,
  type AnalyticsSessionRow,
  type AnalyticsTurnRow,
} from '../services/interviewAnalytics.service.js'
import {
  buildAnalyticsDashboard,
  buildCodingAnalytics,
  buildDsaAnalytics,
  buildPlacementAnalytics,
  buildPracticeAnalytics,
  buildRoadmapAnalytics,
  fetchCodingAttempts,
  fetchPracticeAnswers,
  fetchPracticeQuestionMeta,
  fetchPracticeSessions,
  fetchProblemQuestionMeta,
  fetchProblemSubmissions,
  fetchRoadmapPlanSummary,
  fetchRoadmapProgress,
  type AnalyticsDashboardResponse,
  type CodingAnalytics,
  type DsaAnalytics,
  type PlacementAnalytics,
  type PracticeAnalytics,
  type RoadmapAnalytics,
  type StudentScope,
} from '../services/analyticsDashboard.service.js'

// GET /api/analytics/dashboard
//
// One request returns every analytics module the caller is allowed to see. The
// scope comes only from the verified session (`req.auth`) — a student is pinned
// to their own rows, an officer to their own college. No student id, college id
// or role is ever read from the query string or body.
//
// Interview aggregation is reused from the existing analytics service. The
// remaining modules are aggregated server-side from aggregate-safe columns;
// answer text, transcripts, source code and per-answer feedback never leave the
// database. Optional tables degrade to "unavailable" instead of failing the
// whole dashboard.

interface StudentModuleBundle {
  practice: PracticeAnalytics | null
  dsa: DsaAnalytics | null
  coding: CodingAnalytics | null
  roadmap: RoadmapAnalytics | null
}

async function loadStudentModules(
  client: NonNullable<Request['supabase']>,
  scope: StudentScope,
): Promise<StudentModuleBundle> {
  const [practiceSessions, problemSubmissions, codingAttempts, roadmapProgress, roadmapPlan] =
    await Promise.all([
      fetchPracticeSessions(client, scope).catch(() => ({ available: false, rows: [] })),
      fetchProblemSubmissions(client, scope).catch(() => ({ available: false, rows: [] })),
      fetchCodingAttempts(client, scope).catch(() => ({ available: false, rows: [] })),
      fetchRoadmapProgress(client, scope).catch(() => ({ available: false, rows: [] })),
      fetchRoadmapPlanSummary(client, scope).catch(() => null),
    ])

  const sessionIds = practiceSessions.rows.map((row) => row.id)
  const [practiceAnswers, problemQuestions] = await Promise.all([
    practiceSessions.available
      ? fetchPracticeAnswers(client, scope, sessionIds).catch(() => ({ available: false, rows: [] }))
      : Promise.resolve({ available: false, rows: [] }),
    problemSubmissions.rows.length > 0
      ? fetchProblemQuestionMeta(
          client,
          problemSubmissions.rows.map((row) => row.question_id),
        ).catch(() => [])
      : Promise.resolve([]),
  ])

  const practiceQuestions =
    practiceAnswers.rows.length > 0
      ? await fetchPracticeQuestionMeta(
          client,
          practiceAnswers.rows.map((row) => row.question_id),
        ).catch(() => [])
      : []

  return {
    practice: buildPracticeAnalytics({
      available: practiceSessions.available,
      answersAvailable: practiceAnswers.available,
      sessions: practiceSessions.rows,
      answers: practiceAnswers.rows,
      questions: practiceQuestions,
      range: scope.range,
    }),
    dsa: buildDsaAnalytics({
      available: problemSubmissions.available,
      submissions: problemSubmissions.rows,
      questions: problemQuestions,
      range: scope.range,
    }),
    coding: buildCodingAnalytics({
      available: codingAttempts.available,
      attempts: codingAttempts.rows,
      range: scope.range,
    }),
    roadmap: buildRoadmapAnalytics({
      available: roadmapProgress.available,
      progress: roadmapProgress.rows,
      plan: roadmapPlan,
      since: scope.since,
    }),
  }
}

export async function dashboardHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const range: AnalyticsRangeKey | null = normalizeAnalyticsRange(req.query.range)
  if (!range) {
    sendError(res, 400, 'invalid_range', 'The requested time range is not supported.')
    return
  }

  const scope = auth.role === 'placement-officer' ? 'college' : 'student'
  if (scope === 'college' && !auth.collegeId) {
    sendError(res, 403, 'no_college', 'No college is assigned to this account.')
    return
  }

  const generatedAt = new Date().toISOString()
  const since = rangeSince(range)

  // 1. Interview aggregation — same fetchers and rules as /api/interviews/analytics.
  const sessionsResult = await fetchAnalyticsSessions(client, {
    studentId: scope === 'student' ? auth.userId : null,
    since,
  })
  const sessionsMissing = isMissingRelation(sessionsResult.error)
  if (sessionsResult.error && !sessionsMissing) {
    sendError(res, 500, 'analytics_read_failed', 'Could not load analytics.')
    return
  }

  let turnsAvailable = false
  let topicsAvailable = false
  let turns: AnalyticsTurnRow[] = []
  if (scope === 'student' && !sessionsMissing) {
    const turnsResult = await fetchAnalyticsTurns(client)
    if (turnsResult.error) {
      if (!isMissingRelation(turnsResult.error)) {
        sendError(res, 500, 'analytics_read_failed', 'Could not load analytics.')
        return
      }
    } else {
      turnsAvailable = true
      topicsAvailable = turnsResult.topicsAvailable
      turns = turnsResult.rows as AnalyticsTurnRow[]
    }
  }

  let evaluationsAvailable = false
  let evaluations: AnalyticsEvaluationRow[] = []
  if (!sessionsMissing) {
    const evaluationsResult = await fetchAnalyticsEvaluations(client)
    if (evaluationsResult.error) {
      if (!isMissingRelation(evaluationsResult.error)) {
        sendError(res, 500, 'analytics_read_failed', 'Could not load analytics.')
        return
      }
    } else {
      evaluationsAvailable = true
      evaluations = evaluationsResult.rows as AnalyticsEvaluationRow[]
    }
  }

  // 2. Job applications (own rows for a student, own college's jobs for an officer).
  let applicationsAvailable = false
  let applications: AnalyticsApplicationRow[] = []
  const applicationsResult = await fetchAnalyticsApplications(client, {
    studentId: scope === 'student' ? auth.userId : null,
    collegeId: scope === 'college' ? auth.collegeId : null,
    since,
  })
  if (applicationsResult.error) {
    if (!isMissingRelation(applicationsResult.error)) {
      sendError(res, 500, 'analytics_read_failed', 'Could not load analytics.')
      return
    }
  } else {
    applicationsAvailable = true
    applications = applicationsResult.rows as AnalyticsApplicationRow[]
  }

  const applicationStats = buildApplicationStats(applications)
  const placement: PlacementAnalytics | null = buildPlacementAnalytics({
    available: applicationsAvailable,
    applications,
    range,
    stats: applicationStats,
  })

  const interviews = buildInterviewAnalytics({
    scope,
    range,
    generatedAt,
    sessionsAvailable: !sessionsMissing,
    sessions: sessionsMissing ? [] : (sessionsResult.rows as AnalyticsSessionRow[]),
    turnsAvailable,
    topicsAvailable,
    turns,
    evaluationsAvailable,
    evaluations,
    applicationsAvailable,
    applications,
  })

  // 3. Student-owned modules. A college scope never reads another student's
  // practice/DSA/coding/roadmap rows — those RLS policies are student-only.
  let modules: StudentModuleBundle = {
    practice: null,
    dsa: null,
    coding: null,
    roadmap: null,
  }
  if (scope === 'student') {
    try {
      modules = await loadStudentModules(client, {
        studentId: auth.userId,
        since,
        range,
      })
    } catch (err) {
      // A broken optional module must not take down the dashboard.
      console.error('[mockmate-backend] analytics module read failed:', err)
    }
  }

  const dashboard: AnalyticsDashboardResponse = buildAnalyticsDashboard({
    scope,
    range,
    generatedAt,
    since,
    interviews,
    practice: modules.practice,
    dsa: modules.dsa,
    coding: modules.coding,
    roadmap: modules.roadmap,
    applications: placement,
    activity: {
      interviews: interviews.recentSessions,
      practice: modules.practice,
      dsa: modules.dsa,
      coding: modules.coding,
      applications: scope === 'student' ? applications : [],
    },
  })

  // Aggregates are per-user and change as soon as a session/practice answer is
  // saved, so they must never be cached by a shared proxy or served stale.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Vary', 'Authorization')
  res.status(200).json(dashboard)
}
