// Shared campus-placement model used by the Job Portal, Job Posting and the
// persisted jobs API client. Jobs and applications are stored in Supabase; this
// module only holds types and pure formatting/validation helpers.

export type JobType = 'In-Campus' | 'Off-Campus'
export type CampusJobStatus = 'draft' | 'published' | 'closed'
export type ApplicationStatus = 'Applied' | 'Under Review' | 'Shortlisted' | 'Rejected'

export const engineeringBranches: string[] = [
  'Computer Science',
  'Information Technology',
  'Electronics & Communication',
  'Electrical',
  'Mechanical',
  'Civil',
  'Data Science',
]

export interface CampusJob {
  id: string
  company: string
  title: string
  description: string
  jobType: JobType
  // UUID of the owning college from the database (never a free-text name).
  collegeId: string
  eligibility: string
  branches: string[]
  minCgpa: number
  allowedBacklogs: number
  package: string
  location: string
  applicationDeadline: string
  driveDate: string
  driveTime: string
  driveVenue: string
  status: CampusJobStatus
  createdAt: string
  postedBy: string | null
  // Optional external application link (official company careers page or form).
  applicationLink?: string
  linkLabel?: string
}

export interface CampusApplication {
  id: string
  jobId: string
  studentId: string
  studentName: string | null
  appliedAt: string
  updatedAt: string
  status: ApplicationStatus
}

/** Job summary embedded in an application response by the API. */
export interface AppliedJobSummary {
  id: string
  collegeId: string
  company: string
  title: string
  location: string
  jobType: JobType
  status: CampusJobStatus
  applicationDeadline: string | null
  applicationLink: string | null
  linkLabel: string | null
}

export interface CampusApplicationWithJob extends CampusApplication {
  job: AppliedJobSummary | null
}

// Editable string-based form shape (values are parsed/validated on submit).
export interface CampusJobDraft {
  company: string
  title: string
  description: string
  jobType: JobType
  eligibility: string
  branches: string[]
  minCgpa: string
  allowedBacklogs: string
  package: string
  location: string
  applicationDeadline: string
  driveDate: string
  driveTime: string
  driveVenue: string
  applicationLink: string
  linkLabel: string
}

// Payload accepted by POST/PATCH /api/jobs. The server owns college, poster and
// status (draft/published are selected through the create/publish endpoints).
export interface CampusJobInput {
  company: string
  title: string
  description: string
  jobType: JobType
  eligibility: string
  branches: string[]
  minCgpa: number
  allowedBacklogs: number
  package: string
  location: string
  applicationDeadline: string | null
  driveDate: string | null
  driveTime: string | null
  driveVenue: string | null
  applicationLink: string | null
  linkLabel: string | null
}

// Default label shown when a link is provided without a custom label.
export const DEFAULT_LINK_LABEL = 'Apply on Company Website'

// A link is only usable when it parses as an absolute http(s) URL.
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// ── Date helpers ─────────────────────────────────────────────────

export function todayISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function isoInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatTime(value: string): string {
  if (!value) return '—'
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h)) return value
  const d = new Date()
  d.setHours(h, m || 0, 0, 0)
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function daysUntil(iso: string): number {
  if (!iso) return Number.NaN
  const target = new Date(`${iso}T00:00:00`).getTime()
  const today = new Date(`${todayISO()}T00:00:00`).getTime()
  if (Number.isNaN(target)) return Number.NaN
  return Math.round((target - today) / 86400000)
}

// A job is open to students only when published and its deadline has not passed.
export function isJobOpen(job: CampusJob): boolean {
  return job.status === 'published' && daysUntil(job.applicationDeadline) >= 0
}

// ── Validation ───────────────────────────────────────────────────

export function emptyCampusJobDraft(): CampusJobDraft {
  return {
    company: '',
    title: '',
    description: '',
    jobType: 'In-Campus',
    eligibility: '',
    branches: [],
    minCgpa: '6.0',
    allowedBacklogs: '0',
    package: '',
    location: '',
    applicationDeadline: isoInDays(14),
    driveDate: isoInDays(21),
    driveTime: '10:00',
    driveVenue: '',
    applicationLink: '',
    linkLabel: '',
  }
}

