import type { AnalyticsDashboard } from './analyticsDashboard'
import type { InterviewAnalyticsRange } from './interviews'

// Presentation helpers for the analytics dashboard.
//
// Deliberately free of network access and browser APIs at module scope so the
// whole file can be unit-tested under plain Node. The one function that touches
// `window` guards for its absence.

/** Percentage out of 0–100 with one decimal, or "—" when there is no data. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 10) / 10}%`
}

/** Score out of 100, one decimal, or "—" when unscored. */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 10) / 10}`
}

/** Counts render as a plain number; `null` means the module is unavailable. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US')
}

/** "1m 40s" style duration; null when no duration was recorded. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—'
  }
  const whole = Math.round(seconds)
  if (whole < 60) return `${whole}s`
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

/**
 * Direction of the second half of a series against the first. Returns null
 * unless the earlier half carries at least one record, so a missing period is
 * never rendered as a fake 0% change.
 */
export function trendDelta(
  values: readonly number[],
): { direction: 'up' | 'down' | 'flat'; deltaPercent: number } | null {
  if (values.length < 2) return null
  const half = Math.floor(values.length / 2)
  const previous = values.slice(0, half).reduce((sum, value) => sum + value, 0)
  const recent = values.slice(half).reduce((sum, value) => sum + value, 0)
  if (previous <= 0) return null
  const deltaPercent = Math.round(((recent - previous) / previous) * 1000) / 10
  const direction = deltaPercent > 0 ? 'up' : deltaPercent < 0 ? 'down' : 'flat'
  return { direction, deltaPercent }
}

/** True only when every module the overview would render is empty. */
export function dashboardIsEmpty(data: AnalyticsDashboard | null): boolean {
  if (!data) return false
  // Read each module directly so an unavailable module counts as absent, and an
  // in-progress session still counts as activity.
  return (
    data.interviews.totals.sessions === 0 &&
    (data.practice?.sessionsAttempted ?? 0) === 0 &&
    (data.dsa?.submissions ?? 0) === 0 &&
    (data.coding?.attempts ?? 0) === 0 &&
    (data.roadmap?.topicsCompleted ?? 0) === 0 &&
    (data.applications?.total ?? 0) === 0
  )
}

/** Which modules are available but currently hold no data. */
export function emptyModules(data: AnalyticsDashboard): string[] {
  const names: string[] = []
  if (data.availability.interviews && data.interviews.totals.sessions === 0) {
    names.push('Interviews')
  }
  if (data.practice && data.practice.sessionsAttempted === 0) names.push('Practice Hub')
  if (data.dsa && data.dsa.submissions === 0) names.push('DSA')
  if (data.coding && data.coding.attempts === 0) names.push('Coding Round')
  if (data.roadmap && data.roadmap.topicsCompleted === 0) names.push('Roadmap')
  if (data.applications && data.applications.total === 0) names.push('Placement')
  return names
}

/** Human label for a stored verdict / status token. */
export function humanizeToken(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'Unknown'
  const upper = trimmed.toUpperCase()
  if (upper === 'HR' || upper === 'DSA' || upper === 'MCQ') return upper
  return trimmed.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

/** Mirrors the backend rule so officers know they are reading aggregates. */
export function scopeLabel(scope: 'student' | 'college'): string {
  return scope === 'college' ? 'College-wide aggregates' : 'Your activity'
}

/** Age of a timestamp in whole minutes, for "updated 2m ago" style hints. */
export function minutesSince(iso: string, now: number = Date.now()): number | null {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  const diff = now - time
  if (diff < 0) return 0
  return Math.floor(diff / 60000)
}

/** Human label for the selected date range. */
export function rangeLabel(range: InterviewAnalyticsRange): string {
  switch (range) {
    case '1w':
      return 'Last 7 days'
    case '1m':
      return 'Last 30 days'
    case '3m':
      return 'Last 90 days'
    default:
      return 'All time'
  }
}

/** Window event a data-writing module fires so a mounted dashboard re-fetches. */
export const ANALYTICS_UPDATED_EVENT = 'mockmate:analytics-updated'

/**
 * Ask the analytics dashboard to re-fetch. Called after practice completion,
 * DSA submission, interview end and job application. Cheap and idempotent: with
 * no dashboard mounted there is simply no listener.
 */
export function notifyAnalyticsUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ANALYTICS_UPDATED_EVENT))
}
