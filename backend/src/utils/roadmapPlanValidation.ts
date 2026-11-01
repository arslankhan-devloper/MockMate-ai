// Validation and normalisation for AI-generated roadmap plans.
//
// The model never supplies a URL. It selects a provider from this fixed
// allowlist plus a short search query, and the server constructs the link. That
// keeps every stored link on a known HTTPS host and removes the risk of the
// model inventing a URL or pointing at an internal address.

import {
  ROADMAP_DOMAIN_IDS,
  type RoadmapDomainId,
} from './roadmapValidation.js'

export const ROADMAP_PLAN_VERSION = 1
export const ROADMAP_PLAN_MIN_TASKS = 5
export const ROADMAP_PLAN_MAX_TASKS = 8
export const ROADMAP_PLAN_MAX_RESOURCES = 3

export const ROADMAP_RESOURCE_TYPES = [
  'Documentation',
  'Course',
  'Video',
  'Practice',
  'Article',
] as const

export type RoadmapResourceType = (typeof ROADMAP_RESOURCE_TYPES)[number]

interface ProviderDefinition {
  label: string
  baseUrl: string
  queryParam: string
  defaultType: RoadmapResourceType
  useWhen: string
}

export const ROADMAP_RESOURCE_PROVIDERS = {
  mdn: {
    label: 'MDN Web Docs',
    baseUrl: 'https://developer.mozilla.org/en-US/search',
    queryParam: 'q',
    defaultType: 'Documentation',
    useWhen: 'web platform, JavaScript, HTML, CSS, HTTP and browser APIs',
  },
  freecodecamp: {
    label: 'freeCodeCamp',
    baseUrl: 'https://www.freecodecamp.org/news/search/',
    queryParam: 'query',
    defaultType: 'Article',
    useWhen: 'programming fundamentals, coding practice and beginner tutorials',
  },
  microsoftlearn: {
    label: 'Microsoft Learn',
    baseUrl: 'https://learn.microsoft.com/en-us/search/',
    queryParam: 'terms',
    defaultType: 'Documentation',
    useWhen: 'cloud, data, .NET, Azure, SQL and Microsoft technologies',
  },
  mitocw: {
    label: 'MIT OpenCourseWare',
    baseUrl: 'https://ocw.mit.edu/search/',
    queryParam: 'q',
    defaultType: 'Course',
    useWhen: 'engineering, mathematics, mechanical, electronics and systems theory',
  },
  khanacademy: {
    label: 'Khan Academy',
    baseUrl: 'https://www.khanacademy.org/search',
    queryParam: 'page_search_query',
    defaultType: 'Practice',
    useWhen: 'mathematics, aptitude, statistics, economics and foundational practice',
  },
  coursera: {
    label: 'Coursera',
    baseUrl: 'https://www.coursera.org/search',
    queryParam: 'query',
    defaultType: 'Course',
    useWhen: 'management, HR, business, communication and structured courses',
  },
  edx: {
    label: 'edX',
    baseUrl: 'https://www.edx.org/search',
    queryParam: 'q',
    defaultType: 'Course',
    useWhen: 'university-level engineering, electronics, management and professional courses',
  },
  youtube: {
    label: 'YouTube',
    baseUrl: 'https://www.youtube.com/results',
    queryParam: 'search_query',
    defaultType: 'Video',
    useWhen: 'lecture walkthroughs, visual explanations and worked examples',
  },
} as const satisfies Record<string, ProviderDefinition>

export type RoadmapResourceProviderKey = keyof typeof ROADMAP_RESOURCE_PROVIDERS

const PROVIDER_KEYS = new Set<string>(Object.keys(ROADMAP_RESOURCE_PROVIDERS))

export const ROADMAP_DOMAIN_LABELS: Record<RoadmapDomainId, string> = {
  it: 'IT / Software',
  mechanical: 'Mechanical',
  electronics: 'Electronics',
  management: 'Management',
  hr: 'HR / Behavioral',
  aptitude: 'Aptitude',
}

