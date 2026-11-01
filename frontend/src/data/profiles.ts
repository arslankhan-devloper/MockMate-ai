// Profile form data model.
//
// Persisted fields (name, phone, branch, graduation year, designation,
// department) are loaded from and saved to the backend profile API. Two fields
// are read-only: `email` (owned by the auth account) and `collegeName` (college
// membership is assigned by an administrator, not entered by the user, and
// scopes In-Campus drives).
//
// No demo identities, colleges or accounts are seeded. Each signed-in role has
// a single, generic account whose details start completely empty and are only
// populated from the account or if the user completes their profile.

export type Role = 'student' | 'placement-officer'

export interface ProfileData {
  fullName: string
  email: string
  phone: string
  // College/institution name. Assigned by an administrator and shown read-only.
  // Scopes In-Campus drives. Not seeded — empty until assigned.
  collegeName: string
  // Student fields
  branch: string
  gradYear: string
  // Officer fields
  designation: string
  department: string
}

export type ProfileStatus = 'incomplete' | 'skipped' | 'complete'

export interface ProfileState {
  status: ProfileStatus
  // Set once the user skips or saves, so the setup step is not forced again
  // during the same session.
  dismissed: boolean
  data: ProfileData
}

// All profile fields start empty (never fabricated).
export function emptyProfileData(): ProfileData {
  return {
    fullName: '',
    email: '',
    phone: '',
    collegeName: '',
    branch: '',
    gradYear: '',
    designation: '',
    department: '',
  }
}

// One empty profile per role. No names, colleges or records are pre-filled.
export function initialProfiles(): Record<Role, ProfileState> {
  return {
    student: { status: 'incomplete', dismissed: false, data: emptyProfileData() },
    'placement-officer': { status: 'incomplete', dismissed: false, data: emptyProfileData() },
  }
}
