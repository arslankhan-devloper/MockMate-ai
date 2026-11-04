import type { Request, Response } from 'express'
import { getSupabaseAdminClient } from '../services/supabase.js'
import { recordAuditLog, fetchAuditLogs } from '../services/audit.service.js'
import { sendError } from '../utils/http.js'
import { JOB_COLUMNS, APPLICATION_COLUMNS, type JobRow, type ApplicationRow } from '../services/jobs.service.js'

function getAdminClient(res: Response, req?: Request) {
  if (req?.supabaseWrite !== undefined) {
    return req.supabaseWrite
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    sendError(res, 503, 'service_unavailable', 'Database admin service is not configured')
    return null
  }
  return client
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress ?? null
}

function getParam(req: Request, name: string): string {
  const val = req.params[name]
  if (typeof val === 'string') return val
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0]
  return ''
}

// ============================================================================
// 1. DASHBOARD & ANALYTICS
// ============================================================================

export async function getAdminDashboardHandler(_req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  try {
    const [
      studentsRes,
      collegesRes,
      officersRes,
      pendingOfficersRes,
      approvedOfficersRes,
      suspendedOfficersRes,
      rejectedOfficersRes,
      totalDrivesRes,
      activeDrivesRes,
      totalApplicationsRes,
      applicationsStatusRes,
      recentActivityRes,
    ] = await Promise.all([
      client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
      client.from('colleges').select('id', { count: 'exact', head: true }),
      client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'placement-officer'),
      client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'placement-officer').eq('approval_status', 'pending'),
      client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'placement-officer').eq('approval_status', 'approved'),
      client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'placement-officer').eq('approval_status', 'suspended'),
      client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'placement-officer').eq('approval_status', 'rejected'),
      client.from('campus_jobs').select('id', { count: 'exact', head: true }),
      client.from('campus_jobs').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      client.from('job_applications').select('id', { count: 'exact', head: true }),
      client.from('job_applications').select('status'),
      fetchAuditLogs({ limit: 10 }),
    ])

    // Calculate application status breakdown
    const appStatusCounts: Record<string, number> = {
      Applied: 0,
      'Under Review': 0,
      Shortlisted: 0,
      Rejected: 0,
    }
    if (applicationsStatusRes.data) {
      for (const app of applicationsStatusRes.data) {
        if (app.status && typeof appStatusCounts[app.status] === 'number') {
          appStatusCounts[app.status]++
        }
      }
    }

    res.status(200).json({
      metrics: {
        totalStudents: studentsRes.count ?? 0,
        totalColleges: collegesRes.count ?? 0,
        totalOfficers: officersRes.count ?? 0,
        pendingOfficers: pendingOfficersRes.count ?? 0,
        approvedOfficers: approvedOfficersRes.count ?? 0,
        suspendedOfficers: suspendedOfficersRes.count ?? 0,
        rejectedOfficers: rejectedOfficersRes.count ?? 0,
        totalDrives: totalDrivesRes.count ?? 0,
        activeDrives: activeDrivesRes.count ?? 0,
        totalApplications: totalApplicationsRes.count ?? 0,
      },
      applicationsByStatus: appStatusCounts,
      recentActivity: recentActivityRes.logs,
    })
  } catch (err) {
    console.error('[admin.dashboard] Failed to build dashboard metrics:', err)
    sendError(res, 500, 'dashboard_failed', 'Failed to retrieve admin dashboard metrics')
  }
}

// ============================================================================
// 2. COLLEGE MANAGEMENT
// ============================================================================

