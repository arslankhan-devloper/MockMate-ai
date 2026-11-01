// Explainable, local job matching for the dashboard.
//
// This is an initial heuristic, not a prediction model. Each available signal
// contributes at most its configured weight; missing data contributes nothing
// and is never treated as a confirmed mismatch. The dashboard intentionally
// does not display the numeric score.

export type RecommendationSource = 'campus' | 'external'
export type RecommendationSignalKind = 'role' | 'skills' | 'eligibility' | 'location'
export type PreferredWorkMode = 'remote' | 'onsite' | 'hybrid'

export interface RecommendationJob {
  id: string
  source: RecommendationSource
  title: string
  company: string
  location: string
  remote: boolean
  description: string
  employmentType: string | null
  seniority: string | null
  category: string | null
  branches?: string[]
  applyUrl?: string | null
  postedAt?: string | null
}

export interface RecommendationSignals {
  targetRole: string | null
  skills: string[]
  branch: string | null
  preferredLocation?: string | null
  preferredWorkMode?: PreferredWorkMode | null
}

export interface RecommendationAvailability {
  targetRole: boolean
  skills: boolean
  eligibility: boolean
  location: boolean
}

export interface RecommendationReason {
  kind: RecommendationSignalKind
  text: string
}

export interface RecommendedJob {
  job: RecommendationJob
  score: number
  reasons: RecommendationReason[]
  matchedSkills: string[]
}

export interface RecommendationOutcome {
  recommendations: RecommendedJob[]
  availability: RecommendationAvailability
  hasSignals: boolean
}

export const RECOMMENDATION_WEIGHTS = {
  role: 40,
  skills: 35,
  eligibility: 15,
  location: 10,
} as const

const DEFAULT_LIMIT = 4

const ROLE_NOISE = new Set([
  'senior', 'sr', 'junior', 'jr', 'lead', 'staff', 'principal',
  'intern', 'internship', 'trainee', 'graduate', 'entry', 'level',
  'mid', 'remote', 'hybrid', 'onsite',
])

const ROLE_TOKEN_ALIASES: Record<string, string> = {
  developer: 'engineer',
  developers: 'engineer',
  programmer: 'engineer',
}

