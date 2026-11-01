import type { ProfileData } from '../data/profiles'
import type { InterviewAnalytics } from './interviews'

export interface ProfileFormErrors {
  fullName?: string
  phone?: string
  branch?: string
  gradYear?: string
}

// Mirrors the backend limits in backend/src/utils/validation.ts. Blank
// optional fields are allowed and are sent as null when saved.
export function validateProfileForm(data: ProfileData): ProfileFormErrors {
  const errors: ProfileFormErrors = {}

  if (!data.fullName.trim()) errors.fullName = 'Full name is required.'
  else if (data.fullName.trim().length > 120) errors.fullName = 'Must be at most 120 characters.'

  if (data.phone.trim().length > 32) errors.phone = 'Must be at most 32 characters.'

  if (!data.branch.trim()) errors.branch = 'Branch is required.'
  else if (data.branch.trim().length > 80) errors.branch = 'Must be at most 80 characters.'

  if (!data.gradYear.trim()) errors.gradYear = 'Graduation year is required.'
  else if (data.gradYear.trim().length > 20) errors.gradYear = 'Must be at most 20 characters.'

  return errors
}

export interface ProfileSnapshot {
  sessions: number | null
  completed: number | null
  completionRate: number | null
  averageScore: number | null
  applications: number | null
  applicationStatuses: { status: string; count: number }[]
}

// The profile only shows metrics that the analytics API actually has. Missing
// sources stay null so the UI renders "-" instead of a fabricated zero.
export function profileSnapshot(analytics: InterviewAnalytics | null): ProfileSnapshot | null {
  if (!analytics) return null

  const sessionsAvailable = analytics.availability.sessions
  const totals = analytics.totals
  const completion =
    sessionsAvailable && totals.sessions > 0
      ? Math.round((totals.completed / totals.sessions) * 100)
      : null

  return {
    sessions: sessionsAvailable ? totals.sessions : null,
    completed: sessionsAvailable ? totals.completed : null,
    completionRate: completion,
    averageScore: sessionsAvailable ? totals.averageScore : null,
    applications:
      analytics.availability.applications && analytics.applications
        ? analytics.applications.total
        : null,
    applicationStatuses:
      analytics.availability.applications && analytics.applications
        ? analytics.applications.byStatus
        : [],
  }
}
