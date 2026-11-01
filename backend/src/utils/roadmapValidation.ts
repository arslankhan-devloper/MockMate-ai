// Validation for roadmap topic progress.
//
// The client is untrusted input. Domain IDs are restricted to the six curated
// tracks, topic IDs must use the stable lowercase slug format, and the request
// body may contain only the `completed` boolean. The owner (`student_id`) is
// never accepted from the client; it always comes from the verified token.

export const ROADMAP_DOMAIN_IDS = [
  'it',
  'mechanical',
  'electronics',
  'management',
  'hr',
  'aptitude',
] as const

export type RoadmapDomainId = (typeof ROADMAP_DOMAIN_IDS)[number]

const DOMAIN_IDS = new Set<string>(ROADMAP_DOMAIN_IDS)
const TOPIC_ID_RE = /^[a-z0-9-]{1,80}$/

export type RoadmapFieldErrors = Record<string, string>

export type RoadmapTopicValidationResult =
  | { ok: true; value: { domainId: RoadmapDomainId; topicId: string } }
  | { ok: false; message: string; fields: RoadmapFieldErrors }

export type RoadmapProgressValidationResult =
  | { ok: true; value: { completed: boolean } }
  | { ok: false; message: string; fields: RoadmapFieldErrors }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function singleParam(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function validateRoadmapTopicParams(
  rawDomainId: unknown,
  rawTopicId: unknown,
): RoadmapTopicValidationResult {
  const fields: RoadmapFieldErrors = {}
  const domainId = singleParam(rawDomainId)
  const topicId = singleParam(rawTopicId)

  if (!domainId || !DOMAIN_IDS.has(domainId)) {
    fields.domainId = 'Domain must be one of: it, mechanical, electronics, management, hr, aptitude.'
  }
  if (!topicId || !TOPIC_ID_RE.test(topicId)) {
    fields.topicId = 'Topic must be a lowercase slug of 1-80 characters using letters, numbers and hyphens.'
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more roadmap parameters are invalid.', fields }
  }

  return {
    ok: true,
    value: {
      domainId: domainId as RoadmapDomainId,
      topicId: topicId as string,
    },
  }
}

export function validateRoadmapProgressBody(body: unknown): RoadmapProgressValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  const fields: RoadmapFieldErrors = {}

  for (const key of Object.keys(body)) {
    if (key === 'completed') continue
    if (key === 'studentId' || key === 'student_id') {
      fields[key] = 'The student is derived from the authenticated session and cannot be set here.'
    } else {
      fields[key] = 'Unknown field.'
    }
  }

  const completed = body.completed
  if (typeof completed !== 'boolean') {
    fields.completed = 'Completed must be true or false.'
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }

  return { ok: true, value: { completed: completed === true } }
}
