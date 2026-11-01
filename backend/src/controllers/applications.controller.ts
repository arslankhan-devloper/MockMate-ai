import type { Request, Response } from 'express'
import {
  deleteOwnApplication,
  getApplicationById,
  getJob,
  listCollegeApplications,
  listOwnApplications,
  mapApplicationRow,
  mapApplicationWithJobRow,
  updateApplicationStatus,
  type ApplicationRow,
  type ApplicationStatus,
  type ApplicationWithJobRow,
  type JobRow,
} from '../services/jobs.service.js'
import { sendError } from '../utils/http.js'
import { validateApplicationStatus } from '../utils/jobValidation.js'
import { getServiceWriteClient } from '../utils/serviceWriteClient.js'

// Express 5 may type route params as string | string[]; this API only accepts a
// single id segment.
function routeId(req: Request): string {
  const raw = req.params.id
  return typeof raw === 'string' ? raw : ''
}

const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  Applied: ['Under Review', 'Shortlisted', 'Rejected'],
  'Under Review': ['Shortlisted', 'Rejected'],
  Shortlisted: ['Under Review', 'Rejected'],
  Rejected: ['Under Review', 'Shortlisted'],
}

// GET /api/applications — officers list every application for their college.
// The college is filtered explicitly from the verified auth context, and RLS
// independently scopes the rows to jobs owned by that college.
export async function listApplicationsHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }
  if (!auth.collegeId) {
    sendError(res, 403, 'no_college', 'No college is assigned to this account.')
    return
  }

  const { data, error } = await listCollegeApplications(client, auth.collegeId)
  if (error) {
    sendError(res, 500, 'applications_read_failed', 'Could not load applications.')
    return
  }

  const rows = (data ?? []) as unknown as ApplicationWithJobRow[]
  res.status(200).json(rows.map(mapApplicationWithJobRow))
}

// GET /api/applications/me — the caller's own applications, including a job
// summary when the job is still visible to the student.
export async function listMyApplicationsHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const { data, error } = await listOwnApplications(client, auth.userId)
  if (error) {
    sendError(res, 500, 'applications_read_failed', 'Could not load your applications.')
    return
  }

  const rows = (data ?? []) as unknown as ApplicationWithJobRow[]
  res.status(200).json(rows.map(mapApplicationWithJobRow))
}

// DELETE /api/applications/:id — withdraw an application. The privileged
// writer always includes the verified caller's `student_id` in the filter.
export async function withdrawApplicationHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const applicationId = routeId(req)
  if (!applicationId) {
    sendError(res, 400, 'invalid_id', 'An application id is required.')
    return
  }

  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Application storage is not configured.')
    return
  }

  const { data, error } = await deleteOwnApplication(writer, applicationId, auth.userId)
  if (error) {
    sendError(res, 500, 'application_withdraw_failed', 'Could not withdraw the application.')
    return
  }
  if (!data) {
    sendError(res, 404, 'application_not_found', 'Application not found.')
    return
  }

  res.status(204).send()
}

// PATCH /api/applications/:id — officers move an applicant between statuses.
// Only the status column is writable, and only for jobs in their own college.
export async function updateApplicationStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }
  if (!auth.collegeId) {
    sendError(res, 403, 'no_college', 'No college is assigned to this account.')
    return
  }

  const body: unknown = req.body
  const status = typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>).status
    : undefined

  if (!validateApplicationStatus(status)) {
    sendError(res, 400, 'validation_error', 'Invalid application status.', {
      fields: { status: 'Status must be Applied, Under Review, Shortlisted or Rejected.' },
    })
    return
  }

  const applicationId = routeId(req)
  if (!applicationId) {
    sendError(res, 400, 'invalid_id', 'An application id is required.')
    return
  }

  const { data: applicationData, error: applicationError } = await getApplicationById(
    client,
    applicationId,
  )
  if (applicationError) {
    sendError(res, 500, 'application_read_failed', 'Could not load the application.')
    return
  }
  if (!applicationData) {
    sendError(res, 404, 'application_not_found', 'Application not found.')
    return
  }

  const application = applicationData as unknown as ApplicationRow

  const { data: jobData, error: jobError } = await getJob(client, application.job_id)
  if (jobError) {
    sendError(res, 500, 'job_read_failed', 'Could not load the job.')
    return
  }
  if (!jobData) {
    sendError(res, 404, 'job_not_found', 'Job not found.')
    return
  }

  const job = jobData as unknown as JobRow
  if (job.college_id !== auth.collegeId) {
    sendError(res, 404, 'job_not_found', 'Job not found for your college.')
    return
  }

  const current = mapApplicationRow(application).status
  if (current === status) {
    res.status(200).json(mapApplicationRow(application))
    return
  }

  if (!ALLOWED_TRANSITIONS[current].includes(status)) {
    sendError(
      res,
      400,
      'invalid_transition',
      `Cannot move an application from ${current} to ${status}.`,
    )
    return
  }

  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Application storage is not configured.')
    return
  }

  const { data, error } = await updateApplicationStatus(
    writer,
    application.id,
    job.id,
    current,
    status,
  )
  if (error) {
    sendError(res, 500, 'application_update_failed', 'Could not update the application.')
    return
  }
  if (!data) {
    sendError(
      res,
      409,
      'application_changed',
      'The application changed while it was being updated. Reload and try again.',
    )
    return
  }

  res.status(200).json(mapApplicationRow(data as unknown as ApplicationRow))
}
