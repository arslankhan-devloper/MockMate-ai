// Typed client for the persisted campus jobs and applications API.
//
//   GET    /api/jobs                     published jobs (students) / own-college jobs (officers)
//   POST   /api/jobs                     officer creates a draft or published job
//   PATCH  /api/jobs/:id                 officer edits a job in their college
//   POST   /api/jobs/:id/publish         officer publishes a complete job
//   POST   /api/jobs/:id/close           officer closes a job
//   GET    /api/jobs/:id/applications    officer lists applicants for a job
//   POST   /api/jobs/:id/applications    student applies to an internal job
//   GET    /api/applications             officer lists every application in their college
//   GET    /api/applications/me          student lists their own applications
//   PATCH  /api/applications/:id         officer updates an application status
//   DELETE /api/applications/:id         student withdraws an application
//
// The backend derives the caller's identity, role and college from the verified
// access token; nothing privileged is ever sent from the browser.

import type {
  AppliedJobSummary,
  ApplicationStatus,
  CampusApplication,
  CampusApplicationWithJob,
  CampusJob,
  CampusJobInput,
  CampusJobStatus,
  JobType,
} from '../data/campusJobs'
import { apiRequest } from './api'
import {
  PRESENTATION_TOKEN,
  DEMO_OFFICER_CAMPUS_JOBS,
  DEMO_OFFICER_APPLICATIONS,
} from './presentationMode'

interface RawJob {
  id: string
  collegeId: string
  postedBy: string | null
  company: string
  title: string
  description?: string | null
  jobType: string
  eligibility?: string | null
  branches?: string[] | null
  minCgpa?: number | string | null
  allowedBacklogs?: number | string | null
  package?: string | null
  location?: string | null
  applicationDeadline?: string | null
  driveDate?: string | null
  driveTime?: string | null
  driveVenue?: string | null
  status: string
  applicationLink?: string | null
  linkLabel?: string | null
  createdAt: string
  updatedAt: string
}

interface RawApplication {
  id: string
  jobId: string
  studentId: string
  studentName: string | null
  status: string
  appliedAt: string
  updatedAt: string
}

interface RawAppliedJobSummary {
  id: string
  collegeId: string
  company: string
  title: string
  location: string
  jobType: string
  status: string
  applicationDeadline: string | null
  applicationLink: string | null
  linkLabel: string | null
}

interface RawApplicationWithJob extends RawApplication {
  job: RawAppliedJobSummary | null
}

function toJobType(value: string): JobType {
  return value === 'Off-Campus' ? 'Off-Campus' : 'In-Campus'
}

function toJobStatus(value: string): CampusJobStatus {
  if (value === 'published' || value === 'closed') return value
  return 'draft'
}

function toApplicationStatus(value: string): ApplicationStatus {
  if (value === 'Under Review' || value === 'Shortlisted' || value === 'Rejected') return value
  return 'Applied'
}

function normalizeJob(raw: RawJob): CampusJob {
  return {
    id: raw.id,
    company: raw.company,
    title: raw.title,
    description: raw.description ?? '',
    jobType: toJobType(raw.jobType),
    collegeId: raw.collegeId,
    eligibility: raw.eligibility ?? '',
    branches: Array.isArray(raw.branches) ? raw.branches : [],
    minCgpa: Number(raw.minCgpa ?? 0),
    allowedBacklogs: Number(raw.allowedBacklogs ?? 0),
    package: raw.package ?? '',
    location: raw.location ?? '',
    applicationDeadline: raw.applicationDeadline ?? '',
    driveDate: raw.driveDate ?? '',
    driveTime: raw.driveTime ?? '',
    driveVenue: raw.driveVenue ?? '',
    status: toJobStatus(raw.status),
    createdAt: raw.createdAt,
    postedBy: raw.postedBy ?? null,
    applicationLink: raw.applicationLink ?? undefined,
    linkLabel: raw.linkLabel ?? undefined,
  }
}

function normalizeApplication(raw: RawApplication): CampusApplication {
  return {
    id: raw.id,
    jobId: raw.jobId,
    studentId: raw.studentId,
    studentName: raw.studentName ?? null,
    appliedAt: raw.appliedAt,
    updatedAt: raw.updatedAt,
    status: toApplicationStatus(raw.status),
  }
}

