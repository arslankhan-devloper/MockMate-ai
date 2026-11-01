import type { Request, Response } from 'express'
import {
  getCollegeName,
  getOwnProfile,
  mapProfileRow,
  updateOwnProfile,
  type ProfileRow,
} from '../services/profile.service.js'
import { sendError } from '../utils/http.js'
import { validateProfileUpdate } from '../utils/validation.js'

// GET /api/profile — return the authenticated caller's own profile.
export async function getProfile(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const { data, error } = await getOwnProfile(client, auth.userId)

  if (error) {
    sendError(res, 500, 'profile_read_failed', 'Could not load your profile.')
    return
  }

  if (!data) {
    sendError(res, 404, 'profile_not_found', 'No profile exists for this account yet.')
    return
  }

  const row = data as unknown as ProfileRow
  const collegeName = row.college_id ? await getCollegeName(client, row.college_id) : null

  res.status(200).json(mapProfileRow(row, collegeName, auth.role))
}

// PATCH /api/profile — update the authenticated caller's own profile.
// Only fields approved for the caller's role are written; role and college
// membership can never be changed here.
export async function patchProfile(req: Request, res: Response): Promise<void> {
  const auth = req.auth
  const client = req.supabase
  if (!auth || !client) {
    sendError(res, 401, 'not_authenticated', 'Authentication is required.')
    return
  }

  const parsed = validateProfileUpdate(req.body, auth.role)
  if (!parsed.ok) {
    sendError(res, 400, 'validation_error', parsed.message, { fields: parsed.fields })
    return
  }

  if (Object.keys(parsed.value).length === 0) {
    sendError(res, 400, 'empty_update', 'No updatable fields were provided.')
    return
  }

  const { data, error } = await updateOwnProfile(client, auth.userId, parsed.value)

  if (error) {
    const message = error.message ?? ''
    // The immutability trigger rejects any attempt to change role/college.
    if (/not permitted|administrator/i.test(message)) {
      sendError(res, 403, 'immutable_field', 'Role and college membership cannot be changed here.')
      return
    }
    sendError(res, 500, 'profile_update_failed', 'Could not save your profile.')
    return
  }

  if (!data) {
    // No row matched (none exists, or RLS denied the write).
    sendError(res, 404, 'profile_not_found', 'No profile exists for this account yet.')
    return
  }

  const row = data as unknown as ProfileRow
  const collegeName = row.college_id ? await getCollegeName(client, row.college_id) : null

  res.status(200).json(mapProfileRow(row, collegeName, auth.role))
}
