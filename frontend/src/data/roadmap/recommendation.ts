import type { RoadmapDomainId } from './types'

// Basic, explainable recommendation. This is deliberately a small rule-based
// helper, not an AI-generated plan: branch keywords provide the first signal,
// and recorded interview domains can add a second focus area.

export interface InterviewDomainSignal {
  key: string
  sessions: number
  evaluatedAnswers: number
  averageScore: number | null
}

export interface RoadmapRecommendation {
  domainIds: RoadmapDomainId[]
  reason: string
}

const INTERVIEW_DOMAIN_MAP: Record<string, RoadmapDomainId> = {
  technical: 'it',
  coding: 'it',
  mechanical: 'mechanical',
  electronics: 'electronics',
  management: 'management',
  hr: 'hr',
  aptitude: 'aptitude',
}

function normalized(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function branchDomain(branch: string | null | undefined): RoadmapDomainId | null {
  const value = normalized(branch)
  if (!value) return null

  if (
    value.includes('computer science') ||
    value.includes('information technology') ||
    value.includes('data science') ||
    value.includes('software') ||
    value.includes('computer')
  ) {
    return 'it'
  }

  if (
    value.includes('mechanic') ||
    value.includes('mechatronic') ||
    value.includes('automobile') ||
    value.includes('manufacturing')
  ) {
    return 'mechanical'
  }

  if (
    value.includes('electronic') ||
    value.includes('electrical') ||
    value.includes('instrumentation') ||
    value === 'ece' ||
    value === 'eee'
  ) {
    return 'electronics'
  }

  if (
    value.includes('management') ||
    value.includes('business') ||
    value.includes('commerce') ||
    value.includes('finance') ||
    value.includes('marketing') ||
    value === 'mba'
  ) {
    return 'management'
  }

  if (
    value.includes('human resource') ||
    value === 'hr' ||
    value.includes('psychology') ||
    value.includes('organizational behavior')
  ) {
    return 'hr'
  }

  // Civil and unknown branches are intentionally not mapped to a specialist
  // track. The caller falls back to universally useful domains.
  return null
}

function weakestInterviewDomain(
  groups: InterviewDomainSignal[],
): RoadmapDomainId | null {
  let weakest: { domainId: RoadmapDomainId; score: number; evidence: number } | null = null

  for (const group of groups) {
    const domainId = INTERVIEW_DOMAIN_MAP[group.key.toLowerCase()]
    if (!domainId || group.evaluatedAnswers <= 0 || group.averageScore === null) continue

    if (
      !weakest ||
      group.averageScore < weakest.score ||
      (group.averageScore === weakest.score && group.evaluatedAnswers > weakest.evidence)
    ) {
      weakest = {
        domainId,
        score: group.averageScore,
        evidence: group.evaluatedAnswers,
      }
    }
  }

  return weakest?.domainId ?? null
}

export function recommendRoadmapDomains(
  branch: string | null | undefined,
  interviewGroups: InterviewDomainSignal[] = [],
): RoadmapRecommendation {
  const fromBranch = branchDomain(branch)
  const fromInterviews = weakestInterviewDomain(interviewGroups)

  const domainIds: RoadmapDomainId[] = []
  if (fromBranch) domainIds.push(fromBranch)
  if (fromInterviews && !domainIds.includes(fromInterviews)) domainIds.push(fromInterviews)

  if (domainIds.length > 0) {
    const hasInterviewSignal = Boolean(fromInterviews && domainIds.includes(fromInterviews))
    const reasonParts: string[] = []
    if (fromBranch) reasonParts.push(`your branch (${(branch ?? '').trim()})`)
    if (hasInterviewSignal) reasonParts.push('your recorded interview domains')
    return {
      domainIds,
      reason: `Based on ${reasonParts.join(' and ')}. These are starting suggestions, not a fixed plan.`,
    }
  }

  return {
    domainIds: ['aptitude', 'hr'],
    reason:
      'Aptitude and behavioral practice are useful starting points for every branch. All six tracks remain available.',
  }
}
