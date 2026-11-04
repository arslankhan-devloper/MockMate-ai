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
import { recordAuditLog } from '../services/audit.service.js'

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

function getClientIp(req: Request): string | null {
  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress ?? null
}

// ============================================================================
// OFFICER STUDENT VERIFICATION WORKFLOW
// ============================================================================

// GET /api/applications/students — placement officers list students of their own college
export async function listOfficerStudentsHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  if (!auth) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }
  if (!auth.collegeId) {
    sendError(res, 403, 'no_college', 'No college is assigned to this account.')
    return
  }

  const adminClient = getServiceWriteClient(req)
  if (!adminClient) {
    sendError(res, 503, 'service_unavailable', 'Database service is not configured.')
    return
  }

  try {
    const status = typeof req.query.status === 'string' ? req.query.status : null
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : null

    let query = adminClient
      .from('profiles')
      .select('id, email, full_name, phone, branch, grad_year, college_id, roll_number, college_verification_status, college_verification_reason, verified_by, verified_at, created_at, updated_at')
      .eq('role', 'student')
      .eq('college_id', auth.collegeId)
      .order('created_at', { ascending: false })

    if (status && ['pending', 'verified', 'rejected'].includes(status)) {
      query = query.eq('college_verification_status', status)
    }

    const { data: students, error } = await query
    if (error) {
      sendError(res, 500, 'students_read_failed', error.message)
      return
    }

    let list = students ?? []
    if (search) {
      list = list.filter(
        s =>
          (s.full_name && s.full_name.toLowerCase().includes(search)) ||
          (s.email && s.email.toLowerCase().includes(search)) ||
          (s.branch && s.branch.toLowerCase().includes(search)) ||
          (s.roll_number && s.roll_number.toLowerCase().includes(search))
      )
    }

    res.status(200).json(list)
  } catch (err) {
    console.error('[officer.students] Failed to list students:', err)
    sendError(res, 500, 'students_error', 'Failed to retrieve students.')
  }
}

// POST /api/applications/students/:id/verify — officer verifies student enrollment for their college
export async function verifyOfficerStudentHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  if (!auth) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }
  if (!auth.collegeId) {
    sendError(res, 403, 'no_college', 'No college is assigned to this account.')
    return
  }

  const studentId = routeId(req)
  if (!studentId) {
    sendError(res, 400, 'invalid_id', 'Student ID is required.')
    return
  }

  const adminClient = getServiceWriteClient(req)
  if (!adminClient) {
    sendError(res, 503, 'service_unavailable', 'Database service is not configured.')
    return
  }

  try {
    const { data: student, error: fetchError } = await adminClient
      .from('profiles')
      .select('id, email, full_name, role, college_id, roll_number, college_verification_status')
      .eq('id', studentId)
      .eq('role', 'student')
      .maybeSingle()

    if (fetchError) {
      sendError(res, 500, 'student_read_failed', fetchError.message)
      return
    }
    if (!student) {
      sendError(res, 404, 'not_found', 'Student not found.')
      return
    }

    // Strict college isolation: officer can only verify students of their own college
    if (student.college_id !== auth.collegeId) {
      sendError(res, 403, 'forbidden', 'Student does not belong to your college.')
      return
    }

    // Check duplicate verified roll number within this college
    if (student.roll_number && student.roll_number.trim()) {
      const cleanRoll = student.roll_number.trim().toLowerCase()
      const { data: duplicateList } = await adminClient
        .from('profiles')
        .select('id, roll_number')
        .eq('college_id', auth.collegeId)
        .eq('role', 'student')
        .eq('college_verification_status', 'verified')
        .neq('id', studentId)

      const hasDuplicate = (duplicateList ?? []).some(
        s => s.roll_number && s.roll_number.trim().toLowerCase() === cleanRoll
      )

      if (hasDuplicate) {
        sendError(
          res,
          409,
          'duplicate_roll_number',
          `Roll number '${student.roll_number}' is already verified for another student in your college.`
        )
        return
      }
    }

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await adminClient
      .from('profiles')
      .update({
        college_verification_status: 'verified',
        college_verification_reason: null,
        verified_by: auth.userId,
        verified_at: now,
      })
      .eq('id', studentId)
      .eq('college_id', auth.collegeId)
      .select('id, email, full_name, college_id, roll_number, college_verification_status, college_verification_reason, verified_by, verified_at')
      .single()

    if (updateError || !updated) {
      sendError(res, 500, 'verification_failed', updateError?.message ?? 'Could not verify student.')
      return
    }

    await recordAuditLog({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'student_college_verified',
      targetType: 'student',
      targetId: studentId,
      metadata: { collegeId: auth.collegeId, rollNumber: student.roll_number },
      ipAddress: getClientIp(req),
    })

    res.status(200).json(updated)
  } catch (err) {
    console.error('[officer.students] Verification error:', err)
    sendError(res, 500, 'verification_error', 'An unexpected error occurred during verification.')
  }
}

// POST /api/applications/students/:id/reject — officer rejects student college verification
export async function rejectOfficerStudentHandler(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  if (!auth) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }
  if (!auth.collegeId) {
    sendError(res, 403, 'no_college', 'No college is assigned to this account.')
    return
  }

  const studentId = routeId(req)
  if (!studentId) {
    sendError(res, 400, 'invalid_id', 'Student ID is required.')
    return
  }

  const adminClient = getServiceWriteClient(req)
  if (!adminClient) {
    sendError(res, 503, 'service_unavailable', 'Database service is not configured.')
    return
  }

  try {
    const { data: student, error: fetchError } = await adminClient
      .from('profiles')
      .select('id, email, full_name, role, college_id')
      .eq('id', studentId)
      .eq('role', 'student')
      .maybeSingle()

    if (fetchError) {
      sendError(res, 500, 'student_read_failed', fetchError.message)
      return
    }
    if (!student) {
      sendError(res, 404, 'not_found', 'Student not found.')
      return
    }

    if (student.college_id !== auth.collegeId) {
      sendError(res, 403, 'forbidden', 'Student does not belong to your college.')
      return
    }

    const { reason } = req.body ?? {}
    const rejectionReason = typeof reason === 'string' && reason.trim()
      ? reason.trim()
      : 'Enrollment verification rejected by college placement officer.'

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await adminClient
      .from('profiles')
      .update({
        college_verification_status: 'rejected',
        college_verification_reason: rejectionReason,
        verified_by: auth.userId,
        verified_at: now,
      })
      .eq('id', studentId)
      .eq('college_id', auth.collegeId)
      .select('id, email, full_name, college_id, roll_number, college_verification_status, college_verification_reason, verified_by, verified_at')
      .single()

    if (updateError || !updated) {
      sendError(res, 500, 'rejection_failed', updateError?.message ?? 'Could not reject verification.')
      return
    }

    await recordAuditLog({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'student_college_rejected',
      targetType: 'student',
      targetId: studentId,
      metadata: { collegeId: auth.collegeId, reason: rejectionReason },
      ipAddress: getClientIp(req),
    })

    res.status(200).json(updated)
  } catch (err) {
    console.error('[officer.students] Rejection error:', err)
    sendError(res, 500, 'rejection_error', 'An unexpected error occurred during rejection.')
  }
}
