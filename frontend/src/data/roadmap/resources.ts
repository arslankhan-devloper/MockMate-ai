import { ROADMAP_DOMAIN_IDS, type RoadmapDomainId } from './types.ts'
import { isSafeRoadmapResourceUrl } from './plan.ts'

// AI-generated learning resources for one curated roadmap topic. The backend
// builds every URL from its provider allowlist; `verified` is only true when the
// server confirmed that the URL still belongs to an approved provider.

export const ROADMAP_TOPIC_RESOURCE_TYPES = [
  'video',
  'roadmap',
  'docs',
  'practice',
] as const

export type RoadmapTopicResourceType = (typeof ROADMAP_TOPIC_RESOURCE_TYPES)[number]

export const ROADMAP_TOPIC_RESOURCE_TYPE_LABELS: Record<
  RoadmapTopicResourceType,
  string
> = {
  video: 'Video',
  roadmap: 'Roadmap',
  docs: 'Docs & reading',
  practice: 'Practice',
}

export interface RoadmapTopicResource {
  domainId: RoadmapDomainId
  topicId: string
  type: RoadmapTopicResourceType
  title: string
  description: string
  provider: string
  url: string
  verified: boolean
  generatedAt: string | null
}

export interface RoadmapTopicResourceGroup {
  type: RoadmapTopicResourceType
  label: string
  resources: RoadmapTopicResource[]
}

const RESOURCE_TYPES = new Set<string>(ROADMAP_TOPIC_RESOURCE_TYPES)
const DOMAIN_IDS = new Set<string>(ROADMAP_DOMAIN_IDS)
const TOPIC_ID_RE = /^[a-z0-9-]{1,80}$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isVerifiedRoadmapTopicResource(
  resource: RoadmapTopicResource,
): boolean {
  return resource.verified === true && isSafeRoadmapResourceUrl(resource.url)
}

export function groupRoadmapTopicResources(
  resources: readonly RoadmapTopicResource[],
): RoadmapTopicResourceGroup[] {
  return ROADMAP_TOPIC_RESOURCE_TYPES.map((type) => ({
    type,
    label: ROADMAP_TOPIC_RESOURCE_TYPE_LABELS[type],
    resources: resources.filter((resource) => resource.type === type),
  }))
}

// Defensive parsing at the API boundary. Unknown records are ignored rather than
// rendered; a stored URL that is no longer on an approved provider stays visible
// but is never clickable or labelled verified.
export function asRoadmapTopicResources(value: unknown): RoadmapTopicResource[] {
  if (!Array.isArray(value)) return []

  const out: RoadmapTopicResource[] = []
  for (const item of value) {
    if (!isPlainObject(item)) continue
    if (typeof item.domainId !== 'string' || !DOMAIN_IDS.has(item.domainId)) continue
    if (typeof item.topicId !== 'string' || !TOPIC_ID_RE.test(item.topicId)) continue
    if (typeof item.type !== 'string' || !RESOURCE_TYPES.has(item.type)) continue
    if (typeof item.title !== 'string' || !item.title.trim()) continue
    if (typeof item.description !== 'string') continue
    if (typeof item.provider !== 'string' || !item.provider.trim()) continue
    if (typeof item.url !== 'string') continue

    out.push({
      domainId: item.domainId as RoadmapDomainId,
      topicId: item.topicId,
      type: item.type as RoadmapTopicResourceType,
      title: item.title.trim(),
      description: item.description.trim(),
      provider: item.provider.trim(),
      url: item.url,
      verified: item.verified === true,
      generatedAt: typeof item.generatedAt === 'string' ? item.generatedAt : null,
    })
  }

  return out
}
