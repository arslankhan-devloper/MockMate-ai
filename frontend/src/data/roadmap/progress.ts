import type { RoadmapDomain, RoadmapDomainId } from './types'

export interface ProgressCount {
  completed: number
  total: number
  percent: number
}

export function progressKey(domainId: RoadmapDomainId, topicId: string): string {
  return `${domainId}:${topicId}`
}

export function completedKeySet(
  entries: { domainId: string; topicId: string }[],
): Set<string> {
  return new Set(entries.map((entry) => progressKey(entry.domainId as RoadmapDomainId, entry.topicId)))
}

function percent(completed: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((completed / total) * 100)
}

export function domainProgress(
  domain: RoadmapDomain,
  completedKeys: ReadonlySet<string>,
): ProgressCount {
  const completed = domain.topics.filter((topic) =>
    completedKeys.has(progressKey(domain.id, topic.id)),
  ).length
  return {
    completed,
    total: domain.topics.length,
    percent: percent(completed, domain.topics.length),
  }
}

export function overallProgress(
  domains: RoadmapDomain[],
  completedKeys: ReadonlySet<string>,
): ProgressCount {
  let completed = 0
  let total = 0
  for (const domain of domains) {
    const progress = domainProgress(domain, completedKeys)
    completed += progress.completed
    total += progress.total
  }
  return { completed, total, percent: percent(completed, total) }
}
