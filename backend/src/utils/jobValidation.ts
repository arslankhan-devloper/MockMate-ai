import { APPLICATION_STATUSES, todayISO, type ApplicationStatus, type JobRow } from '../services/jobs.service.js'

type FieldErrors = Record<string, string>

export type JobValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string; fields: FieldErrors }

const JOB_TYPES = new Set(['In-Campus', 'Off-Campus'])
const CREATE_STATUSES = new Set(['draft', 'published'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const PROTECTED_FIELDS = new Set([
  'id',
  'collegeId',
  'college_id',
  'postedBy',
  'posted_by',
  'role',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(
  body: Record<string, unknown>,
  camel: string,
  column: string,
  maxLength: number,
  patch: Record<string, unknown>,
  fields: FieldErrors,
): void {
  if (!(camel in body)) return
  const raw = body[camel]
  if (raw !== null && typeof raw !== 'string') {
    fields[camel] = 'Must be a string.'
    return
  }
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed.length > maxLength) {
    fields[camel] = `Must be at most ${maxLength} characters.`
    return
  }
  // These columns are NOT NULL in the schema, so an empty value is stored as ''
  // (never null) to support incomplete drafts.
  patch[column] = trimmed
}

function readDate(
  body: Record<string, unknown>,
  camel: string,
  column: string,
  patch: Record<string, unknown>,
  fields: FieldErrors,
): void {
  if (!(camel in body)) return
  const raw = body[camel]
  if (raw !== null && typeof raw !== 'string') {
    fields[camel] = 'Must be a date string or null.'
    return
  }
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed === '') {
    patch[column] = null
    return
  }
  if (!DATE_RE.test(trimmed) || Number.isNaN(new Date(`${trimmed}T00:00:00`).getTime())) {
    fields[camel] = 'Enter a valid date (YYYY-MM-DD).'
    return
  }
  patch[column] = trimmed
}

function readTime(
  body: Record<string, unknown>,
  camel: string,
  column: string,
  patch: Record<string, unknown>,
  fields: FieldErrors,
): void {
  if (!(camel in body)) return
  const raw = body[camel]
  if (raw !== null && typeof raw !== 'string') {
    fields[camel] = 'Must be a time string or null.'
    return
  }
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed === '') {
    patch[column] = null
    return
  }
  if (!TIME_RE.test(trimmed)) {
    fields[camel] = 'Enter a valid time (HH:MM).'
    return
  }
  patch[column] = trimmed
}

function readCgpa(
  body: Record<string, unknown>,
  patch: Record<string, unknown>,
  fields: FieldErrors,
): void {
  if (!('minCgpa' in body)) return
  const raw = body.minCgpa
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    fields.minCgpa = 'CGPA must be a number between 0 and 10.'
    return
  }
  patch.min_cgpa = value
}

function readBacklogs(
  body: Record<string, unknown>,
  patch: Record<string, unknown>,
  fields: FieldErrors,
): void {
  if (!('allowedBacklogs' in body)) return
  const raw = body.allowedBacklogs
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
  if (!Number.isInteger(value) || value < 0) {
    fields.allowedBacklogs = 'Allowed backlogs must be a whole number of 0 or more.'
    return
  }
  patch.allowed_backlogs = value
}

function readBranches(
  body: Record<string, unknown>,
  patch: Record<string, unknown>,
  fields: FieldErrors,
): void {
  if (!('branches' in body)) return
  const raw = body.branches
  if (!Array.isArray(raw)) {
    fields.branches = 'Branches must be an array of strings.'
    return
  }
  const values: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') {
      fields.branches = 'Branches must be an array of strings.'
      return
    }
    const trimmed = item.trim()
    if (!trimmed) continue
    if (trimmed.length > 80) {
      fields.branches = 'Each branch name must be at most 80 characters.'
      return
    }
    if (!values.includes(trimmed)) values.push(trimmed)
  }
  if (values.length > 50) {
    fields.branches = 'At most 50 branches are allowed.'
    return
  }
  patch.branches = values
}