const DEFAULT_PROVIDER_BY_DOMAIN: Record<RoadmapDomainId, RoadmapResourceProviderKey> = {
  it: 'freecodecamp',
  mechanical: 'mitocw',
  electronics: 'mitocw',
  management: 'coursera',
  hr: 'coursera',
  aptitude: 'khanacademy',
}

const DOMAIN_IDS = new Set<string>(ROADMAP_DOMAIN_IDS)
const TASK_ID_RE = /^[a-z0-9-]{1,80}$/

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
}

export interface RoadmapPlan {
  version: typeof ROADMAP_PLAN_VERSION
  source: 'ai'
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

export interface RoadmapPlanRequest {
  resumeContext: RoadmapResumeContext | null
}

export interface RoadmapPlanContext extends RoadmapPlanRequest {
  branch: string | null
  gradYear: string | null
  targetRole: string | null
  interviewDomains: {
    key: string
    sessions: number
    evaluatedAnswers: number
    averageScore: number | null
  }[]
}

export type RoadmapPlanFieldErrors = Record<string, string>

export type RoadmapPlanRequestValidation =
  | { ok: true; value: RoadmapPlanRequest }
  | { ok: false; message: string; fields: RoadmapPlanFieldErrors }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function taskId(domainId: RoadmapDomainId, title: string, used: Set<string>): string {
  const base = `${domainId}-${slugify(title) || 'task'}`.slice(0, 72)
  let id = base
  let suffix = 2
  while (used.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  used.add(id)
  return id
}

function normalizeResourceType(value: unknown): RoadmapResourceType {
  const lower = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (lower.includes('doc')) return 'Documentation'
  if (lower.includes('course')) return 'Course'
  if (lower.includes('video') || lower.includes('lecture')) return 'Video'
  if (lower.includes('practice') || lower.includes('exercise') || lower.includes('problem')) {
    return 'Practice'
  }
  return 'Article'
}

export function buildRoadmapResourceUrl(
  providerKey: RoadmapResourceProviderKey,
  searchQuery: string,
): string {
  const provider = ROADMAP_RESOURCE_PROVIDERS[providerKey]
  const url = new URL(provider.baseUrl)
  url.searchParams.set(provider.queryParam, searchQuery)
  return url.toString()
}

export function isAllowedRoadmapResourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    return Object.values(ROADMAP_RESOURCE_PROVIDERS).some(
      (provider) => new URL(provider.baseUrl).origin === url.origin,
    )
  } catch {
    return false
  }
}

function normalizeResource(
  raw: unknown,
  fallback: {
    taskTitle: string
    domainId: RoadmapDomainId
    defaultProvider: RoadmapResourceProviderKey
  },
): RoadmapPlanResource | null {
  const providerKey = isPlainObject(raw)
    ? typeof raw.providerKey === 'string'
      ? raw.providerKey.trim().toLowerCase()
      : ''
    : ''

  if (!PROVIDER_KEYS.has(providerKey)) return null
  const key = providerKey as RoadmapResourceProviderKey
  const provider = ROADMAP_RESOURCE_PROVIDERS[key]

  const query =
    (isPlainObject(raw) ? cleanText(raw.searchQuery, 120) : null) ??
    `${fallback.taskTitle} ${ROADMAP_DOMAIN_LABELS[fallback.domainId]}`.trim()

  const type = normalizeResourceType(isPlainObject(raw) ? raw.type : null)
  const title =
    (isPlainObject(raw) ? cleanText(raw.title, 160) : null) ??
    `${provider.label}: ${query}`

  const description =
    (isPlainObject(raw) ? cleanText(raw.description, 300) : null) ??
    `Explore ${type.toLowerCase()} results for “${query}” on ${provider.label}.`

  return {
    title,
    description,
    type,
    provider: provider.label,
    url: buildRoadmapResourceUrl(key, query),
  }
}