// Drafts only need a company and title; publishing validates everything.
export function validateCampusJob(v: CampusJobDraft, mode: 'draft' | 'publish'): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!v.company.trim()) errors.company = 'Company name is required.'
  if (!v.title.trim()) errors.title = 'Job title is required.'
  // Optional link: only validated when provided, in both draft and publish modes.
  if (v.applicationLink.trim() && !isHttpUrl(v.applicationLink))
    errors.applicationLink = 'Enter a valid link starting with http:// or https://'
  if (mode === 'draft') return errors

  const today = todayISO()

  if (v.description.trim().length < 20) errors.description = 'Add a description of at least 20 characters.'
  if (!v.eligibility.trim()) errors.eligibility = 'Eligibility criteria is required.'
  if (v.branches.length === 0) errors.branches = 'Select at least one eligible branch.'

  const cgpa = Number(v.minCgpa)
  if (v.minCgpa.trim() === '' || Number.isNaN(cgpa)) errors.minCgpa = 'Minimum CGPA is required.'
  else if (cgpa < 0 || cgpa > 10) errors.minCgpa = 'CGPA must be between 0 and 10.'

  const backlogs = Number(v.allowedBacklogs)
  if (v.allowedBacklogs.trim() === '' || Number.isNaN(backlogs) || !Number.isInteger(backlogs) || backlogs < 0)
    errors.allowedBacklogs = 'Enter allowed backlogs as 0 or a positive whole number.'

  if (!v.package.trim()) errors.package = 'Package or salary is required.'
  if (!v.location.trim()) errors.location = 'Job location is required.'

  if (!v.applicationDeadline) errors.applicationDeadline = 'Application deadline is required.'
  else if (Number.isNaN(new Date(`${v.applicationDeadline}T00:00:00`).getTime()))
    errors.applicationDeadline = 'Enter a valid deadline date.'
  else if (v.applicationDeadline < today) errors.applicationDeadline = 'Deadline cannot be in the past.'

  if (!v.driveDate) errors.driveDate = 'Drive date is required.'
  else if (Number.isNaN(new Date(`${v.driveDate}T00:00:00`).getTime()))
    errors.driveDate = 'Enter a valid drive date.'
  else if (v.driveDate < today) errors.driveDate = 'Drive date cannot be in the past.'
  else if (v.applicationDeadline && v.driveDate < v.applicationDeadline)
    errors.driveDate = 'Drive date cannot be before the application deadline.'

  if (!v.driveTime) errors.driveTime = 'Drive time is required.'
  if (!v.driveVenue.trim()) errors.driveVenue = 'Drive venue is required.'

  return errors
}

export function draftToPayload(v: CampusJobDraft): CampusJobInput {
  const applicationLink = v.applicationLink.trim()
  return {
    company: v.company.trim(),
    title: v.title.trim(),
    description: v.description.trim(),
    jobType: v.jobType,
    eligibility: v.eligibility.trim(),
    branches: [...v.branches],
    minCgpa: v.minCgpa.trim() === '' ? 0 : Number(v.minCgpa),
    allowedBacklogs: v.allowedBacklogs.trim() === '' ? 0 : Number(v.allowedBacklogs),
    package: v.package.trim(),
    location: v.location.trim(),
    applicationDeadline: v.applicationDeadline || null,
    driveDate: v.driveDate || null,
    driveTime: v.driveTime || null,
    driveVenue: v.driveVenue.trim() || null,
    applicationLink: applicationLink || null,
    linkLabel: applicationLink ? v.linkLabel.trim() || null : null,
  }
}

export function jobToDraft(job: CampusJob): CampusJobDraft {
  return {
    company: job.company,
    title: job.title,
    description: job.description,
    jobType: job.jobType,
    eligibility: job.eligibility,
    branches: [...job.branches],
    minCgpa: Number.isFinite(job.minCgpa) ? String(job.minCgpa) : '',
    allowedBacklogs: Number.isFinite(job.allowedBacklogs) ? String(job.allowedBacklogs) : '',
    package: job.package,
    location: job.location,
    applicationDeadline: job.applicationDeadline,
    driveDate: job.driveDate,
    driveTime: job.driveTime ? job.driveTime.slice(0, 5) : '',
    driveVenue: job.driveVenue,
    applicationLink: job.applicationLink ?? '',
    linkLabel: job.linkLabel ?? '',
  }
}

// Preview object built from the form; never persisted.
export function draftToJob(v: CampusJobDraft, status: CampusJobStatus, collegeId: string): CampusJob {
  const payload = draftToPayload(v)
  return {
    id: 'preview',
    company: payload.company,
    title: payload.title,
    description: payload.description,
    jobType: payload.jobType,
    collegeId,
    eligibility: payload.eligibility,
    branches: payload.branches,
    minCgpa: payload.minCgpa,
    allowedBacklogs: payload.allowedBacklogs,
    package: payload.package,
    location: payload.location,
    applicationDeadline: payload.applicationDeadline ?? '',
    driveDate: payload.driveDate ?? '',
    driveTime: payload.driveTime ?? '',
    driveVenue: payload.driveVenue ?? '',
    status,
    createdAt: new Date().toISOString(),
    postedBy: null,
    applicationLink: payload.applicationLink ?? undefined,
    linkLabel: payload.linkLabel ?? undefined,
  }
}
