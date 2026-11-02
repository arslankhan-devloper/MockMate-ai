import type { Request, Response } from 'express'
import { getSupabaseAdminClient, getSupabaseClient } from '../services/supabase.js'
import { recordAuditLog } from '../services/audit.service.js'
import { sendError } from '../utils/http.js'

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress ?? null
}

export async function listPublicCollegesHandler(_req: Request, res: Response): Promise<void> {
  const client = getSupabaseAdminClient() ?? getSupabaseClient()
  if (!client) {
    sendError(res, 503, 'service_unavailable', 'Database service is not configured')
    return
  }

  try {
    const { data, error } = await client
      .from('colleges')
      .select('id, name, slug')
      .order('name', { ascending: true })

    if (error) {
      sendError(res, 500, 'colleges_fetch_failed', error.message)
      return
    }

    res.status(200).json(data ?? [])
  } catch (err) {
    console.error('[officerAuth.colleges] Failed to load colleges:', err)
    sendError(res, 500, 'colleges_error', 'Failed to retrieve colleges')
  }
}

export async function officerRegisterHandler(req: Request, res: Response): Promise<void> {
  const adminClient = getSupabaseAdminClient()
  if (!adminClient) {
    sendError(res, 503, 'service_unavailable', 'Authentication service is not configured for registration')
    return
  }

  const {
    fullName,
    email,
    password,
    phone,
    collegeId,
    designation,
    department,
  } = req.body ?? {}

  // 1. Validate inputs
  if (typeof fullName !== 'string' || !fullName.trim()) {
    sendError(res, 400, 'invalid_name', 'Full name is required')
    return
  }
  if (typeof email !== 'string' || !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    sendError(res, 400, 'invalid_email', 'A valid official email address is required')
    return
  }
  if (typeof password !== 'string' || password.length < 8) {
    sendError(res, 400, 'invalid_password', 'Password must be at least 8 characters long')
    return
  }
  if (typeof collegeId !== 'string' || !collegeId.trim()) {
    sendError(res, 400, 'invalid_college', 'Please select a valid college')
    return
  }
  if (typeof designation !== 'string' || !designation.trim()) {
    sendError(res, 400, 'invalid_designation', 'Official designation is required')
    return
  }

  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = fullName.trim()
  const normalizedCollegeId = collegeId.trim()
  const normalizedDesignation = designation.trim()
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : null
  const normalizedDepartment = typeof department === 'string' ? department.trim() : null

  // 2. Verify college exists
  const { data: college, error: collegeError } = await adminClient
    .from('colleges')
    .select('id, name')
    .eq('id', normalizedCollegeId)
    .maybeSingle()

  if (collegeError || !college) {
    sendError(res, 404, 'college_not_found', 'Selected college does not exist')
    return
  }

  try {
    // 3. Create auth user with Supabase Admin Auth
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: normalizedName,
        requested_role: 'placement-officer',
      },
    })

    if (authError) {
      if (
        authError.message.toLowerCase().includes('already registered') ||
        authError.message.toLowerCase().includes('already exists')
      ) {
        sendError(res, 409, 'email_exists', 'An account with this email address already exists')
        return
      }
      sendError(res, 500, 'auth_create_failed', authError.message)
      return
    }

    if (!authData.user) {
      sendError(res, 500, 'auth_create_failed', 'User creation failed to return a user id')
      return
    }

    const userId = authData.user.id

    // 4. Upsert profile with role = 'placement-officer' and approval_status = 'pending'
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: userId,
        email: normalizedEmail,
        full_name: normalizedName,
        phone: normalizedPhone,
        college_id: normalizedCollegeId,
        role: 'placement-officer',
        approval_status: 'pending',
        rejection_reason: null,
        designation: normalizedDesignation,
        department: normalizedDepartment,
      })

    if (profileError) {
      console.error('[officerAuth.register] Profile upsert failed:', profileError)
      // Cleanup created auth user if profile setup fails
      await adminClient.auth.admin.deleteUser(userId).catch(() => {})
      sendError(res, 500, 'profile_creation_failed', 'Failed to configure placement officer profile')
      return
    }

    // 5. Record Audit Log
    await recordAuditLog({
      actorId: userId,
      actorRole: 'placement-officer',
      action: 'officer_registration_submitted',
      targetType: 'officer',
      targetId: userId,
      metadata: {
        email: normalizedEmail,
        fullName: normalizedName,
        collegeId: normalizedCollegeId,
        collegeName: college.name,
        designation: normalizedDesignation,
      },
      ipAddress: getClientIp(req),
    })

    res.status(201).json({
      success: true,
      message: 'Officer application submitted successfully. Your account is pending Super Admin approval.',
      officer: {
        id: userId,
        email: normalizedEmail,
        fullName: normalizedName,
        collegeId: normalizedCollegeId,
        collegeName: college.name,
        approvalStatus: 'pending',
      },
    })
  } catch (err) {
    console.error('[officerAuth.register] Unhandled registration error:', err)
    sendError(res, 500, 'registration_failed', 'An unexpected error occurred during officer registration')
  }
}