export async function listAdminCollegesHandler(_req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  try {
    const { data: colleges, error } = await client
      .from('colleges')
      .select('id, name, slug, status, created_at')
      .order('name', { ascending: true })

    if (error) {
      sendError(res, 500, 'colleges_fetch_failed', error.message)
      return
    }

    // Load student and officer counts per college
    const { data: profiles } = await client
      .from('profiles')
      .select('college_id, role, approval_status')
      .not('college_id', 'is', null)

    const counts: Record<string, { students: number; officers: number; pendingOfficers: number }> = {}
    for (const p of profiles ?? []) {
      if (!p.college_id) continue
      if (!counts[p.college_id]) {
        counts[p.college_id] = { students: 0, officers: 0, pendingOfficers: 0 }
      }
      if (p.role === 'student') {
        counts[p.college_id].students++
      } else if (p.role === 'placement-officer') {
        if (p.approval_status === 'pending') {
          counts[p.college_id].pendingOfficers++
        } else if (p.approval_status === 'approved') {
          counts[p.college_id].officers++
        }
      }
    }

    const result = (colleges ?? []).map(c => ({
      ...c,
      status: c.status ?? 'active',
      studentCount: counts[c.id]?.students ?? 0,
      officerCount: counts[c.id]?.officers ?? 0,
      pendingOfficerCount: counts[c.id]?.pendingOfficers ?? 0,
    }))

    res.status(200).json(result)
  } catch (err) {
    console.error('[admin.colleges] Failed to list colleges:', err)
    sendError(res, 500, 'colleges_error', 'Failed to load colleges')
  }
}

export async function createCollegeHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const { name, slug } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim()) {
    sendError(res, 400, 'invalid_name', 'College name is required')
    return
  }

  const normalizedName = name.trim()
  const normalizedSlug = (typeof slug === 'string' && slug.trim()
    ? slug.trim()
    : normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  )

  const { data, error } = await client
    .from('colleges')
    .insert({
      name: normalizedName,
      slug: normalizedSlug,
      status: 'active',
    })
    .select('id, name, slug, status, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      sendError(res, 409, 'slug_conflict', 'A college with this identifier already exists')
      return
    }
    sendError(res, 500, 'create_failed', error.message)
    return
  }

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'college_created',
    targetType: 'college',
    targetId: data.id,
    metadata: { name: data.name, slug: data.slug },
    ipAddress: getClientIp(req),
  })

  res.status(201).json(data)
}

export async function updateCollegeHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const collegeId = getParam(req, 'id')
  if (!collegeId) {
    sendError(res, 400, 'invalid_id', 'College ID is required')
    return
  }

  const { name, status } = req.body ?? {}
  const patch: Record<string, unknown> = {}

  if (typeof name === 'string' && name.trim()) {
    patch.name = name.trim()
  }
  if (status === 'active' || status === 'inactive') {
    patch.status = status
  }

  if (Object.keys(patch).length === 0) {
    sendError(res, 400, 'empty_patch', 'No valid updates provided')
    return
  }

  const { data, error } = await client
    .from('colleges')
    .update(patch)
    .eq('id', collegeId)
    .select('id, name, slug, status, created_at')
    .maybeSingle()

  if (error) {
    sendError(res, 500, 'update_failed', error.message)
    return
  }
  if (!data) {
    sendError(res, 404, 'not_found', 'College not found')
    return
  }

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'college_updated',
    targetType: 'college',
    targetId: collegeId,
    metadata: patch,
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

// ============================================================================
// 3. PLACEMENT OFFICER MANAGEMENT
// ============================================================================

export async function listOfficersHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null
    const searchFilter = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : null

    let query = client
      .from('profiles')
      .select('id, email, full_name, phone, role, approval_status, rejection_reason, college_id, designation, department, created_at, updated_at')
      .eq('role', 'placement-officer')
      .order('created_at', { ascending: false })

    if (statusFilter && ['pending', 'approved', 'rejected', 'suspended'].includes(statusFilter)) {
      query = query.eq('approval_status', statusFilter)
    }

    const { data: officers, error } = await query
    if (error) {
      sendError(res, 500, 'officers_fetch_failed', error.message)
      return
    }

    // Attach college names
    const { data: colleges } = await client.from('colleges').select('id, name')
    const collegeMap = new Map((colleges ?? []).map(c => [c.id, c.name]))

    let result = (officers ?? []).map(o => ({
      ...o,
      approval_status: o.approval_status ?? 'approved',
      collegeName: o.college_id ? collegeMap.get(o.college_id) ?? 'Unknown College' : 'Unassigned',
    }))

    if (searchFilter) {
      result = result.filter(
        o =>
          (o.full_name && o.full_name.toLowerCase().includes(searchFilter)) ||
          (o.email && o.email.toLowerCase().includes(searchFilter)) ||
          (o.collegeName && o.collegeName.toLowerCase().includes(searchFilter))
      )
    }

    res.status(200).json(result)
  } catch (err) {
    console.error('[admin.officers] Failed to list officers:', err)
    sendError(res, 500, 'officers_error', 'Failed to retrieve officers')
  }
}