function readUrl(
  body: Record<string, unknown>,
  camel: string,
  column: string,
  patch: Record<string, unknown>,
  fields: FieldErrors,
): void {
  if (!(camel in body)) return
  const raw = body[camel]
  if (raw !== null && typeof raw !== 'string') {
    fields[camel] = 'Must be a URL string or null.'
    return
  }
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed === '') {
    patch[column] = null
    return
  }
  if (trimmed.length > 2048) {
    fields[camel] = 'URL is too long.'
    return
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      fields[camel] = 'Only http:// and https:// links are allowed.'
      return
    }
    if (parsed.username || parsed.password) {
      fields[camel] = 'Links must not contain embedded credentials.'
      return
    }
  } catch {
    fields[camel] = 'Enter a valid URL starting with http:// or https://.'
    return
  }
  patch[column] = trimmed
}

function normalizeJobBody(body: unknown): JobValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  const fields: FieldErrors = {}
  const patch: Record<string, unknown> = {}

  for (const key of Object.keys(body)) {
    if (PROTECTED_FIELDS.has(key)) {
      fields[key] = 'This field is managed by the system and cannot be changed here.'
    }
  }

  readString(body, 'company', 'company', 200, patch, fields)
  readString(body, 'title', 'title', 200, patch, fields)
  readString(body, 'description', 'description', 5000, patch, fields)
  readString(body, 'eligibility', 'eligibility', 2000, patch, fields)
  readString(body, 'package', 'package', 100, patch, fields)
  readString(body, 'location', 'location', 200, patch, fields)
  readString(body, 'driveVenue', 'drive_venue', 300, patch, fields)
  readString(body, 'linkLabel', 'link_label', 120, patch, fields)
  readDate(body, 'applicationDeadline', 'application_deadline', patch, fields)
  readDate(body, 'driveDate', 'drive_date', patch, fields)
  readTime(body, 'driveTime', 'drive_time', patch, fields)
  readCgpa(body, patch, fields)
  readBacklogs(body, patch, fields)
  readBranches(body, patch, fields)
  readUrl(body, 'applicationLink', 'application_link', patch, fields)

  if ('jobType' in body) {
    const raw = body.jobType
    if (typeof raw !== 'string' || !JOB_TYPES.has(raw)) {
      fields.jobType = 'Job type must be In-Campus or Off-Campus.'
    } else {
      patch.job_type = raw
    }
  }

  return Object.keys(fields).length > 0
    ? { ok: false, message: 'One or more fields are invalid.', fields }
    : { ok: true, value: patch }
}

function publishFields(patch: Record<string, unknown>): FieldErrors {
  const fields: FieldErrors = {}
  const text = (column: string): string =>
    typeof patch[column] === 'string' ? (patch[column] as string).trim() : ''

  if (!text('description') || text('description').length < 20) {
    fields.description = 'Add a description of at least 20 characters.'
  }
  if (!text('eligibility')) fields.eligibility = 'Eligibility criteria is required.'
  if (!Array.isArray(patch.branches) || (patch.branches as unknown[]).length === 0) {
    fields.branches = 'Select at least one eligible branch.'
  }
  if (patch.min_cgpa === undefined) fields.minCgpa = 'Minimum CGPA is required.'
  if (patch.allowed_backlogs === undefined) {
    fields.allowedBacklogs = 'Enter allowed backlogs as 0 or a positive whole number.'
  }
  if (!text('package')) fields.package = 'Package or salary is required.'
  if (!text('location')) fields.location = 'Job location is required.'

  const deadline = typeof patch.application_deadline === 'string' ? patch.application_deadline : ''
  if (!deadline) fields.applicationDeadline = 'Application deadline is required.'
  else if (deadline < todayISO()) fields.applicationDeadline = 'Deadline cannot be in the past.'

  const driveDate = typeof patch.drive_date === 'string' ? patch.drive_date : ''
  if (!driveDate) fields.driveDate = 'Drive date is required.'
  else if (driveDate < todayISO()) fields.driveDate = 'Drive date cannot be in the past.'
  else if (deadline && driveDate < deadline) {
    fields.driveDate = 'Drive date cannot be before the application deadline.'
  }

  if (!text('drive_time')) fields.driveTime = 'Drive time is required.'
  if (!text('drive_venue')) fields.driveVenue = 'Drive venue is required.'

  return fields
}

