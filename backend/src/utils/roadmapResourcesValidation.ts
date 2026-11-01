// Validation and normalisation for AI-generated topic learning resources.
//
// Every roadmap topic supports exactly four resource types. The model chooses a
// provider from a type-specific allowlist plus a search query; it never supplies
// a URL. The server constructs the link, so an AI response cannot introduce an
// unverified host or an unsafe scheme.

import {
  ROADMAP_DOMAIN_LABELS,
  ROADMAP_RESOURCE_PROVIDERS,
  buildRoadmapResourceUrl,
  isAllowedRoadmapResourceUrl,
  type RoadmapResourceProviderKey,
} from './roadmapPlanValidation.js'
import {
  validateRoadmapTopicParams,
  type RoadmapDomainId,
} from './roadmapValidation.js'

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

export interface RoadmapCatalogTopic {
  id: string
  title: string
}

export const ROADMAP_TOPIC_CATALOG: Record<
  RoadmapDomainId,
  readonly RoadmapCatalogTopic[]
> = {
  it: [
    { id: 'complexity-and-data-structures', title: 'Complexity and core data structures' },
    { id: 'algorithms-and-problem-solving', title: 'Algorithms and problem-solving patterns' },
    { id: 'databases-and-apis', title: 'Databases, transactions, and APIs' },
    { id: 'operating-systems-and-networks', title: 'Operating systems and networks' },
    { id: 'system-design-foundations', title: 'System design foundations' },
  ],
  mechanical: [
    { id: 'thermodynamics', title: 'Thermodynamics and energy systems' },
    { id: 'fluid-mechanics', title: 'Fluid mechanics and piping' },
    { id: 'machine-design', title: 'Machine design and fatigue' },
    { id: 'manufacturing-and-materials', title: 'Manufacturing processes and material selection' },
  ],
  electronics: [
    { id: 'circuit-analysis', title: 'Circuit analysis and power' },
    { id: 'digital-electronics', title: 'Digital electronics and timing' },
    { id: 'embedded-systems', title: 'Embedded systems and firmware' },
    { id: 'control-systems', title: 'Feedback and control systems' },
  ],
  management: [
    { id: 'prioritisation-and-tradeoffs', title: 'Prioritisation and trade-offs' },
    { id: 'metrics-and-business-cases', title: 'Metrics and business cases' },
    { id: 'operations-and-process-improvement', title: 'Operations and process improvement' },
    { id: 'stakeholder-communication', title: 'Stakeholder communication and decisions' },
  ],
  hr: [
    { id: 'star-story-bank', title: 'Building a STAR story bank' },
    { id: 'self-introduction-and-motivation', title: 'Self-introduction and motivation' },
    { id: 'conflict-and-teamwork', title: 'Conflict, teamwork, and influence' },
    { id: 'failure-and-growth', title: 'Failure, feedback, and growth' },
  ],
  aptitude: [
    { id: 'percentages-ratios', title: 'Percentages and ratios' },
    { id: 'time-speed-work', title: 'Time, speed, and work' },
    { id: 'logical-reasoning', title: 'Logical reasoning' },
    { id: 'probability-and-data-interpretation', title: 'Probability and data interpretation' },
  ],
}

// Type-specific provider allowlists keep resource labels honest: a "video" can
// only come from a video provider, and "practice" can only come from practice
// providers. The provider definitions themselves live in one shared allowlist.
export const ROADMAP_TOPIC_RESOURCE_TYPE_PROVIDERS: Record<
  RoadmapTopicResourceType,
  readonly RoadmapResourceProviderKey[]
> = {
  video: ['youtube'],
  roadmap: ['freecodecamp', 'microsoftlearn', 'mitocw', 'coursera', 'edx'],
  docs: ['mdn', 'microsoftlearn', 'freecodecamp', 'mitocw', 'coursera', 'edx'],
  practice: ['khanacademy', 'freecodecamp'],
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

export type GeneratedTopicResource = Omit<
  RoadmapTopicResource,
  'domainId' | 'topicId' | 'generatedAt'
>

export type RoadmapTopicSelection =
  | {
      ok: true
      value: {
        domainId: RoadmapDomainId
        domainLabel: string
        topicId: string
        topicTitle: string
      }
    }
  | {
      ok: false
      message: string
      fields: Record<string, string>
    }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, maxLength) : null
}

