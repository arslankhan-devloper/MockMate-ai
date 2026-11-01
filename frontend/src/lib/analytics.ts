import type {
  InterviewAnalyticsGroup,
  InterviewAnalyticsTotals,
} from './interviews'

export interface AnalyticsHighlights {
  strongest: InterviewAnalyticsGroup
  weakest: InterviewAnalyticsGroup
}

/** Completed share of all sessions in range; null when no sessions exist. */
export function completionRate(totals: InterviewAnalyticsTotals | null): number | null {
  if (!totals || totals.sessions <= 0) return null
  return Math.round((totals.completed / totals.sessions) * 100)
}

/**
 * Compare only areas that have at least one real evaluated answer. With fewer
 * than two scored areas there is nothing meaningful to compare.
 */
export function pickScoreHighlights(
  groups: InterviewAnalyticsGroup[],
): AnalyticsHighlights | null {
  const scored = groups.filter(
    (group) => group.averageScore !== null && group.evaluatedAnswers > 0,
  )
  if (scored.length < 2) return null

  const sorted = [...scored].sort(
    (a, b) =>
      (b.averageScore ?? 0) - (a.averageScore ?? 0) ||
      b.evaluatedAnswers - a.evaluatedAnswers ||
      a.label.localeCompare(b.label),
  )
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]
  if (strongest.key === weakest.key) return null

  return { strongest, weakest }
}