export async function approveOfficerHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const officerId = getParam(req, 'id')
  if (!officerId) {
    sendError(res, 400, 'invalid_id', 'Officer ID is required')
    return
  }

  const { collegeId } = req.body ?? {}
  const patch: Record<string, unknown> = {
    approval_status: 'approved',
    rejection_reason: null,
  }

  if (typeof collegeId === 'string' && collegeId.trim()) {
    patch.college_id = collegeId.trim()
  }

  const { data: currentOfficer } = await client
    .from('profiles')
    .select('id, email, full_name, college_id')
    .eq('id', officerId)
    .eq('role', 'placement-officer')
    .maybeSingle()

  if (!currentOfficer) {
    sendError(res, 404, 'not_found', 'Placement officer not found')
    return
  }

  const { data, error } = await client
    .from('profiles')
    .update(patch)
    .eq('id', officerId)
    .select('id, email, full_name, approval_status, college_id')
    .single()

  if (error) {
    sendError(res, 500, 'approval_failed', error.message)
    return
  }

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'officer_approved',
    targetType: 'officer',
    targetId: officerId,
    metadata: {
      officerEmail: currentOfficer.email,
      officerName: currentOfficer.full_name,
      assignedCollegeId: data.college_id,
    },
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

export async function rejectOfficerHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const officerId = getParam(req, 'id')
  if (!officerId) {
    sendError(res, 400, 'invalid_id', 'Officer ID is required')
    return
  }

  const { reason } = req.body ?? {}
  const rejectionReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Application rejected by Super Admin'

  const { data: currentOfficer } = await client
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', officerId)
    .eq('role', 'placement-officer')
    .maybeSingle()

  if (!currentOfficer) {
    sendError(res, 404, 'not_found', 'Placement officer not found')
    return
  }

  const { data, error } = await client
    .from('profiles')
    .update({
      approval_status: 'rejected',
      rejection_reason: rejectionReason,
    })
    .eq('id', officerId)
    .select('id, email, full_name, approval_status, rejection_reason')
    .single()

  if (error) {
    sendError(res, 500, 'rejection_failed', error.message)
    return
  }

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'officer_rejected',
    targetType: 'officer',
    targetId: officerId,
    metadata: {
      officerEmail: currentOfficer.email,
      officerName: currentOfficer.full_name,
      reason: rejectionReason,
    },
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

export async function suspendOfficerHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const officerId = getParam(req, 'id')
  if (!officerId) {
    sendError(res, 400, 'invalid_id', 'Officer ID is required')
    return
  }

  const { reason } = req.body ?? {}
  const suspensionReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Account suspended by administrator'

  const { data, error } = await client
    .from('profiles')
    .update({
      approval_status: 'suspended',
      rejection_reason: suspensionReason,
    })
    .eq('id', officerId)
    .eq('role', 'placement-officer')
    .select('id, email, full_name, approval_status, rejection_reason')
    .maybeSingle()

  if (error) {
    sendError(res, 500, 'suspension_failed', error.message)
    return
  }
  if (!data) {
    sendError(res, 404, 'not_found', 'Placement officer not found')
    return
  }

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'officer_suspended',
    targetType: 'officer',
    targetId: officerId,
    metadata: { reason: suspensionReason },
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