function defaultResource(
  taskTitle: string,
  domainId: RoadmapDomainId,
): RoadmapPlanResource {
  const key = DEFAULT_PROVIDER_BY_DOMAIN[domainId]
  const provider = ROADMAP_RESOURCE_PROVIDERS[key]
  const query = `${taskTitle} ${ROADMAP_DOMAIN_LABELS[domainId]}`.trim()
  return {
    title: `${provider.label}: ${taskTitle}`,
    description: `Explore ${provider.defaultType.toLowerCase()} material for this task on ${provider.label}.`,
    type: provider.defaultType,
    provider: provider.label,
    url: buildRoadmapResourceUrl(key, query),
  }
}

// Convert the model's raw JSON into the exact stored shape. Returns null when the
// result would not be a useful checklist rather than persisting a partial plan.
export function normalizeRoadmapPlan(raw: unknown): RoadmapPlan | null {
  if (!isPlainObject(raw) || !Array.isArray(raw.tasks)) return null

  const usedIds = new Set<string>()
  const tasks: RoadmapPlanTask[] = []

  for (const candidate of raw.tasks) {
    if (!isPlainObject(candidate)) continue

    const domainId =
      typeof candidate.domainId === 'string' ? candidate.domainId.trim().toLowerCase() : ''
    if (!DOMAIN_IDS.has(domainId)) continue

    const title = cleanText(candidate.title, 120)
    if (!title) continue

    const validDomain = domainId as RoadmapDomainId
    const description =
      cleanText(candidate.description, 600) ??
      `Build practical confidence in ${title.toLowerCase()} and practise applying it.`

    const parsedMinutes = Number(candidate.estimatedMinutes)
    const estimatedMinutes = Number.isFinite(parsedMinutes)
      ? Math.min(120, Math.max(15, Math.round(parsedMinutes)))
      : 45

    const resources: RoadmapPlanResource[] = []
    if (Array.isArray(candidate.resources)) {
      for (const rawResource of candidate.resources.slice(0, ROADMAP_PLAN_MAX_RESOURCES)) {
        const resource = normalizeResource(rawResource, {
          taskTitle: title,
          domainId: validDomain,
          defaultProvider: DEFAULT_PROVIDER_BY_DOMAIN[validDomain],
        })
        if (resource) resources.push(resource)
      }
    }
    if (resources.length === 0) resources.push(defaultResource(title, validDomain))

    tasks.push({
      id: taskId(validDomain, title, usedIds),
      domainId: validDomain,
      title,
      description,
      estimatedMinutes,
      resources,
    })

    if (tasks.length >= ROADMAP_PLAN_MAX_TASKS) break
  }

  if (tasks.length < ROADMAP_PLAN_MIN_TASKS) return null

  const focusAreas: string[] = []
  if (Array.isArray(raw.focusAreas)) {
    for (const item of raw.focusAreas.slice(0, 6)) {
      const area = cleanText(item, 80)
      if (area && !focusAreas.includes(area)) focusAreas.push(area)
    }
  }
  if (focusAreas.length === 0) {
    for (const task of tasks) {
      const label = ROADMAP_DOMAIN_LABELS[task.domainId]
      if (!focusAreas.includes(label)) focusAreas.push(label)
    }
  }

  return {
    version: ROADMAP_PLAN_VERSION,
    source: 'ai',
    title: cleanText(raw.title, 120) ?? 'Your personalized learning roadmap',
    summary:
      cleanText(raw.summary, 500) ??
      'A practical checklist based on your branch, target role and practice history.',
    focusAreas,
    tasks,
  }
}

