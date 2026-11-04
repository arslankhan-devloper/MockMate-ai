import type { Request, Response } from 'express'
import { getOwnProfile } from '../services/profile.service.js'
import {
  createApplication,
  createJob,
  findApplication,
  getJob,
  isUniqueViolation,
  listApplicationsForJob,
  listJobs,
  mapApplicationRow,
  mapJobRow,
  todayISO,
  updateJob,
  type ApplicationRow,
  type JobRow,
} from '../services/jobs.service.js'
import { sendError } from '../utils/http.js'
import { getServiceWriteClient } from '../utils/serviceWriteClient.js'
import {
  publishErrorsFromRow,
  validateJobCreate,
  validateJobUpdate,
} from '../utils/jobValidation.js'

// Express 5 may type route params as string | string[]; this API only accepts a
// single id segment.
function routeId(req: Request): string {
  const raw = req.params.id
  return typeof raw === 'string' ? raw : ''
}

// GET /api/jobs — students see published jobs; officers see their college's jobs.
export async function listJobsHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const { data, error } = await listJobs(client, auth.role, auth.collegeId)
  if (error) {
    sendError(res, 500, 'jobs_read_failed', 'Could not load jobs.')
    return
  }

  const rows = (data ?? []) as unknown as JobRow[]
  res.status(200).json(rows.map(mapJobRow))
}

// GET /api/jobs/:id — RLS decides whether the caller may see this job.
export async function getJobHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const jobId = routeId(req)
  if (!jobId) {
    sendError(res, 400, 'invalid_id', 'A job id is required.')
    return
  }

  const { data, error } = await getJob(client, jobId)
  if (error) {
    sendError(res, 500, 'job_read_failed', 'Could not load the job.')
    return
  }
  if (!data) {
    sendError(res, 404, 'job_not_found', 'Job not found.')
    return
  }

  res.status(200).json(mapJobRow(data as unknown as JobRow))
}

// POST /api/jobs — placement officers create jobs for their own college.
// `college_id` and `posted_by` always come from the verified auth context.
export async function createJobHandler(req: Request, res: Response): Promise<void> {
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
  const mode =
    typeof body === 'object' && body !== null && (body as Record<string, unknown>).status === 'published'
      ? 'publish'
      : 'draft'

  const parsed = validateJobCreate(body, mode)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  parsed.value.college_id = auth.collegeId
  parsed.value.posted_by = auth.userId

  const { data, error } = await createJob(client, parsed.value)
  if (error) {
    if (error.code === '42501') {
      sendError(res, 403, 'forbidden', 'You cannot create jobs for this college.')
      return
    }
    if (error.code === '23514') {
      sendError(res, 400, 'validation_error', 'One or more values are not allowed.')
      return
    }
    sendError(res, 500, 'job_create_failed', 'Could not create the job.')
    return
  }

  res.status(201).json(mapJobRow(data as unknown as JobRow))
}

// PATCH /api/jobs/:id — edit a job belonging to the caller's college.
// Scope and status changes cannot be made through this endpoint.
export async function updateJobHandler(req: Request, res: Response): Promise<void> {
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

  const parsed = validateJobUpdate(req.body)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  const jobId = routeId(req)
  if (!jobId) {
    sendError(res, 400, 'invalid_id', 'A job id is required.')
    return
  }

  const { data, error } = await updateJob(client, jobId, auth.collegeId, parsed.value)
  if (error) {
    if (error.code === '42501') {
      sendError(res, 403, 'forbidden', 'You cannot edit this job.')
      return
    }
    if (error.code === '23514') {
      sendError(res, 400, 'validation_error', 'One or more values are not allowed.')
      return
    }
    sendError(res, 500, 'job_update_failed', 'Could not save the job.')
    return
  }
  if (!data) {
    sendError(res, 404, 'job_not_found', 'Job not found for your college.')
    return
  }

  res.status(200).json(mapJobRow(data as unknown as JobRow))
}

async function loadOwnedJob(req: Request, res: Response): Promise<JobRow | null> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return null
  }
  if (!auth.collegeId) {
    sendError(res, 403, 'no_college', 'No college is assigned to this account.')
    return null
  }

  const jobId = routeId(req)
  if (!jobId) {
    sendError(res, 400, 'invalid_id', 'A job id is required.')
    return null
  }

  const { data, error } = await getJob(client, jobId)
  if (error) {
    sendError(res, 500, 'job_read_failed', 'Could not load the job.')
    return null
  }
  if (!data) {
    sendError(res, 404, 'job_not_found', 'Job not found.')
    return null
  }

  const row = data as unknown as JobRow
  if (row.college_id !== auth.collegeId) {
    sendError(res, 404, 'job_not_found', 'Job not found for your college.')
    return null
  }

  return row
}

// POST /api/jobs/:id/publish — validate completeness and publish.
export async function publishJobHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const job = await loadOwnedJob(req, res)
  if (!job) return

  if (job.status !== 'published') {
    const fields = publishErrorsFromRow(job)
    if (Object.keys(fields).length > 0) {
      sendError(res, 400, 'job_incomplete', 'Complete the required fields before publishing.', {
        fields,
      })
      return
    }

    const { data, error } = await updateJob(client, job.id, auth.collegeId as string, {
      status: 'published',
    })
    if (error || !data) {
      sendError(res, 500, 'job_publish_failed', 'Could not publish the job.')
      return
    }

    res.status(200).json(mapJobRow(data as unknown as JobRow))
    return
  }

  res.status(200).json(mapJobRow(job))
}