export async function reactivateOfficerHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const officerId = getParam(req, 'id')
  if (!officerId) {
    sendError(res, 400, 'invalid_id', 'Officer ID is required')
    return
  }

  const { data, error } = await client
    .from('profiles')
    .update({
      approval_status: 'approved',
      rejection_reason: null,
    })
    .eq('id', officerId)
    .eq('role', 'placement-officer')
    .select('id, email, full_name, approval_status')
    .maybeSingle()

  if (error) {
    sendError(res, 500, 'reactivation_failed', error.message)
    return
  }
  if (!data) {
    sendError(res, 404, 'not_found', 'Placement officer not found')
    return
  }

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'officer_reactivated',
    targetType: 'officer',
    targetId: officerId,
    metadata: {},
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

export async function assignOfficerCollegeHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const officerId = getParam(req, 'id')
  const { collegeId } = req.body ?? {}
  if (!officerId || typeof collegeId !== 'string' || !collegeId.trim()) {
    sendError(res, 400, 'invalid_input', 'Officer ID and valid College ID are required')
    return
  }

  // Verify college exists
  const { data: college } = await client
    .from('colleges')
    .select('id, name')
    .eq('id', collegeId.trim())
    .maybeSingle()

  if (!college) {
    sendError(res, 404, 'college_not_found', 'Selected college does not exist')
    return
  }

  const { data, error } = await client
    .from('profiles')
    .update({ college_id: collegeId.trim() })
    .eq('id', officerId)
    .eq('role', 'placement-officer')
    .select('id, email, full_name, college_id')
    .maybeSingle()

  if (error) {
    sendError(res, 500, 'assignment_failed', error.message)
    return
  }
  if (!data) {
    sendError(res, 404, 'not_found', 'Placement officer not found')
    return
  }

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'officer_college_reassigned',
    targetType: 'officer',
    targetId: officerId,
    metadata: { newCollegeId: collegeId, collegeName: college.name },
    ipAddress: getClientIp(req),
  })

  res.status(200).json({ ...data, collegeName: college.name })
}

// ============================================================================
// 4. STUDENT MANAGEMENT
// ============================================================================

export async function listStudentsHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  try {
    const collegeId = typeof req.query.collegeId === 'string' ? req.query.collegeId : null
    const branch = typeof req.query.branch === 'string' ? req.query.branch : null
    const verificationStatus = typeof req.query.verificationStatus === 'string' ? req.query.verificationStatus : null
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : null

    let query = client
      .from('profiles')
      .select('id, email, full_name, phone, branch, grad_year, college_id, roll_number, college_verification_status, college_verification_reason, verified_by, verified_at, created_at, updated_at')
      .eq('role', 'student')
      .order('created_at', { ascending: false })

    if (collegeId) {
      query = query.eq('college_id', collegeId)
    }
    if (branch) {
      query = query.eq('branch', branch)
    }
    if (verificationStatus && ['pending', 'verified', 'rejected'].includes(verificationStatus)) {
      query = query.eq('college_verification_status', verificationStatus)
    }

    const { data: students, error } = await query
    if (error) {
      sendError(res, 500, 'students_fetch_failed', error.message)
      return
    }

    const { data: colleges } = await client.from('colleges').select('id, name')
    const collegeMap = new Map((colleges ?? []).map(c => [c.id, c.name]))

    // Application counts per student
    const { data: applications } = await client.from('job_applications').select('student_id, status')
    const appCountMap = new Map<string, number>()
    for (const app of applications ?? []) {
      appCountMap.set(app.student_id, (appCountMap.get(app.student_id) ?? 0) + 1)
    }

    let result = (students ?? []).map(s => ({
      ...s,
      collegeName: s.college_id ? collegeMap.get(s.college_id) ?? 'Unknown College' : 'Unassigned',
      applicationCount: appCountMap.get(s.id) ?? 0,
    }))

    if (search) {
      result = result.filter(
        s =>
          (s.full_name && s.full_name.toLowerCase().includes(search)) ||
          (s.email && s.email.toLowerCase().includes(search)) ||
          (s.collegeName && s.collegeName.toLowerCase().includes(search)) ||
          (s.branch && s.branch.toLowerCase().includes(search)) ||
          (s.roll_number && s.roll_number.toLowerCase().includes(search))
      )
    }

    res.status(200).json(result)
  } catch (err) {
    console.error('[admin.students] Failed to list students:', err)
    sendError(res, 500, 'students_error', 'Failed to retrieve students')
  }
}