function normalizeAppliedJobSummary(raw: RawAppliedJobSummary): AppliedJobSummary {
  return {
    id: raw.id,
    collegeId: raw.collegeId,
    company: raw.company,
    title: raw.title,
    location: raw.location,
    jobType: toJobType(raw.jobType),
    status: toJobStatus(raw.status),
    applicationDeadline: raw.applicationDeadline ?? null,
    applicationLink: raw.applicationLink ?? null,
    linkLabel: raw.linkLabel ?? null,
  }
}

function normalizeApplicationWithJob(raw: RawApplicationWithJob): CampusApplicationWithJob {
  return {
    ...normalizeApplication(raw),
    job: raw.job ? normalizeAppliedJobSummary(raw.job) : null,
  }
}

export async function listJobs(accessToken: string): Promise<CampusJob[]> {
  if (accessToken === PRESENTATION_TOKEN) {
    return DEMO_OFFICER_CAMPUS_JOBS
  }
  const rows = await apiRequest<RawJob[]>('/api/jobs', { accessToken })
  return rows.map(normalizeJob)
}

export async function createJob(
  accessToken: string,
  payload: CampusJobInput,
  publish: boolean,
): Promise<CampusJob> {
  const row = await apiRequest<RawJob>('/api/jobs', {
    method: 'POST',
    accessToken,
    body: { ...payload, status: publish ? 'published' : 'draft' },
  })
  return normalizeJob(row)
}

export async function updateJob(
  accessToken: string,
  jobId: string,
  payload: CampusJobInput,
): Promise<CampusJob> {
  const row = await apiRequest<RawJob>(`/api/jobs/${jobId}`, {
    method: 'PATCH',
    accessToken,
    body: payload,
  })
  return normalizeJob(row)
}

export async function publishJob(accessToken: string, jobId: string): Promise<CampusJob> {
  const row = await apiRequest<RawJob>(`/api/jobs/${jobId}/publish`, {
    method: 'POST',
    accessToken,
  })
  return normalizeJob(row)
}

export async function closeJob(accessToken: string, jobId: string): Promise<CampusJob> {
  const row = await apiRequest<RawJob>(`/api/jobs/${jobId}/close`, {
    method: 'POST',
    accessToken,
  })
  return normalizeJob(row)
}

export async function applyToJob(
  accessToken: string,
  jobId: string,
): Promise<CampusApplication> {
  const row = await apiRequest<RawApplication>(`/api/jobs/${jobId}/applications`, {
    method: 'POST',
    accessToken,
  })
  return normalizeApplication(row)
}

export async function listMyApplications(
  accessToken: string,
): Promise<CampusApplicationWithJob[]> {
  const rows = await apiRequest<RawApplicationWithJob[]>('/api/applications/me', { accessToken })
  return rows.map(normalizeApplicationWithJob)
}

export async function withdrawApplication(accessToken: string, applicationId: string): Promise<void> {
  await apiRequest<void>(`/api/applications/${applicationId}`, {
    method: 'DELETE',
    accessToken,
  })
}

export async function listCollegeApplications(
  accessToken: string,
): Promise<CampusApplicationWithJob[]> {
  if (accessToken === PRESENTATION_TOKEN) {
    return DEMO_OFFICER_APPLICATIONS
  }
  const rows = await apiRequest<RawApplicationWithJob[]>('/api/applications', { accessToken })
  return rows.map(normalizeApplicationWithJob)
}

export async function updateApplicationStatus(
  accessToken: string,
  applicationId: string,
  status: ApplicationStatus,
): Promise<CampusApplication> {
  if (accessToken === PRESENTATION_TOKEN) {
    const app = DEMO_OFFICER_APPLICATIONS.find(a => a.id === applicationId) || DEMO_OFFICER_APPLICATIONS[0]
    return {
      id: app.id,
      jobId: app.jobId,
      studentId: app.studentId,
      studentName: app.studentName,
      appliedAt: app.appliedAt,
      updatedAt: new Date().toISOString(),
      status,
    }
  }
  const row = await apiRequest<RawApplication>(`/api/applications/${applicationId}`, {
    method: 'PATCH',
    accessToken,
    body: { status },
  })
  return normalizeApplication(row)
}