const SKILL_ALIASES: Record<string, string[]> = {
  'react': ['react'],
  'react js': ['react js', 'react'],
  'node js': ['node js', 'nodejs', 'node'],
  'nodejs': ['nodejs', 'node js', 'node'],
  'javascript': ['javascript', 'js'],
  'js': ['js', 'javascript'],
  'typescript': ['typescript', 'ts'],
  'ts': ['ts', 'typescript'],
  'c++': ['c++', 'cpp'],
  'cpp': ['cpp', 'c++'],
  'c#': ['c#', 'csharp'],
  'csharp': ['csharp', 'c#'],
  'net': ['net', 'dotnet'],
  'dotnet': ['dotnet', 'net'],
  'postgresql': ['postgresql', 'postgres'],
  'postgres': ['postgres', 'postgresql'],
  'kubernetes': ['kubernetes', 'k8s'],
  'k8s': ['k8s', 'kubernetes'],
  'aws': ['aws', 'amazon web services'],
  'gcp': ['gcp', 'google cloud'],
  'google cloud': ['google cloud', 'gcp'],
  'machine learning': ['machine learning', 'ml'],
  'ml': ['ml', 'machine learning'],
  'artificial intelligence': ['artificial intelligence', 'ai'],
  'ai': ['ai', 'artificial intelligence'],
  'rest api': ['rest api', 'rest apis', 'rest'],
  'rest apis': ['rest apis', 'rest api', 'rest'],
  'ui ux': ['ui ux', 'ui/ux', 'ux ui'],
  'ux ui': ['ux ui', 'ui ux'],
  'next js': ['next js', 'nextjs'],
  'nextjs': ['nextjs', 'next js'],
  'vue js': ['vue js', 'vuejs', 'vue'],
  'vuejs': ['vuejs', 'vue js', 'vue'],
  'angular js': ['angular js', 'angularjs', 'angular'],
  'angularjs': ['angularjs', 'angular js', 'angular'],
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRoleText(value: string): string {
  return normalize(value)
    .replace(/\bsde\b/g, 'software engineer')
    .replace(/\bswe\b/g, 'software engineer')
    .replace(/\bfront end\b/g, 'frontend')
    .replace(/\bback end\b/g, 'backend')
    .replace(/\bfull stack\b/g, 'fullstack')
    .replace(/\bnode js\b/g, 'nodejs')
    .replace(/\bqa\b/g, 'quality assurance')
    .replace(/\bml\b/g, 'machine learning')
    .replace(/\bai\b/g, 'artificial intelligence')
    .replace(/\bjs\b/g, 'javascript')
}

function roleTokens(value: string): string[] {
  return normalizeRoleText(value)
    .split(' ')
    .map(token => ROLE_TOKEN_ALIASES[token] ?? token)
    .filter(token => token && !ROLE_NOISE.has(token))
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false
  return ` ${haystack} `.includes(` ${phrase} `)
}

function uniqueSkills(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = normalize(trimmed)
    if (!trimmed || !key || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function skillPhrases(skill: string): string[] {
  const key = normalize(skill)
  if (!key) return []
  const aliases = SKILL_ALIASES[key] ?? []
  return [...new Set([key, ...aliases])]
}

function matchedSkillLabels(skills: string[], haystack: string): string[] {
  const matched: string[] = []
  const seenCanonical = new Set<string>()
  for (const skill of skills) {
    const phrases = skillPhrases(skill)
    if (phrases.length === 0) continue
    if (!phrases.some(phrase => containsPhrase(haystack, phrase))) continue
    const canonical = phrases[0]
    if (seenCanonical.has(canonical)) continue
    seenCanonical.add(canonical)
    matched.push(skill)
  }
  return matched
}

function roleMatchRatio(targetRole: string | null, jobTitle: string): number | null {
  if (!targetRole?.trim()) return null
  const targetTokens = roleTokens(targetRole)
  if (targetTokens.length === 0) return null

  const jobNormalized = normalizeRoleText(jobTitle)
  const targetNormalized = normalizeRoleText(targetRole)
  if (jobNormalized === targetNormalized) return 1

  const jobTokens = new Set(roleTokens(jobTitle))
  if (jobTokens.size === 0) return 0

  const matched = new Set(targetTokens.filter(token => jobTokens.has(token))).size
  return matched / targetTokens.length
}

function branchMatch(job: RecommendationJob, branch: string | null): number | null {
  if (!branch?.trim() || !job.branches || job.branches.length === 0) return null
  const userBranch = normalize(branch)
  if (!userBranch) return null

  const matches = job.branches.some(jobBranch => {
    const normalizedJobBranch = normalize(jobBranch)
    if (!normalizedJobBranch) return false
    return (
      normalizedJobBranch === userBranch ||
      containsPhrase(normalizedJobBranch, userBranch) ||
      containsPhrase(userBranch, normalizedJobBranch)
    )
  })
  return matches ? 1 : 0
}

function locationMatch(job: RecommendationJob, signals: RecommendationSignals): number | null {
  const preferredLocation = signals.preferredLocation?.trim()
  const preferredWorkMode = signals.preferredWorkMode ?? null
  if (!preferredLocation && !preferredWorkMode) return null

  const parts: number[] = []

  if (preferredWorkMode) {
    if (preferredWorkMode === 'remote') {
      parts.push(job.remote ? 1 : 0)
    } else if (preferredWorkMode === 'onsite') {
      parts.push(job.remote ? 0 : 1)
    } else {
      const hybridText = normalize(`${job.location} ${job.description}`)
      parts.push(containsPhrase(hybridText, 'hybrid') ? 1 : 0)
    }
  }

  if (preferredLocation) {
    const locationText = normalize(job.location)
    const wanted = normalize(preferredLocation)
    parts.push(
      locationText === wanted || containsPhrase(locationText, wanted) ? 1 : 0,
    )
  }

  if (parts.length === 0) return null
  return parts.reduce((sum, value) => sum + value, 0) / parts.length
}

function dedupeKey(job: RecommendationJob): string {
  return [
    normalize(job.title),
    normalize(job.company),
    normalize(job.location),
  ].join('|')
}

function buildReasons(
  signals: RecommendationSignals,
  titleRatio: number | null,
  matchedSkills: string[],
  eligibilityRatio: number | null,
  locationRatio: number | null,
): RecommendationReason[] {
  const reasons: RecommendationReason[] = []

  if (titleRatio !== null && titleRatio >= 0.5 && signals.targetRole) {
    reasons.push({
      kind: 'role',
      text: titleRatio >= 1
        ? `Job title matches your target role "${signals.targetRole.trim()}".`
        : `Job title partially matches your target role "${signals.targetRole.trim()}".`,
    })
  }

  if (matchedSkills.length > 0) {
    const shown = matchedSkills.slice(0, 3)
    const extra = matchedSkills.length - shown.length
    const skillWord = matchedSkills.length === 1 ? 'skill' : 'skills'
    reasons.push({
      kind: 'skills',
      text: `Resume ${skillWord} found in this listing: ${shown.join(', ')}${extra > 0 ? `, and ${extra} more` : ''}.`,
    })
  }

  if (eligibilityRatio === 1 && signals.branch) {
    reasons.push({
      kind: 'eligibility',
      text: `Listed as open to your branch (${signals.branch.trim()}).`,
    })
  }

  if (locationRatio === 1) {
    if (signals.preferredLocation?.trim()) {
      reasons.push({
        kind: 'location',
        text: `Matches your preferred location (${signals.preferredLocation.trim()}).`,
      })
    } else if (signals.preferredWorkMode) {
      const label = signals.preferredWorkMode === 'onsite' ? 'on-site' : signals.preferredWorkMode
      reasons.push({
        kind: 'location',
        text: `Matches your preferred ${label} work mode.`,
      })
    }
  }

  return reasons
}

export function recommendJobs(
  jobs: RecommendationJob[],
  signals: RecommendationSignals,
  limit = DEFAULT_LIMIT,
): RecommendationOutcome {
  const targetRole = signals.targetRole?.trim() || null
  const skills = uniqueSkills(signals.skills)
  const branch = signals.branch?.trim() || null
  const preferredLocation = signals.preferredLocation?.trim() || null
  const preferredWorkMode = signals.preferredWorkMode ?? null

  const availability: RecommendationAvailability = {
    targetRole: Boolean(targetRole),
    skills: skills.length > 0,
    eligibility: Boolean(branch) && jobs.some(job => (job.branches?.length ?? 0) > 0),
    location: Boolean(preferredLocation || preferredWorkMode),
  }
  const hasSignals =
    availability.targetRole ||
    availability.skills ||
    availability.eligibility ||
    availability.location

  if (!hasSignals) {
    return { recommendations: [], availability, hasSignals: false }
  }

  const bestByKey = new Map<string, RecommendedJob>()

  for (const job of jobs) {
    const titleRatio = roleMatchRatio(targetRole, job.title)
    const haystack = normalize(`${job.title} ${job.description} ${job.category ?? ''}`)
    const matchedSkills = availability.skills ? matchedSkillLabels(skills, haystack) : []
    const eligibilityRatio = branchMatch(job, branch)
    const locationRatio = locationMatch(job, {
      targetRole,
      skills,
      branch,
      preferredLocation,
      preferredWorkMode,
    })

    // A known branch mismatch is a confirmed ineligibility, unlike a missing
    // branch which is left unscored.
    if (eligibilityRatio === 0) continue

    const skillRatio = skills.length === 0
      ? 0
      : Math.min(1, matchedSkills.length / Math.min(3, skills.length))

    const score =
      (titleRatio ?? 0) * RECOMMENDATION_WEIGHTS.role +
      skillRatio * RECOMMENDATION_WEIGHTS.skills +
      (eligibilityRatio ?? 0) * RECOMMENDATION_WEIGHTS.eligibility +
      (locationRatio ?? 0) * RECOMMENDATION_WEIGHTS.location

    if (score <= 0) continue

    const reasons = buildReasons(
      { targetRole, skills, branch, preferredLocation, preferredWorkMode },
      titleRatio,
      matchedSkills,
      eligibilityRatio,
      locationRatio,
    )
    if (reasons.length === 0) continue

    const candidate: RecommendedJob = {
      job,
      score,
      reasons,
      matchedSkills,
    }

    const key = dedupeKey(job)
    const existing = bestByKey.get(key)
    if (!existing || candidate.score > existing.score) {
      bestByKey.set(key, candidate)
    }
  }

  const recommendations = [...bestByKey.values()]
    .sort((a, b) =>
      b.score - a.score ||
      b.matchedSkills.length - a.matchedSkills.length ||
      a.job.title.localeCompare(b.job.title),
    )
    .slice(0, Math.max(0, limit))

  return { recommendations, availability, hasSignals: true }
}