export async function getStudentDetailsHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const studentId = getParam(req, 'id')
  if (!studentId) {
    sendError(res, 400, 'invalid_id', 'Student ID is required')
    return
  }

  try {
    const { data: profile, error } = await client
      .from('profiles')
      .select('id, email, full_name, phone, branch, grad_year, college_id, roll_number, college_verification_status, college_verification_reason, verified_by, verified_at, created_at, updated_at')
      .eq('id', studentId)
      .eq('role', 'student')
      .maybeSingle()

    if (error) {
      sendError(res, 500, 'student_fetch_failed', error.message)
      return
    }
    if (!profile) {
      sendError(res, 404, 'not_found', 'Student profile not found')
      return
    }

    let collegeName = 'Unassigned'
    if (profile.college_id) {
      const { data: college } = await client
        .from('colleges')
        .select('name')
        .eq('id', profile.college_id)
        .maybeSingle()
      if (college) collegeName = college.name
    }

    // Load student's applications
    const { data: applications } = await client
      .from('job_applications')
      .select('id, job_id, status, applied_at, campus_jobs(company, title, job_type, package)')
      .eq('student_id', studentId)
      .order('applied_at', { ascending: false })

    // Load interview stats
    const { data: interviews } = await client
      .from('interview_sessions')
      .select('id, interview_type, overall_score, status, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })

    res.status(200).json({
      profile: {
        ...profile,
        collegeName,
      },
      applications: applications ?? [],
      interviews: interviews ?? [],
    })
  } catch (err) {
    console.error('[admin.students] Failed to get student details:', err)
    sendError(res, 500, 'student_details_error', 'Failed to retrieve student details')
  }
}

export async function updateStudentCollegeHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const studentId = getParam(req, 'id')
  const { collegeId } = req.body ?? {}

  const targetCollegeId = typeof collegeId === 'string' && collegeId.trim() ? collegeId.trim() : null

  if (targetCollegeId) {
    const { data: col } = await client.from('colleges').select('id, name').eq('id', targetCollegeId).maybeSingle()
    if (!col) {
      sendError(res, 404, 'college_not_found', 'Selected college does not exist')
      return
    }
  }

  const { data, error } = await client
    .from('profiles')
    .update({ college_id: targetCollegeId })
    .eq('id', studentId)
    .eq('role', 'student')
    .select('id, email, full_name, college_id')
    .maybeSingle()

  if (error) {
    sendError(res, 500, 'update_failed', error.message)
    return
  }
  if (!data) {
    sendError(res, 404, 'not_found', 'Student not found')
    return
  }

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'student_college_assigned',
    targetType: 'student',
    targetId: studentId,
    metadata: { collegeId: targetCollegeId },
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

