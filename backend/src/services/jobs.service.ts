import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRole } from '../types/auth.js'

// Explicit column lists so a future `*` never leaks internal fields.
export const JOB_COLUMNS =
  'id, college_id, posted_by, company, title, description, job_type, eligibility, ' +
  'branches, min_cgpa, allowed_backlogs, package, location, application_deadline, ' +
  'drive_date, drive_time, drive_venue, status, application_link, link_label, ' +
  'created_at, updated_at'

export const APPLICATION_COLUMNS =
  'id, job_id, student_id, student_name, status, applied_at, updated_at'

export const JOB_EMBED_COLUMNS =
  'id, college_id, company, title, location, job_type, status, ' +
  'application_deadline, application_link, link_label'

export type JobStatus = 'draft' | 'published' | 'closed'
export type JobType = 'In-Campus' | 'Off-Campus'
export type ApplicationStatus = 'Applied' | 'Under Review' | 'Shortlisted' | 'Rejected'

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'Applied',
  'Under Review',
  'Shortlisted',
  'Rejected',
]

export interface JobRow {
  id: string
  college_id: string
  posted_by: string | null
  company: string
  title: string
  description: string
  job_type: string
  eligibility: string
  branches: string[] | null
  min_cgpa: number | string | null
  allowed_backlogs: number | string | null
  package: string
  location: string
  application_deadline: string | null
  drive_date: string | null
  drive_time: string | null
  drive_venue: string | null
  status: string
  application_link: string | null
  link_label: string | null
  created_at: string
  updated_at: string
}

export interface ApplicationRow {
  id: string
  job_id: string
  student_id: string
  student_name: string | null
  status: string
  applied_at: string
  updated_at: string
}

export interface JobEmbedRow {
  id: string
  college_id: string
  company: string
  title: string
  location: string
  job_type: string
  status: string
  application_deadline: string | null
  application_link: string | null
  link_label: string | null
}

export interface ApplicationWithJobRow extends ApplicationRow {
  job: JobEmbedRow | null
}

export interface JobResponse {
  id: string
  collegeId: string
  postedBy: string | null
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
  status: JobStatus
  applicationLink: string | null
  linkLabel: string | null
  createdAt: string
  updatedAt: string
}

export interface ApplicationResponse {
  id: string
  jobId: string
  studentId: string
  studentName: string | null
  status: ApplicationStatus
  appliedAt: string
  updatedAt: string
}

export interface ApplicationWithJobResponse extends ApplicationResponse {
  job: {
    id: string
    collegeId: string
    company: string
    title: string
    location: string
    jobType: JobType
    status: JobStatus
    applicationDeadline: string | null
    applicationLink: string | null
    linkLabel: string | null
  } | null
}

function asJobType(value: string): JobType {
  return value === 'Off-Campus' ? 'Off-Campus' : 'In-Campus'
}

function asJobStatus(value: string): JobStatus {
  if (value === 'published' || value === 'closed') return value
  return 'draft'
}

function asApplicationStatus(value: string): ApplicationStatus {
  return APPLICATION_STATUSES.includes(value as ApplicationStatus)
    ? (value as ApplicationStatus)
    : 'Applied'
}

