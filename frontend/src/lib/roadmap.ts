import { apiRequest } from './api'
import type { RoadmapDomainId } from '../data/roadmap/types'
import type { RoadmapPlan, RoadmapResumeContext } from '../data/roadmap/plan'
import type { RoadmapTopicResource } from '../data/roadmap/resources'

// Typed client for the student-only roadmap API.
//
//   GET /api/roadmap/progress
//   PUT /api/roadmap/progress/:domainId/:topicId  { completed: boolean }
//   GET /api/roadmap/resources/:domainId/:topicId
//   POST /api/roadmap/resources/:domainId/:topicId
//   GET /api/roadmap/plan
//   POST /api/roadmap/plan                         { resumeContext? }
//
// Completion rows, topic resources and the latest generated plan are stored on
// the server, and the backend derives the student from the verified token.

export interface RoadmapProgressEntry {
  domainId: RoadmapDomainId
  topicId: string
  completedAt: string
}

export interface RoadmapProgressResponse {
  progress: RoadmapProgressEntry[]
}

export interface SetRoadmapProgressResponse {
  domainId: RoadmapDomainId
  topicId: string
  completed: boolean
}

export function getRoadmapProgress(
  accessToken: string,
  signal?: AbortSignal,
): Promise<RoadmapProgressResponse> {
  return apiRequest<RoadmapProgressResponse>('/api/roadmap/progress', {
    accessToken,
    signal,
  })
}

export function setRoadmapTopicCompletion(
  accessToken: string,
  domainId: RoadmapDomainId,
  topicId: string,
  completed: boolean,
): Promise<SetRoadmapProgressResponse> {
  return apiRequest<SetRoadmapProgressResponse>(
    `/api/roadmap/progress/${encodeURIComponent(domainId)}/${encodeURIComponent(topicId)}`,
    {
      method: 'PUT',
      accessToken,
      body: { completed },
    },
  )
}

export interface RoadmapTopicResourcesResponse {
  domainId: RoadmapDomainId
  topicId: string
  resources: RoadmapTopicResource[]
  generatedAt: string | null
  storageAvailable: boolean
}

export interface GenerateRoadmapTopicResourcesResponse {
  domainId: RoadmapDomainId
  topicId: string
  resources: RoadmapTopicResource[]
  generatedAt: string
  persisted: boolean
  storageAvailable: boolean
}

export function getRoadmapTopicResources(
  accessToken: string,
  domainId: RoadmapDomainId,
  topicId: string,
  signal?: AbortSignal,
): Promise<RoadmapTopicResourcesResponse> {
  return apiRequest<RoadmapTopicResourcesResponse>(
    `/api/roadmap/resources/${encodeURIComponent(domainId)}/${encodeURIComponent(topicId)}`,
    { accessToken, signal },
  )
}

export function generateRoadmapTopicResources(
  accessToken: string,
  domainId: RoadmapDomainId,
  topicId: string,
): Promise<GenerateRoadmapTopicResourcesResponse> {
  return apiRequest<GenerateRoadmapTopicResourcesResponse>(
    `/api/roadmap/resources/${encodeURIComponent(domainId)}/${encodeURIComponent(topicId)}`,
    { method: 'POST', accessToken },
  )
}

export interface RoadmapPlanResponse {
  plan: RoadmapPlan | null
  generatedAt: string | null
  storageAvailable: boolean
}

export interface GenerateRoadmapPlanResponse {
  plan: RoadmapPlan
  generatedAt: string
  persisted: boolean
}

export function getRoadmapPlan(
  accessToken: string,
  signal?: AbortSignal,
): Promise<RoadmapPlanResponse> {
  return apiRequest<RoadmapPlanResponse>('/api/roadmap/plan', {
    accessToken,
    signal,
  })
}

export function generateRoadmapPlan(
  accessToken: string,
  resumeContext: RoadmapResumeContext | null,
): Promise<GenerateRoadmapPlanResponse> {
  return apiRequest<GenerateRoadmapPlanResponse>('/api/roadmap/plan', {
    method: 'POST',
    accessToken,
    body: { resumeContext },
  })
}