export function resolveRoadmapTopic(
  rawDomainId: unknown,
  rawTopicId: unknown,
): RoadmapTopicSelection {
  const params = validateRoadmapTopicParams(rawDomainId, rawTopicId)
  if (!params.ok) return params

  const { domainId, topicId } = params.value
  const topic = ROADMAP_TOPIC_CATALOG[domainId].find((entry) => entry.id === topicId)
  if (!topic) {
    return {
      ok: false,
      message: 'One or more roadmap parameters are invalid.',
      fields: { topicId: 'Topic is not part of the curated roadmap catalog.' },
    }
  }

  return {
    ok: true,
    value: {
      domainId,
      domainLabel: ROADMAP_DOMAIN_LABELS[domainId],
      topicId,
      topicTitle: topic.title,
    },
  }
}

function normalizeResourceType(value: unknown): RoadmapTopicResourceType | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return (ROADMAP_TOPIC_RESOURCE_TYPES as readonly string[]).includes(normalized)
    ? (normalized as RoadmapTopicResourceType)
    : null
}

function normalizeGeneratedResource(
  raw: unknown,
  topic: { domainId: RoadmapDomainId; title: string },
  type: RoadmapTopicResourceType,
): GeneratedTopicResource | null {
  if (!isPlainObject(raw)) return null

  const providerKey =
    typeof raw.providerKey === 'string' ? raw.providerKey.trim().toLowerCase() : ''
  const allowedProviders = ROADMAP_TOPIC_RESOURCE_TYPE_PROVIDERS[type] as readonly string[]
  if (!allowedProviders.includes(providerKey)) return null

  const key = providerKey as RoadmapResourceProviderKey
  const provider = ROADMAP_RESOURCE_PROVIDERS[key]
  const query =
    cleanText(raw.searchQuery, 120) ??
    `${topic.title} ${ROADMAP_TOPIC_RESOURCE_TYPE_LABELS[type]}`.trim()

  const title =
    cleanText(raw.title, 160) ??
    `${provider.label}: ${ROADMAP_TOPIC_RESOURCE_TYPE_LABELS[type]} for ${topic.title}`

  const description =
    cleanText(raw.description, 300) ??
    `A ${ROADMAP_TOPIC_RESOURCE_TYPE_LABELS[type].toLowerCase()} suggestion for ${topic.title} on ${provider.label}.`

  const url = buildRoadmapResourceUrl(key, query)
  if (!isAllowedRoadmapResourceUrl(url)) return null

  return {
    type,
    title,
    description,
    provider: provider.label,
    url,
    // The URL was built by the server from an allowlisted HTTPS provider. We
    // never accept a model-supplied URL, even if one is present in the payload.
    verified: true,
  }
}

// Convert the model's raw payload into exactly four resources. Any missing,
// duplicated, unsupported or mismatched type invalidates the whole response, so
// a partial result is never stored as if it were complete.
export function normalizeGeneratedTopicResources(
  raw: unknown,
  topic: { domainId: RoadmapDomainId; title: string },
): GeneratedTopicResource[] | null {
  if (!isPlainObject(raw) || !Array.isArray(raw.resources)) return null

  const byType = new Map<RoadmapTopicResourceType, GeneratedTopicResource>()

  for (const candidate of raw.resources) {
    if (!isPlainObject(candidate)) continue
    const type = normalizeResourceType(candidate.resourceType ?? candidate.type)
    if (!type || byType.has(type)) continue
    const resource = normalizeGeneratedResource(candidate, topic, type)
    if (resource) byType.set(type, resource)
  }

  if (byType.size !== ROADMAP_TOPIC_RESOURCE_TYPES.length) return null

  return ROADMAP_TOPIC_RESOURCE_TYPES.map((type) => byType.get(type)!).map((resource) => ({
    ...resource,
  }))
}