export async function verifyAdminStudentHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res, req)
  if (!client) return

  const studentId = getParam(req, 'id')
  if (!studentId) {
    sendError(res, 400, 'invalid_id', 'Student ID is required')
    return
  }

  try {
    const { data: student, error: fetchErr } = await client
      .from('profiles')
      .select('id, email, full_name, college_id, roll_number, college_verification_status')
      .eq('id', studentId)
      .eq('role', 'student')
      .maybeSingle()

    if (fetchErr || !student) {
      sendError(res, 404, 'not_found', 'Student profile not found')
      return
    }

    // If student has college and roll number, verify uniqueness
    if (student.college_id && student.roll_number && student.roll_number.trim()) {
      const cleanRoll = student.roll_number.trim().toLowerCase()
      const { data: duplicates } = await client
        .from('profiles')
        .select('id, roll_number')
        .eq('college_id', student.college_id)
        .eq('role', 'student')
        .eq('college_verification_status', 'verified')
        .neq('id', studentId)

      const hasDuplicate = (duplicates ?? []).some(
        s => s.roll_number && s.roll_number.trim().toLowerCase() === cleanRoll
      )

      if (hasDuplicate) {
        sendError(
          res,
          409,
          'duplicate_roll_number',
          `Roll number '${student.roll_number}' is already verified for another student in this college.`
        )
        return
      }
    }

    const now = new Date().toISOString()
    const { data: updated, error: updateErr } = await client
      .from('profiles')
      .update({
        college_verification_status: 'verified',
        college_verification_reason: null,
        verified_by: req.auth!.userId,
        verified_at: now,
      })
      .eq('id', studentId)
      .select('id, email, full_name, college_id, roll_number, college_verification_status, college_verification_reason, verified_by, verified_at')
      .single()

    if (updateErr || !updated) {
      sendError(res, 500, 'update_failed', updateErr?.message ?? 'Could not verify student')
      return
    }

    await recordAuditLog({
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: 'student_college_verified',
      targetType: 'student',
      targetId: studentId,
      metadata: { collegeId: student.college_id, rollNumber: student.roll_number },
      ipAddress: getClientIp(req),
    })

    res.status(200).json(updated)
  } catch (err) {
    console.error('[admin.students] Failed to verify student:', err)
    sendError(res, 500, 'verification_error', 'Failed to verify student')
  }
}

export async function rejectAdminStudentHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res, req)
  if (!client) return

  const studentId = getParam(req, 'id')
  if (!studentId) {
    sendError(res, 400, 'invalid_id', 'Student ID is required')
    return
  }

  const { reason } = req.body ?? {}
  const rejectionReason = typeof reason === 'string' && reason.trim()
    ? reason.trim()
    : 'Enrollment verification rejected by administrator.'

  try {
    const now = new Date().toISOString()
    const { data: updated, error: updateErr } = await client
      .from('profiles')
      .update({
        college_verification_status: 'rejected',
        college_verification_reason: rejectionReason,
        verified_by: req.auth!.userId,
        verified_at: now,
      })
      .eq('id', studentId)
      .eq('role', 'student')
      .select('id, email, full_name, college_id, roll_number, college_verification_status, college_verification_reason, verified_by, verified_at')
      .single()

    if (updateErr || !updated) {
      sendError(res, 500, 'update_failed', updateErr?.message ?? 'Could not reject student verification')
      return
    }

    await recordAuditLog({
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: 'student_college_rejected',
      targetType: 'student',
      targetId: studentId,
      metadata: { reason: rejectionReason },
      ipAddress: getClientIp(req),
    })

    res.status(200).json(updated)
  } catch (err) {
    console.error('[admin.students] Failed to reject student verification:', err)
    sendError(res, 500, 'rejection_error', 'Failed to reject student verification')
  }
}

// ============================================================================
// 5. PLACEMENT DRIVE MANAGEMENT
// ============================================================================

export async function listAllDrivesHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  try {
    const collegeId = typeof req.query.collegeId === 'string' ? req.query.collegeId : null
    const status = typeof req.query.status === 'string' ? req.query.status : null

    let query = client
      .from('campus_jobs')
      .select(JOB_COLUMNS)
      .order('created_at', { ascending: false })

    if (collegeId) {
      query = query.eq('college_id', collegeId)
    }
    if (status && ['draft', 'published', 'closed'].includes(status)) {
      query = query.eq('status', status)
    }

    const { data: rawDrives, error } = await query
    if (error) {
      sendError(res, 500, 'drives_fetch_failed', error.message)
      return
    }

    const drives = (rawDrives ?? []) as unknown as JobRow[]

    const { data: colleges } = await client.from('colleges').select('id, name')
    const collegeMap = new Map((colleges ?? []).map(c => [c.id, c.name]))

    // Count applications for each drive
    const { data: apps } = await client.from('job_applications').select('job_id')
    const appCounts = new Map<string, number>()
    for (const a of apps ?? []) {
      appCounts.set(a.job_id, (appCounts.get(a.job_id) ?? 0) + 1)
    }

    const result = drives.map(d => ({
      ...d,
      collegeName: collegeMap.get(d.college_id) ?? 'Unknown College',
      applicationCount: appCounts.get(d.id) ?? 0,
    }))

    res.status(200).json(result)
  } catch (err) {
    console.error('[admin.drives] Failed to list drives:', err)
    sendError(res, 500, 'drives_error', 'Failed to retrieve placement drives')
  }
}

