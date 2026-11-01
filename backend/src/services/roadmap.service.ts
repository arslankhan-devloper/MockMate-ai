import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoadmapDomainId } from '../utils/roadmapValidation.js'
import {
  isAllowedRoadmapResourceUrl,
  type RoadmapPlan,
  type RoadmapPlanContext,
  type RoadmapPlanRequest,
} from '../utils/roadmapPlanValidation.js'
import type {
  GeneratedTopicResource,
  RoadmapTopicResource,
  RoadmapTopicResourceType,
} from '../utils/roadmapResourcesValidation.js'
import {
  buildInterviewAnalytics,
  fetchAnalyticsEvaluations,
  fetchAnalyticsSessions,
  type AnalyticsEvaluationRow,
  type AnalyticsSessionRow,
} from './interviewAnalytics.service.js'

// Roadmap completion and AI plan persistence.
//
// Completion rows and the latest generated plan both live in the database.
// Every helper filters by `student_id` from the verified auth context, and RLS
// independently enforces the same ownership.

export const ROADMAP_PROGRESS_COLUMNS = 'domain_id, topic_id, completed_at'
export const ROADMAP_PLAN_COLUMNS = 'plan, generated_at'

export interface RoadmapProgressRow {
  domain_id: string
  topic_id: string
  completed_at: string
}

export interface RoadmapProgressEntry {
  domainId: string
  topicId: string
  completedAt: string
}

export function mapRoadmapProgressRow(row: RoadmapProgressRow): RoadmapProgressEntry {
  return {
    domainId: row.domain_id,
    topicId: row.topic_id,
    completedAt: row.completed_at,
  }
}

export async function listRoadmapProgress(client: SupabaseClient, studentId: string) {
  return client
    .from('roadmap_topic_progress')
    .select(ROADMAP_PROGRESS_COLUMNS)
    .eq('student_id', studentId)
    .order('domain_id', { ascending: true })
    .order('topic_id', { ascending: true })
}

// An upsert with the composite primary key is idempotent: repeating a completed
// request leaves the original completion timestamp untouched.
export async function completeRoadmapTopic(
  client: SupabaseClient,
  studentId: string,
  domainId: RoadmapDomainId,
  topicId: string,
) {
  return client
    .from('roadmap_topic_progress')
    .upsert(
      {
        student_id: studentId,
        domain_id: domainId,
        topic_id: topicId,
      },
      {
        onConflict: 'student_id,domain_id,topic_id',
        ignoreDuplicates: true,
      },
    )
}

// Deleting by all three key parts is idempotent: an already-removed topic is a
// successful no-op rather than an error.
export async function uncompleteRoadmapTopic(
  client: SupabaseClient,
  studentId: string,
  domainId: RoadmapDomainId,
  topicId: string,
) {
  return client
    .from('roadmap_topic_progress')
    .delete()
    .eq('student_id', studentId)
    .eq('domain_id', domainId)
    .eq('topic_id', topicId)
}

export interface RoadmapPlanRow {
  plan: unknown
  generated_at: string
}

export async function getRoadmapPlan(client: SupabaseClient, studentId: string) {
  return client
    .from('roadmap_ai_plans')
    .select(ROADMAP_PLAN_COLUMNS)
    .eq('student_id', studentId)
    .maybeSingle()
}

export async function saveRoadmapPlan(
  client: SupabaseClient,
  studentId: string,
  plan: RoadmapPlan,
  generatedAt: string,
) {
  return client
    .from('roadmap_ai_plans')
    .upsert(
      {
        student_id: studentId,
        plan,
        generated_at: generatedAt,
        updated_at: generatedAt,
      },
      { onConflict: 'student_id' },
    )
}

export const ROADMAP_TOPIC_RESOURCE_COLUMNS =
  'domain_id, topic_id, resource_type, title, description, provider, url, is_verified, generated_at'

export interface RoadmapTopicResourceRow {
  domain_id: string
  topic_id: string
  resource_type: RoadmapTopicResourceType
  title: string
  description: string
  provider: string
  url: string
  is_verified: boolean
  generated_at: string
}

