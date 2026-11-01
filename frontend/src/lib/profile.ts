// Typed client for the authenticated profile endpoints.
//
//   GET   /api/profile  -> the caller's own profile
//   PATCH /api/profile  -> update the caller's own, role-approved fields
//
// Role and college membership are read-only here: the backend rejects any
// attempt to change them and the database enforces it with a trigger.

import { apiRequest } from './api'

export type ProfileRole = 'student' | 'placement-officer'

/** Response shape returned by GET/PATCH /api/profile (camelCase, as sent by the API). */
export interface AccountProfile {
  id: string
  role: ProfileRole
  collegeId: string | null
  collegeName: string | null
  fullName: string | null
  email: string | null
  phone: string | null
  branch: string | null
  gradYear: string | null
  designation: string | null
  department: string | null
  createdAt: string
  updatedAt: string
}

// Only fields the backend accepts. `null` clears an optional field. Role,
// college and email are intentionally absent.
export interface ProfileUpdate {
  fullName?: string | null
  phone?: string | null
  branch?: string | null
  gradYear?: string | null
  designation?: string | null
  department?: string | null
}

export function getMyProfile(accessToken: string): Promise<AccountProfile> {
  return apiRequest<AccountProfile>('/api/profile', { accessToken })
}

export function updateMyProfile(
  accessToken: string,
  patch: ProfileUpdate,
): Promise<AccountProfile> {
  return apiRequest<AccountProfile>('/api/profile', {
    method: 'PATCH',
    accessToken,
    body: patch,
  })
}