// Re-check a plan read from the database. This is defensive: it keeps a malformed
// row or a manually altered URL from reaching the browser.
export function asRoadmapPlan(value: unknown): RoadmapPlan | null {
  if (!isPlainObject(value)) return null
  if (value.version !== ROADMAP_PLAN_VERSION || value.source !== 'ai') return null
  if (!Array.isArray(value.tasks) || value.tasks.length < 1) return null

  const seenIds = new Set<string>()
  for (const task of value.tasks) {
    if (!isPlainObject(task)) return null
    if (typeof task.id !== 'string' || !TASK_ID_RE.test(task.id)) return null
    if (seenIds.has(task.id)) return null
    seenIds.add(task.id)
    if (typeof task.domainId !== 'string' || !DOMAIN_IDS.has(task.domainId)) return null
    if (typeof task.title !== 'string' || typeof task.description !== 'string') return null
    if (typeof task.estimatedMinutes !== 'number') return null
    if (!Array.isArray(task.resources) || task.resources.length === 0) return null

    for (const resource of task.resources) {
      if (!isPlainObject(resource)) return null
      if (typeof resource.url !== 'string' || !isAllowedRoadmapResourceUrl(resource.url)) return null
      if (
        typeof resource.title !== 'string' ||
        typeof resource.description !== 'string' ||
        typeof resource.type !== 'string' ||
        typeof resource.provider !== 'string'
      ) {
        return null
      }
    }
  }

  return value as unknown as RoadmapPlan
}

function validateResumeContext(value: unknown): {
  ok: true; value: RoadmapResumeContext | null
} | {
  ok: false; fields: RoadmapPlanFieldErrors
} {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (!isPlainObject(value)) {
    return { ok: false, fields: { resumeContext: 'Resume context must be an object.' } }
  }

  const fields: RoadmapPlanFieldErrors = {}
  for (const key of Object.keys(value)) {
    if (key === 'targetRole' || key === 'jobTitle' || key === 'skills') continue
    fields[`resumeContext.${key}`] = 'Unknown field.'
  }

  const role = value.targetRole
  let targetRole: string | null = null
  if (role !== undefined && role !== null) {
    if (typeof role !== 'string' || role.trim().length > 120) {
      fields['resumeContext.targetRole'] = 'Target role must be a string of at most 120 characters.'
    } else {
      targetRole = role.trim() || null
    }
  }

  const jobTitleValue = value.jobTitle
  let jobTitle: string | null = null
  if (jobTitleValue !== undefined && jobTitleValue !== null) {
    if (typeof jobTitleValue !== 'string' || jobTitleValue.trim().length > 120) {
      fields['resumeContext.jobTitle'] = 'Job title must be a string of at most 120 characters.'
    } else {
      jobTitle = jobTitleValue.trim() || null
    }
  }

  const skills: string[] = []
  if (value.skills !== undefined) {
    if (!Array.isArray(value.skills) || value.skills.length > 20) {
      fields['resumeContext.skills'] = 'Skills must be an array of at most 20 strings.'
    } else {
      const seen = new Set<string>()
      for (const item of value.skills) {
        if (typeof item !== 'string' || item.trim().length === 0 || item.trim().length > 60) {
          fields['resumeContext.skills'] = 'Each skill must be a non-empty string of at most 60 characters.'
          break
        }
        const trimmed = item.trim()
        const key = trimmed.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          skills.push(trimmed)
        }
      }
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return { ok: true, value: { targetRole, jobTitle, skills } }
}

export function validateRoadmapPlanRequest(body: unknown): RoadmapPlanRequestValidation {
  if (body === undefined || body === null) {
    return { ok: true, value: { resumeContext: null } }
  }
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  const fields: RoadmapPlanFieldErrors = {}
  for (const key of Object.keys(body)) {
    if (key === 'resumeContext') continue
    if (key === 'studentId' || key === 'student_id') {
      fields[key] = 'The student is derived from the authenticated session and cannot be set here.'
    } else {
      fields[key] = 'Unknown field.'
    }
  }

  const resume = validateResumeContext(body.resumeContext)
  if (!resume.ok) {
    Object.assign(fields, resume.fields)
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }

  return {
    ok: true,
    value: { resumeContext: resume.ok ? resume.value : null },
  }
}