export async function createAdminDriveHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const {
    collegeId,
    company,
    title,
    description,
    jobType,
    eligibility,
    branches,
    minCgpa,
    allowedBacklogs,
    package: pkg,
    location,
    applicationDeadline,
    driveDate,
    status,
    applicationLink,
    linkLabel,
  } = req.body ?? {}

  if (!collegeId || !company || !title) {
    sendError(res, 400, 'invalid_input', 'College ID, company, and title are required')
    return
  }

  const { data: rawData, error } = await client
    .from('campus_jobs')
    .insert({
      college_id: collegeId,
      posted_by: req.auth!.userId,
      company: String(company).trim(),
      title: String(title).trim(),
      description: typeof description === 'string' ? description.trim() : '',
      job_type: jobType === 'Off-Campus' ? 'Off-Campus' : 'In-Campus',
      eligibility: typeof eligibility === 'string' ? eligibility.trim() : '',
      branches: Array.isArray(branches) ? branches : [],
      min_cgpa: Number(minCgpa ?? 0),
      allowed_backlogs: Number(allowedBacklogs ?? 0),
      package: typeof pkg === 'string' ? pkg.trim() : '',
      location: typeof location === 'string' ? location.trim() : '',
      application_deadline: applicationDeadline || null,
      drive_date: driveDate || null,
      status: status === 'published' ? 'published' : 'draft',
      application_link: applicationLink || null,
      link_label: linkLabel || null,
    })
    .select(JOB_COLUMNS)
    .single()

  if (error) {
    sendError(res, 500, 'drive_create_failed', error.message)
    return
  }

  const data = rawData as unknown as JobRow

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'drive_created_by_admin',
    targetType: 'placement_drive',
    targetId: data.id,
    metadata: { company: data.company, title: data.title, collegeId },
    ipAddress: getClientIp(req),
  })

  res.status(201).json(data)
}

export async function updateAdminDriveHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const driveId = getParam(req, 'id')
  if (!driveId) {
    sendError(res, 400, 'invalid_id', 'Drive ID is required')
    return
  }

  const {
    collegeId,
    company,
    title,
    description,
    jobType,
    eligibility,
    branches,
    minCgpa,
    allowedBacklogs,
    package: pkg,
    location,
    applicationDeadline,
    driveDate,
    status,
    applicationLink,
    linkLabel,
  } = req.body ?? {}

  const patch: Record<string, unknown> = {}
  if (typeof collegeId === 'string' && collegeId.trim()) patch.college_id = collegeId.trim()
  if (typeof company === 'string' && company.trim()) patch.company = company.trim()
  if (typeof title === 'string' && title.trim()) patch.title = title.trim()
  if (typeof description === 'string') patch.description = description.trim()
  if (jobType === 'In-Campus' || jobType === 'Off-Campus') patch.job_type = jobType
  if (typeof eligibility === 'string') patch.eligibility = eligibility.trim()
  if (Array.isArray(branches)) patch.branches = branches
  if (minCgpa !== undefined) patch.min_cgpa = Number(minCgpa)
  if (allowedBacklogs !== undefined) patch.allowed_backlogs = Number(allowedBacklogs)
  if (typeof pkg === 'string') patch.package = pkg.trim()
  if (typeof location === 'string') patch.location = location.trim()
  if (applicationDeadline !== undefined) patch.application_deadline = applicationDeadline || null
  if (driveDate !== undefined) patch.drive_date = driveDate || null
  if (['draft', 'published', 'closed'].includes(status)) patch.status = status
  if (applicationLink !== undefined) patch.application_link = applicationLink || null
  if (linkLabel !== undefined) patch.link_label = linkLabel || null

  if (Object.keys(patch).length === 0) {
    sendError(res, 400, 'empty_patch', 'No valid drive updates provided')
    return
  }

  const { data: rawData, error } = await client
    .from('campus_jobs')
    .update(patch)
    .eq('id', driveId)
    .select(JOB_COLUMNS)
    .maybeSingle()

  if (error) {
    sendError(res, 500, 'update_failed', error.message)
    return
  }
  if (!rawData) {
    sendError(res, 404, 'not_found', 'Drive not found')
    return
  }

  const data = rawData as unknown as JobRow

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'drive_updated_by_admin',
    targetType: 'placement_drive',
    targetId: driveId,
    metadata: { company: data.company, title: data.title, updates: Object.keys(patch) },
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

