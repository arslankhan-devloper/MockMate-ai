import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRole } from '../types/auth.js'

// Columns that may be read for a profile. Kept explicit so an accidental `*`
// never leaks future internal columns to clients.
export const PROFILE_COLUMNS =
  'id, role, college_id, full_name, email, phone, branch, grad_year, ' +
  'designation, department, created_at, updated_at'

export interface ProfileRow {
  id: string
  role: string | null
  college_id: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  branch: string | null
  grad_year: string | null
  designation: string | null
  department: string | null
  created_at: string
  updated_at: string
}

export interface ProfileResponse {
  id: string
  role: AppRole
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

export function mapProfileRow(
  row: ProfileRow,
  collegeName: string | null,
  fallbackRole: AppRole,
): ProfileResponse {
  return {
    id: row.id,
    role: row.role === 'placement-officer' ? 'placement-officer' : fallbackRole,
    collegeId: row.college_id ?? null,
    collegeName,
    fullName: row.full_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    branch: row.branch ?? null,
    gradYear: row.grad_year ?? null,
    designation: row.designation ?? null,
    department: row.department ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Read the caller's own profile through the token-scoped client, so the
// `profiles_select_self_or_officer` RLS policy applies and only the caller's row
// is reachable.
export async function getOwnProfile(client: SupabaseClient, userId: string) {
  return client.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle()
}

// Update the caller's own profile. `patch` only ever contains columns approved
// by the validator (never `role` or `college_id`). The `.eq('id', userId)` plus
// RLS guarantees a user can only ever update their own row.
export async function updateOwnProfile(
  client: SupabaseClient,
  userId: string,
  patch: Record<string, string | null>,
) {
  return client
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle()
}

// Resolve a college name for display. RLS only permits a student to read their
// own college and an officer to read colleges, so this cannot expose others.
export async function getCollegeName(
  client: SupabaseClient,
  collegeId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('colleges')
    .select('name')
    .eq('id', collegeId)
    .maybeSingle()

  if (error || !data) return null
  return typeof data.name === 'string' ? data.name : null
}