export function validateJobCreate(
  body: unknown,
  mode: 'draft' | 'publish',
): JobValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  // Accept an explicit status on create, but only draft/published.
  if ('status' in body) {
    const status = body.status
    if (typeof status !== 'string' || !CREATE_STATUSES.has(status)) {
      return { ok: false, message: 'Invalid job status.', fields: { status: 'Status must be draft or published.' } }
    }
  }

  const normalized = normalizeJobBody(body)
  if (!normalized.ok) return normalized

  const patch = normalized.value
  const fields: FieldErrors = {}

  if (typeof patch.company !== 'string' || !patch.company.trim()) {
    fields.company = 'Company name is required.'
  }
  if (typeof patch.title !== 'string' || !patch.title.trim()) {
    fields.title = 'Job title is required.'
  }
  if (patch.job_type === undefined) patch.job_type = 'In-Campus'

  if (mode === 'publish') Object.assign(fields, publishFields(patch))

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }

  patch.status = mode === 'publish' ? 'published' : 'draft'
  return { ok: true, value: patch }
}

export function validateJobUpdate(body: unknown): JobValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  if ('status' in body) {
    return {
      ok: false,
      message: 'Use the publish or close endpoint to change job status.',
      fields: { status: 'Status cannot be changed here.' },
    }
  }

  const normalized = normalizeJobBody(body)
  if (!normalized.ok) return normalized

  const patch = normalized.value
  if (Object.keys(patch).length === 0) {
    return { ok: false, message: 'No updatable fields were provided.', fields: {} }
  }

  // On edit, a company/title that is present must not be blanked out.
  if ('company' in patch && (typeof patch.company !== 'string' || !patch.company.trim())) {
    return { ok: false, message: 'One or more fields are invalid.', fields: { company: 'Company name is required.' } }
  }
  if ('title' in patch && (typeof patch.title !== 'string' || !patch.title.trim())) {
    return { ok: false, message: 'One or more fields are invalid.', fields: { title: 'Job title is required.' } }
  }

  return { ok: true, value: patch }
}

// Validate a stored job row immediately before publishing it.
export function publishErrorsFromRow(row: JobRow): FieldErrors {
  const fields: FieldErrors = {}
  const text = (value: string | null | undefined): string => (value ?? '').trim()

  if (!text(row.company)) fields.company = 'Company name is required.'
  if (!text(row.title)) fields.title = 'Job title is required.'
  if (text(row.description).length < 20) {
    fields.description = 'Add a description of at least 20 characters.'
  }
  if (!text(row.eligibility)) fields.eligibility = 'Eligibility criteria is required.'
  if (!Array.isArray(row.branches) || row.branches.length === 0) {
    fields.branches = 'Select at least one eligible branch.'
  }
  const cgpa = Number(row.min_cgpa)
  if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) {
    fields.minCgpa = 'CGPA must be a number between 0 and 10.'
  }
  const backlogs = Number(row.allowed_backlogs)
  if (!Number.isInteger(backlogs) || backlogs < 0) {
    fields.allowedBacklogs = 'Allowed backlogs must be a whole number of 0 or more.'
  }
  if (!text(row.package)) fields.package = 'Package or salary is required.'
  if (!text(row.location)) fields.location = 'Job location is required.'

  if (!row.application_deadline) fields.applicationDeadline = 'Application deadline is required.'
  else if (row.application_deadline < todayISO()) {
    fields.applicationDeadline = 'Deadline cannot be in the past.'
  }

  if (!row.drive_date) fields.driveDate = 'Drive date is required.'
  else if (row.drive_date < todayISO()) fields.driveDate = 'Drive date cannot be in the past.'
  else if (row.application_deadline && row.drive_date < row.application_deadline) {
    fields.driveDate = 'Drive date cannot be before the application deadline.'
  }

  if (!text(row.drive_time)) fields.driveTime = 'Drive time is required.'
  if (!text(row.drive_venue)) fields.driveVenue = 'Drive venue is required.'

  return fields
}

export function validateApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && APPLICATION_STATUSES.includes(value as ApplicationStatus)
}
