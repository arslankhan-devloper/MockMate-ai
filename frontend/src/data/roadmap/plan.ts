import {
  getRoadmapDomain,
  roadmapDomains,
  type RoadmapDomainId,
  type RoadmapResource,
} from './index.ts'
import { progressKey } from './progress.ts'
import {
  recommendRoadmapDomains,
  type InterviewDomainSignal,
} from './recommendation.ts'

export type RoadmapResourceType =
  | 'Documentation'
  | 'Course'
  | 'Video'
  | 'Practice'
  | 'Article'

export interface RoadmapPlanResource {
  title: string
  description: string
  type: RoadmapResourceType
  provider: string
  url: string
}

export interface RoadmapPlanTask {
  id: string
  domainId: RoadmapDomainId
  title: string
  description: string
  estimatedMinutes: number
  resources: RoadmapPlanResource[]
  /**
   * Set in the browser when a task is matched to one of the curated catalog
   * topics. The API does not need to store this derived mapping.
   */
  catalogTopicId?: string | null
}

export interface RoadmapPlan {
  version?: 1
  source: 'ai' | 'fallback'
  title: string
  summary: string
  focusAreas: string[]
  tasks: RoadmapPlanTask[]
}

export interface RoadmapResumeContext {
  targetRole: string | null
  jobTitle: string | null
  skills: string[]
}

export interface RoadmapPlanProgress {
  completed: number
  total: number
  percent: number
}

interface FallbackProvider {
  label: string
  baseUrl: string
  queryParam: string
  defaultType: RoadmapResourceType
}

const FALLBACK_PROVIDERS = {
  mdn: {
    label: 'MDN Web Docs',
    baseUrl: 'https://developer.mozilla.org/en-US/search',
    queryParam: 'q',
    defaultType: 'Documentation',
  },
  freecodecamp: {
    label: 'freeCodeCamp',
    baseUrl: 'https://www.freecodecamp.org/news/search/',
    queryParam: 'query',
    defaultType: 'Article',
  },
  microsoftlearn: {
    label: 'Microsoft Learn',
    baseUrl: 'https://learn.microsoft.com/en-us/search/',
    queryParam: 'terms',
    defaultType: 'Documentation',
  },
  mitocw: {
    label: 'MIT OpenCourseWare',
    baseUrl: 'https://ocw.mit.edu/search/',
    queryParam: 'q',
    defaultType: 'Course',
  },
  khanacademy: {
    label: 'Khan Academy',
    baseUrl: 'https://www.khanacademy.org/search',
    queryParam: 'page_search_query',
    defaultType: 'Practice',
  },
  coursera: {
    label: 'Coursera',
    baseUrl: 'https://www.coursera.org/search',
    queryParam: 'query',
    defaultType: 'Course',
  },
  edx: {
    label: 'edX',
    baseUrl: 'https://www.edx.org/search',
    queryParam: 'q',
    defaultType: 'Course',
  },
  youtube: {
    label: 'YouTube',
    baseUrl: 'https://www.youtube.com/results',
    queryParam: 'search_query',
    defaultType: 'Video',
  },
} as const satisfies Record<string, FallbackProvider>

type FallbackProviderKey = keyof typeof FALLBACK_PROVIDERS

const DOMAIN_PROVIDER: Record<RoadmapDomainId, FallbackProviderKey> = {
  it: 'freecodecamp',
  mechanical: 'mitocw',
  electronics: 'edx',
  management: 'coursera',
  hr: 'coursera',
  aptitude: 'khanacademy',
}

const ALLOWED_RESOURCE_ORIGINS = new Set(
  Object.values(FALLBACK_PROVIDERS).map((provider) => new URL(provider.baseUrl).origin),
)

export function isSafeRoadmapResourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ALLOWED_RESOURCE_ORIGINS.has(url.origin)
    )
  } catch {
    return false
  }
}

function buildProviderUrl(providerKey: FallbackProviderKey, query: string): string {
  const provider = FALLBACK_PROVIDERS[providerKey]
  const url = new URL(provider.baseUrl)
  url.searchParams.set(provider.queryParam, query)
  return url.toString()
}