export async function closeAdminDriveHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const driveId = getParam(req, 'id')
  if (!driveId) {
    sendError(res, 400, 'invalid_id', 'Drive ID is required')
    return
  }

  const { data: rawData, error } = await client
    .from('campus_jobs')
    .update({ status: 'closed' })
    .eq('id', driveId)
    .select(JOB_COLUMNS)
    .maybeSingle()

  if (error) {
    sendError(res, 500, 'close_failed', error.message)
    return
  }
  if (!rawData) {
    sendError(res, 404, 'not_found', 'Drive not found')
    return
  }

  const data = rawData as unknown as JobRow

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'drive_closed_by_admin',
    targetType: 'placement_drive',
    targetId: driveId,
    metadata: { company: data.company, title: data.title },
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

export async function listDriveApplicationsHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const driveId = getParam(req, 'id')
  if (!driveId) {
    sendError(res, 400, 'invalid_id', 'Drive ID is required')
    return
  }

  const { data, error } = await client
    .from('job_applications')
    .select(APPLICATION_COLUMNS)
    .eq('job_id', driveId)
    .order('applied_at', { ascending: false })

  if (error) {
    sendError(res, 500, 'applications_fetch_failed', error.message)
    return
  }

  res.status(200).json(data ?? [])
}

export async function updateAdminApplicationStatusHandler(req: Request, res: Response): Promise<void> {
  const client = getAdminClient(res)
  if (!client) return

  const driveId = getParam(req, 'id')
  const appId = getParam(req, 'appId')
  const { status } = req.body ?? {}

  if (!driveId || !appId) {
    sendError(res, 400, 'invalid_id', 'Drive ID and Application ID are required')
    return
  }
  if (!['Applied', 'Under Review', 'Shortlisted', 'Rejected'].includes(status)) {
    sendError(res, 400, 'invalid_status', 'Invalid application status')
    return
  }

  const { data: rawData, error } = await client
    .from('job_applications')
    .update({ status })
    .eq('id', appId)
    .eq('job_id', driveId)
    .select(APPLICATION_COLUMNS)
    .maybeSingle()

  if (error) {
    sendError(res, 500, 'update_failed', error.message)
    return
  }
  if (!rawData) {
    sendError(res, 404, 'not_found', 'Application not found for this drive')
    return
  }

  const data = rawData as unknown as ApplicationRow

  await recordAuditLog({
    actorId: req.auth!.userId,
    actorRole: req.auth!.role,
    action: 'application_status_updated_by_admin',
    targetType: 'application',
    targetId: appId,
    metadata: { driveId, newStatus: status, studentId: data.student_id },
    ipAddress: getClientIp(req),
  })

  res.status(200).json(data)
}

// ============================================================================
// 6. AUDIT LOGS
// ============================================================================

export async function listAuditLogsHandler(req: Request, res: Response): Promise<void> {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50
  const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0
  const action = typeof req.query.action === 'string' ? req.query.action : undefined
  const targetType = typeof req.query.targetType === 'string' ? req.query.targetType : undefined

  const result = await fetchAuditLogs({ limit, offset, action, targetType })
  res.status(200).json(result)
}
