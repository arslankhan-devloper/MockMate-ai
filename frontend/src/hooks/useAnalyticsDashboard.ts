import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  getAnalyticsDashboard,
  type AnalyticsDashboard,
} from '../lib/analyticsDashboard'
import { ANALYTICS_UPDATED_EVENT } from '../lib/analyticsFormat'
import type { InterviewAnalyticsRange } from '../lib/interviews'

export interface UseAnalyticsDashboard {
  data: AnalyticsDashboard | null
  loading: boolean
  refreshing: boolean
  error: string | null
  reload: () => void
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 403) return 'You do not have access to this analytics view.'
    if (err.status === 503) return 'Analytics is not available yet. The server is not fully configured.'
    return err.message
  }
  return 'Could not load analytics. Please try again.'
}

// Loads the caller's unified analytics dashboard. Identity and scope come from
// the verified session; the backend decides whether the caller sees their own
// rows or their college's aggregates.
//
// A stale response is discarded (abort) and an in-flight request is cancelled
// when the range changes or the component unmounts. Any module mutation fires
// `mockmate:analytics-updated`, which silently re-fetches without blanking the
// page — the old numbers stay visible until fresh ones arrive.
export function useAnalyticsDashboard(range: InterviewAnalyticsRange): UseAnalyticsDashboard {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const hasDataRef = useRef(false)
  hasDataRef.current = data !== null

  const reload = useCallback(() => {
    setNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!accessToken) {
      setData(null)
      setLoading(false)
      setRefreshing(false)
      setError('Your session has expired. Please sign in again.')
      return
    }

    const controller = new AbortController()
    let active = true
    const background = hasDataRef.current
    if (background) setRefreshing(true)
    else setLoading(true)
    setError(null)

    getAnalyticsDashboard(accessToken, range, controller.signal)
      .then((payload) => {
        if (!active || controller.signal.aborted) return
        setData(payload)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return
        // AbortError surface as a DOMException; nothing to report.
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(describeError(err))
      })
      .finally(() => {
        if (!active || controller.signal.aborted) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, range, nonce])

  useEffect(() => {
    const handleUpdate = () => reload()
    window.addEventListener(ANALYTICS_UPDATED_EVENT, handleUpdate)
    return () => window.removeEventListener(ANALYTICS_UPDATED_EVENT, handleUpdate)
  }, [reload])

  return { data, loading, refreshing, error, reload }
}
