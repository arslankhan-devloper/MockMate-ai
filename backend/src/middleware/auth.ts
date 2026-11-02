import type { NextFunction, Request, Response } from 'express'
import { createUserClient, getSupabaseClient } from '../services/supabase.js'
import type { AppRole, ApprovalStatus } from '../types/auth.js'

function unauthorized(res: Response, message: string): void {
  res.status(401).json({ error: message })
}

// Verify a Supabase access token and build the request's authorization context.
//
// Token verification is delegated to Supabase Auth (`auth.getUser`), which
// checks the signature, issuer and expiry server-side. Role and college are
// then read from the `profiles` table through a client scoped to the caller's
// own token, so Row Level Security applies and the values are never taken from
// the request body or query string.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    res.status(503).json({ error: 'Authentication service is not configured' })
    return
  }

  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    unauthorized(res, 'Missing bearer token')
    return
  }

  const accessToken = header.slice('Bearer '.length).trim()
  if (!accessToken) {
    unauthorized(res, 'Missing bearer token')
    return
  }

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    unauthorized(res, 'Invalid or expired access token')
    return
  }

  const userClient = createUserClient(accessToken)
  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('role, college_id, approval_status, rejection_reason')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) {
    res.status(500).json({ error: 'Failed to load authorization context' })
    return
  }

  const role: AppRole =
    profile?.role === 'super_admin'
      ? 'super_admin'
      : profile?.role === 'placement-officer'
      ? 'placement-officer'
      : 'student'

  const approvalStatus: ApprovalStatus | null =
    (profile?.approval_status as ApprovalStatus) ||
    (role === 'student' || role === 'super_admin' ? 'approved' : 'pending')

  const rejectionReason = typeof profile?.rejection_reason === 'string' ? profile.rejection_reason : null
  const collegeId = typeof profile?.college_id === 'string' ? profile.college_id : null

  req.auth = {
    userId: data.user.id,
    email: data.user.email ?? null,
    role,
    approvalStatus,
    rejectionReason,
    collegeId,
    accessToken,
  }
  req.supabase = userClient

  next()
}

// Restrict a route to one or more roles. Must run after `requireAuth`.
export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      unauthorized(res, 'Not authenticated')
      return
    }

    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    // If an officer is accessing an officer route, their account must be approved.
    if (req.auth.role === 'placement-officer' && req.auth.approvalStatus !== 'approved') {
      res.status(403).json({
        error: `Officer account is ${req.auth.approvalStatus ?? 'pending'} approval`,
        code:
          req.auth.approvalStatus === 'suspended'
            ? 'officer_suspended'
            : req.auth.approvalStatus === 'rejected'
            ? 'officer_rejected'
            : 'officer_not_approved',
        status: req.auth.approvalStatus,
        rejectionReason: req.auth.rejectionReason,
      })
      return
    }

    next()
  }
}

// Super admin specific guard shorthand
export const requireAdmin = requireRole('super_admin')

// Ensure the caller belongs to a college. College-scoped handlers should always
// filter by `req.auth.collegeId`, never by a client-supplied college id.
export function requireCollegeMembership(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    unauthorized(res, 'Not authenticated')
    return
  }

  // Super admin has global oversight and is not tied to a single college
  if (req.auth.role === 'super_admin') {
    return next()
  }

  if (!req.auth.collegeId) {
    res.status(403).json({ error: 'No college is assigned to this account' })
    return
  }

  next()
}
