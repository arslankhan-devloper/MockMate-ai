import type { AppRole } from '../types/auth.js'

// Columns a client is allowed to change, and for which role. Role and college
// membership are deliberately absent: they are protected by the
// `profiles_enforce_immutable_fields` trigger and can only be changed by an
// administrator using the service role.
interface FieldSpec {
  column: string
  maxLength: number
  required: boolean
  roles: AppRole[]
}

const FIELD_SPECS: Record<string, FieldSpec> = {
  fullName: { column: 'full_name', maxLength: 120, required: true, roles: ['student', 'placement-officer'] },
  phone: { column: 'phone', maxLength: 32, required: false, roles: ['student', 'placement-officer'] },
  branch: { column: 'branch', maxLength: 80, required: false, roles: ['student'] },
  gradYear: { column: 'grad_year', maxLength: 20, required: false, roles: ['student'] },
  designation: { column: 'designation', maxLength: 120, required: false, roles: ['placement-officer'] },
  department: { column: 'department', maxLength: 120, required: false, roles: ['placement-officer'] },
}

// Fields a client might try to send that are owned by the database or an
// administrator. They are rejected explicitly so a "silent ignore" can never
// mask a client-side bug or an attempted privilege change.
const PROTECTED_FIELDS = new Set([
  'id',
  'role',
  'collegeId',
  'collegeName',
  'email',
  'createdAt',
  'updatedAt',
])

export type ProfilePatch = Record<string, string | null>

export type ValidationResult =
  | { ok: true; value: ProfilePatch }
  | { ok: false; message: string; fields: Record<string, string> }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Validate and normalise a PATCH /api/profile body against the caller's role.
// Returns a map of database column -> value, containing only approved columns.
export function validateProfileUpdate(body: unknown, role: AppRole): ValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object.', fields: {} }
  }

  const fields: Record<string, string> = {}
  const patch: ProfilePatch = {}

  for (const [key, raw] of Object.entries(body)) {
    if (PROTECTED_FIELDS.has(key)) {
      fields[key] = 'This field is managed by the system and cannot be changed here.'
      continue
    }

    const spec = FIELD_SPECS[key]
    if (!spec) {
      fields[key] = 'Unknown field.'
      continue
    }

    if (!spec.roles.includes(role)) {
      fields[key] = 'This field is not part of your profile.'
      continue
    }

    if (raw !== null && typeof raw !== 'string') {
      fields[key] = 'Must be a string or null.'
      continue
    }

    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    const value = trimmed.length > 0 ? trimmed : null

    if (value === null && spec.required) {
      fields[key] = 'This field is required.'
      continue
    }

    if (value !== null && value.length > spec.maxLength) {
      fields[key] = `Must be at most ${spec.maxLength} characters.`
      continue
    }

    patch[spec.column] = value
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }

  return { ok: true, value: patch }
}