export function mapRoadmapTopicResourceRow(
  row: RoadmapTopicResourceRow,
): RoadmapTopicResource {
  return {
    domainId: row.domain_id as RoadmapTopicResource['domainId'],
    topicId: row.topic_id,
    type: row.resource_type,
    title: row.title,
    description: row.description,
    provider: row.provider,
    url: row.url,
    // A database flag alone is not enough: re-check the origin so an invalid or
    // manually altered stored URL can never be presented as verified.
    verified: row.is_verified === true && isAllowedRoadmapResourceUrl(row.url),
    generatedAt: row.generated_at,
  }
}

export async function listRoadmapTopicResources(
  client: SupabaseClient,
  studentId: string,
  domainId: string,
  topicId: string,
) {
  return client
    .from('roadmap_topic_resources')
    .select(ROADMAP_TOPIC_RESOURCE_COLUMNS)
    .eq('student_id', studentId)
    .eq('domain_id', domainId)
    .eq('topic_id', topicId)
    .order('resource_type', { ascending: true })
}

// The composite primary key makes repeated generation idempotent. Re-running
// upserts the four existing type slots instead of appending duplicate rows.
export async function saveRoadmapTopicResources(
  client: SupabaseClient,
  studentId: string,
  domainId: string,
  topicId: string,
  resources: GeneratedTopicResource[],
  generatedAt: string,
) {
  const rows = resources.map((resource) => ({
    student_id: studentId,
    domain_id: domainId,
    topic_id: topicId,
    resource_type: resource.type,
    title: resource.title,
    description: resource.description,
    provider: resource.provider,
    url: resource.url,
    is_verified: resource.verified,
    generated_at: generatedAt,
    updated_at: generatedAt,
  }))

  return client
    .from('roadmap_topic_resources')
    .upsert(rows, {
      onConflict: 'student_id,domain_id,topic_id,resource_type',
    })
}

interface LatestSessionRow {
  target_role: string | null
}

// Gather only the context the plan needs. Resume skills come from the browser
// (the resume report is not persisted server-side); every other signal is read
// through the caller's RLS-scoped client, so another student's data is
// unreachable.
export async function buildRoadmapPlanContext(
  client: SupabaseClient,
  studentId: string,
  request: RoadmapPlanRequest,
): Promise<RoadmapPlanContext> {
  const profileResult = await client
    .from('profiles')
    .select('branch, grad_year')
    .eq('id', studentId)
    .maybeSingle()

  const latestSessionResult = await client
    .from('interview_sessions')
    .select('target_role')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const [sessionsResult, evaluationsResult] = await Promise.all([
    fetchAnalyticsSessions(client, { studentId, since: null }),
    fetchAnalyticsEvaluations(client),
  ])

  const profile = (profileResult.data ?? null) as {
    branch?: string | null
    grad_year?: string | null
  } | null
  const latestSession = (latestSessionResult.data ?? null) as LatestSessionRow | null

  const analytics = buildInterviewAnalytics({
    scope: 'student',
    range: 'all',
    generatedAt: new Date().toISOString(),
    sessionsAvailable: !sessionsResult.error,
    sessions: sessionsResult.error ? [] : (sessionsResult.rows as AnalyticsSessionRow[]),
    turnsAvailable: false,
    topicsAvailable: false,
    turns: [],
    evaluationsAvailable: !evaluationsResult.error,
    evaluations: evaluationsResult.error
      ? []
      : (evaluationsResult.rows as AnalyticsEvaluationRow[]),
    applicationsAvailable: false,
    applications: [],
  })

  const resume = request.resumeContext
  const latestRole =
    typeof latestSession?.target_role === 'string' ? latestSession.target_role.trim() : ''

  return {
    ...request,
    branch: typeof profile?.branch === 'string' ? profile.branch.trim() || null : null,
    gradYear: typeof profile?.grad_year === 'string' ? profile.grad_year.trim() || null : null,
    targetRole: resume?.targetRole || resume?.jobTitle || latestRole || null,
    interviewDomains: analytics.byDomain
      .filter((group) => group.evaluatedAnswers > 0)
      .slice(0, 5)
      .map((group) => ({
        key: group.key,
        sessions: group.sessions,
        evaluatedAnswers: group.evaluatedAnswers,
        averageScore: group.averageScore,
      })),
  }
}
