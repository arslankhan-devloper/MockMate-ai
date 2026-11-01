import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  getInterviewAnalytics,
  type InterviewAnalytics,
  type InterviewAnalyticsRange,
} from '../lib/interviews'

export interface UseInterviewAnalytics {
  data: InterviewAnalytics | null
  loading: boolean
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

// Loads the caller's aggregated interview analytics. The access token comes from
// the verified session; the backend decides the scope (own sessions vs college).
// A stale response is discarded and the in-flight request is aborted when the
// token or range changes, so switching ranges can never show mismatched data.
export function useInterviewAnalytics(
  range: InterviewAnalyticsRange = 'all',
): UseInterviewAnalytics {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [data, setData] = useState<InterviewAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    getInterviewAnalytics(accessToken, range, controller.signal)
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(describeError(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, range, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  // Interview sessions and answer evaluations are saved on other screens. When
  // that happens, refresh in the background so analytics never shows stale
  // numbers after a report is completed or an answer is evaluated.
  useEffect(() => {
    const handleUpdate = () => setNonce((n) => n + 1)
    window.addEventListener('mockmate:interview-updated', handleUpdate)
    return () => window.removeEventListener('mockmate:interview-updated', handleUpdate)
  }, [])

  return { data, loading, error, reload }
}
