import { aptitudeDomain } from './aptitude.ts'
import { electronicsDomain } from './electronics.ts'
import { hrDomain } from './hr.ts'
import { itDomain } from './it.ts'
import { managementDomain } from './management.ts'
import { mechanicalDomain } from './mechanical.ts'
import { ROADMAP_DOMAIN_IDS, type RoadmapDomain, type RoadmapDomainId } from './types.ts'

export { ROADMAP_DOMAIN_IDS }
export type {
  QuestionDifficulty,
  RoadmapDomain,
  RoadmapDomainId,
  RoadmapPracticeQuestion,
  RoadmapResource,
  RoadmapTopic,
  RoadmapWorkedExample,
} from './types'

export const roadmapDomains: RoadmapDomain[] = [
  itDomain,
  mechanicalDomain,
  electronicsDomain,
  managementDomain,
  hrDomain,
  aptitudeDomain,
]

const DOMAIN_MAP = new Map<RoadmapDomainId, RoadmapDomain>(
  roadmapDomains.map((domain) => [domain.id, domain]),
)

export function getRoadmapDomain(id: RoadmapDomainId): RoadmapDomain {
  const domain = DOMAIN_MAP.get(id)
  if (!domain) throw new Error(`Unknown roadmap domain: ${id}`)
  return domain
}

export const roadmapTopicCount = roadmapDomains.reduce(
  (total, domain) => total + domain.topics.length,
  0,
)