// POST /api/jobs/:id/close — stop accepting applications.
export async function closeJobHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const job = await loadOwnedJob(req, res)
  if (!job) return

  if (job.status === 'closed') {
    res.status(200).json(mapJobRow(job))
    return
  }

  const { data, error } = await updateJob(client, job.id, auth.collegeId as string, {
    status: 'closed',
  })
  if (error || !data) {
    sendError(res, 500, 'job_close_failed', 'Could not close the job.')
    return
  }

  res.status(200).json(mapJobRow(data as unknown as JobRow))
}

function normalizeBranch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// POST /api/jobs/:id/applications — a student applies to an internal job.
export async function applyToJobHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }
  if (auth.role !== 'student') {
    sendError(res, 403, 'forbidden', 'Only students can apply to jobs.')
    return
  }

  const jobId = routeId(req)
  if (!jobId) {
    sendError(res, 400, 'invalid_id', 'A job id is required.')
    return
  }

  const { data: jobData, error: jobError } = await getJob(client, jobId)
  if (jobError) {
    sendError(res, 500, 'job_read_failed', 'Could not load the job.')
    return
  }
  if (!jobData) {
    sendError(res, 404, 'job_not_found', 'Job not found.')
    return
  }

  const job = jobData as unknown as JobRow
  if (job.status !== 'published') {
    sendError(res, 409, 'job_not_open', 'This job is not accepting applications.')
    return
  }
  if (!job.application_deadline || job.application_deadline < todayISO()) {
    sendError(res, 409, 'application_closed', 'The application deadline has passed.')
    return
  }
  if (job.application_link) {
    sendError(
      res,
      422,
      'external_application_required',
      'This job uses an external application link. Apply through the employer.',
    )
    return
  }
  if (job.job_type === 'In-Campus') {
    if (job.college_id !== auth.collegeId) {
      sendError(res, 403, 'not_eligible_college', 'This job is only open to your college.')
      return
    }
    if (auth.collegeVerificationStatus === 'pending' || auth.collegeVerificationStatus === 'rejected') {
      sendError(
        res,
        403,
        'college_verification_required',
        auth.collegeVerificationStatus === 'rejected'
          ? `Your college verification was rejected: ${auth.collegeVerificationReason ?? 'Contact your placement officer'}`
          : 'Your college enrollment verification is pending approval by your placement officer.',
        { fields: { verificationStatus: auth.collegeVerificationStatus } },
      )
      return
    }
  }

  const { data: profileData, error: profileError } = await getOwnProfile(client, auth.userId)
  if (profileError) {
    sendError(res, 500, 'profile_read_failed', 'Could not load your profile.')
    return
  }
  if (!profileData) {
    sendError(res, 409, 'profile_incomplete', 'Complete your profile before applying.')
    return
  }

  const profile = profileData as unknown as {
    full_name: string | null
    branch: string | null
  }

  const branches = Array.isArray(job.branches) ? job.branches : []
  const branch = profile.branch?.trim() ?? ''
  if (
    branches.length > 0 &&
    branch &&
    !branches.some((candidate) => normalizeBranch(candidate) === normalizeBranch(branch))
  ) {
    sendError(res, 403, 'not_eligible_branch', 'Your branch is not eligible for this job.')
    return
  }

  const { data: existing, error: existingError } = await findApplication(
    client,
    job.id,
    auth.userId,
  )
  if (existingError) {
    sendError(res, 500, 'application_read_failed', 'Could not check your applications.')
    return
  }
  if (existing) {
    sendError(res, 409, 'already_applied', 'You have already applied to this job.')
    return
  }

  const writer = getServiceWriteClient(req)
  if (!writer) {
    sendError(res, 503, 'write_unavailable', 'Application storage is not configured.')
    return
  }

  const { data, error } = await createApplication(writer, {
    job_id: job.id,
    student_id: auth.userId,
    student_name: profile.full_name ?? null,
    status: 'Applied',
  })

  if (error) {
    if (isUniqueViolation(error)) {
      sendError(res, 409, 'already_applied', 'You have already applied to this job.')
      return
    }
    if (error.code === '42501') {
      sendError(res, 403, 'not_eligible', 'You are not eligible to apply to this job.')
      return
    }
    sendError(res, 500, 'application_create_failed', 'Could not submit your application.')
    return
  }

  res.status(201).json(mapApplicationRow(data as unknown as ApplicationRow))
}

// GET /api/jobs/:id/applications — officers list applicants for their own job.
export async function listJobApplicationsHandler(req: Request, res: Response): Promise<void> {
  const job = await loadOwnedJob(req, res)
  if (!job) return

  const client = req.supabase
  if (!client) return

  const { data, error } = await listApplicationsForJob(client, job.id)
  if (error) {
    sendError(res, 500, 'applications_read_failed', 'Could not load applicants.')
    return
  }

  const rows = (data ?? []) as unknown as ApplicationRow[]
  res.status(200).json(rows.map(mapApplicationRow))
}