function fallbackResource(
  providerKey: FallbackProviderKey,
  topicTitle: string,
  topicSummary: string,
): RoadmapPlanResource {
  const provider = FALLBACK_PROVIDERS[providerKey]
  const query = `${topicTitle} ${provider.label}`.trim()
  return {
    title: `${provider.label}: ${topicTitle}`,
    description: `Explore ${provider.defaultType.toLowerCase()} material for this topic: ${topicSummary}`,
    type: provider.defaultType,
    provider: provider.label,
    url: buildProviderUrl(providerKey, query),
  }
}

function topicResources(
  topicTitle: string,
  topicSummary: string,
  domainId: RoadmapDomainId,
  resources: RoadmapResource[] | undefined,
): RoadmapPlanResource[] {
  if (resources && resources.length > 0) {
    return resources.map((resource) => ({
      title: resource.title,
      description: `Further reading for ${topicTitle}.`,
      type: 'Article',
      provider: resource.provider,
      url: resource.url,
    }))
  }
  return [fallbackResource(DOMAIN_PROVIDER[domainId], topicTitle, topicSummary)]
}

export function buildFallbackRoadmapPlan(
  branch: string | null | undefined,
  interviewGroups: InterviewDomainSignal[] = [],
): RoadmapPlan {
  const recommendation = recommendRoadmapDomains(branch, interviewGroups)
  const tasks: RoadmapPlanTask[] = []
  const usedIds = new Set<string>()

  const addDomainTopics = (domainId: RoadmapDomainId) => {
    const domain = getRoadmapDomain(domainId)
    for (const topic of domain.topics) {
      if (tasks.length >= 6) return
      if (usedIds.has(topic.id)) continue
      usedIds.add(topic.id)
      tasks.push({
        id: topic.id,
        domainId,
        title: topic.title,
        description: topic.summary,
        estimatedMinutes: topic.estimatedMinutes,
        resources: topicResources(topic.title, topic.summary, domainId, topic.resources),
        catalogTopicId: topic.id,
      })
    }
  }

  for (const domainId of recommendation.domainIds) addDomainTopics(domainId)
  for (const domain of roadmapDomains) {
    if (tasks.length >= 6) break
    addDomainTopics(domain.id)
  }

  const focusAreas: string[] = []
  for (const task of tasks) {
    const label = getRoadmapDomain(task.domainId).shortLabel
    if (!focusAreas.includes(label)) focusAreas.push(label)
  }

  return {
    source: 'fallback',
    title: 'Your starter learning roadmap',
    summary:
      'A branch-aware starter checklist. Generate a personalized plan to add interview-specific priorities and fresh study materials.',
    focusAreas,
    tasks,
  }
}

// Matched tasks use the curated topic ID as their progress identity. That keeps
// completion attached to the study material when an AI plan is regenerated.
// Unmatched tasks fall back to their plan task ID.
export function planTaskTopicId(task: RoadmapPlanTask): string {
  const catalogTopicId = task.catalogTopicId?.trim()
  return catalogTopicId || task.id
}

export function planTaskProgressKey(task: RoadmapPlanTask): string {
  return progressKey(task.domainId, planTaskTopicId(task))
}

// Pick a stable selection: keep the current task when it still exists, otherwise
// select the first incomplete task, then the first task.
export function resolveSelectedTaskId(
  tasks: readonly RoadmapPlanTask[],
  currentId: string | null,
  completedKeys: ReadonlySet<string>,
): string | null {
  if (currentId && tasks.some((task) => task.id === currentId)) return currentId
  const next = tasks.find((task) => !completedKeys.has(planTaskProgressKey(task)))
  return next?.id ?? tasks[0]?.id ?? null
}

// Saved completions that do not belong to the current checklist are reported,
// never removed. Regeneration must not delete a student's historical progress.
export function staleProgressKeys(
  plan: RoadmapPlan,
  completedKeys: ReadonlySet<string>,
): string[] {
  const current = new Set(plan.tasks.map((task) => planTaskProgressKey(task)))
  return [...completedKeys].filter((key) => !current.has(key))
}

export function planProgress(
  plan: RoadmapPlan,
  completedKeys: ReadonlySet<string>,
): RoadmapPlanProgress {
  const completed = plan.tasks.filter((task) =>
    completedKeys.has(planTaskProgressKey(task)),
  ).length
  const total = plan.tasks.length
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}