export function mapJobRow(row: JobRow): JobResponse {
  return {
    id: row.id,
    collegeId: row.college_id,
    postedBy: row.posted_by ?? null,
    company: row.company,
    title: row.title,
    description: row.description ?? '',
    jobType: asJobType(row.job_type),
    eligibility: row.eligibility ?? '',
    branches: Array.isArray(row.branches) ? row.branches : [],
    minCgpa: Number(row.min_cgpa ?? 0),
    allowedBacklogs: Number(row.allowed_backlogs ?? 0),
    package: row.package ?? '',
    location: row.location ?? '',
    applicationDeadline: row.application_deadline ?? null,
    driveDate: row.drive_date ?? null,
    driveTime: row.drive_time ?? null,
    driveVenue: row.drive_venue ?? null,
    status: asJobStatus(row.status),
    applicationLink: row.application_link ?? null,
    linkLabel: row.link_label ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapApplicationRow(row: ApplicationRow): ApplicationResponse {
  return {
    id: row.id,
    jobId: row.job_id,
    studentId: row.student_id,
    studentName: row.student_name ?? null,
    status: asApplicationStatus(row.status),
    appliedAt: row.applied_at,
    updatedAt: row.updated_at,
  }
}

export function mapApplicationWithJobRow(row: ApplicationWithJobRow): ApplicationWithJobResponse {
  return {
    ...mapApplicationRow(row),
    job: row.job
      ? {
          id: row.job.id,
          collegeId: row.job.college_id,
          company: row.job.company,
          title: row.job.title,
          location: row.job.location,
          jobType: asJobType(row.job.job_type),
          status: asJobStatus(row.job.status),
          applicationDeadline: row.job.application_deadline ?? null,
          applicationLink: row.job.application_link ?? null,
          linkLabel: row.job.link_label ?? null,
        }
      : null,
  }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// List jobs for the caller. RLS is the authority; these filters just make the
// intent explicit and keep student responses to published jobs.
export async function listJobs(
  client: SupabaseClient,
  role: AppRole,
  collegeId: string | null,
) {
  let query = client
    .from('campus_jobs')
    .select(JOB_COLUMNS)
    .order('created_at', { ascending: false })

  if (role === 'placement-officer') {
    if (!collegeId) {
      return { data: [] as JobRow[], error: null }
    }
    query = query.eq('college_id', collegeId)
  } else {
    query = query.eq('status', 'published')
  }

  return query
}

export async function getJob(client: SupabaseClient, jobId: string) {
  return client.from('campus_jobs').select(JOB_COLUMNS).eq('id', jobId).maybeSingle()
}

export async function createJob(client: SupabaseClient, patch: Record<string, unknown>) {
  return client.from('campus_jobs').insert(patch).select(JOB_COLUMNS).single()
}

export async function updateJob(
  client: SupabaseClient,
  jobId: string,
  collegeId: string,
  patch: Record<string, unknown>,
) {
  return client
    .from('campus_jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('college_id', collegeId)
    .select(JOB_COLUMNS)
    .maybeSingle()
}

export async function listApplicationsForJob(client: SupabaseClient, jobId: string) {
  return client
    .from('job_applications')
    .select(APPLICATION_COLUMNS)
    .eq('job_id', jobId)
    .order('applied_at', { ascending: true })
}

export async function listOwnApplications(client: SupabaseClient, studentId: string) {
  return client
    .from('job_applications')
    .select(`${APPLICATION_COLUMNS}, job:campus_jobs(${JOB_EMBED_COLUMNS})`)
    .eq('student_id', studentId)
    .order('applied_at', { ascending: false })
}

// Officers: every application for jobs in their own college.
//
// The caller's college comes from the verified auth context (never the request),
// and is applied here as an explicit filter on the embedded job's `college_id`.
// `!inner` is required for PostgREST to filter the top-level `job_applications`
// rows by the embedded `campus_jobs` column; with a plain (left) embed the
// filter would only affect the embedded object, not the parent rows. RLS
// independently enforces the same scope, so this is defence in depth rather
// than the sole guarantee.
export async function listCollegeApplications(client: SupabaseClient, collegeId: string) {
  return client
    .from('job_applications')
    .select(`${APPLICATION_COLUMNS}, job:campus_jobs!inner(${JOB_EMBED_COLUMNS})`)
    .eq('job.college_id', collegeId)
    .order('applied_at', { ascending: false })
}

export async function getApplicationById(client: SupabaseClient, applicationId: string) {
  return client
    .from('job_applications')
    .select(APPLICATION_COLUMNS)
    .eq('id', applicationId)
    .maybeSingle()
}

export async function findApplication(
  client: SupabaseClient,
  jobId: string,
  studentId: string,
) {
  return client
    .from('job_applications')
    .select(APPLICATION_COLUMNS)
    .eq('job_id', jobId)
    .eq('student_id', studentId)
    .maybeSingle()
}

export async function createApplication(
  client: SupabaseClient,
  patch: Record<string, unknown>,
) {
  return client.from('job_applications').insert(patch).select(APPLICATION_COLUMNS).single()
}

export async function deleteOwnApplication(
  client: SupabaseClient,
  applicationId: string,
  studentId: string,
) {
  return client
    .from('job_applications')
    .delete()
    .eq('id', applicationId)
    .eq('student_id', studentId)
    .select('id')
    .maybeSingle()
}

export async function updateApplicationStatus(
  writer: SupabaseClient,
  applicationId: string,
  jobId: string,
  currentStatus: ApplicationStatus,
  status: ApplicationStatus,
) {
  return writer
    .from('job_applications')
    .update({ status })
    .eq('id', applicationId)
    .eq('job_id', jobId)
    .eq('status', currentStatus)
    .select(APPLICATION_COLUMNS)
    .maybeSingle()
}

export function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message ?? '')
}
