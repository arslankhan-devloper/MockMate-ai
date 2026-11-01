import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { listExternalJobs } from '../lib/externalJobs'
import type { ExternalJob, ExternalJobsResult, ExternalProvider } from '../data/externalJobs'

export interface ExternalJobsFilters {
  query: string
  country: string
  employmentType: string
  seniority: string
  page: number
}

const initialFilters: ExternalJobsFilters = {
  query: '',
  country: 'in',
  employmentType: '',
  seniority: '',
  page: 1,
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 503) {
      return 'External jobs are not available yet. The server is not fully configured.'
    }
    return err.message
  }
  return 'Could not load external jobs. Please try again.'
}

export interface UseExternalJobs {
  jobs: ExternalJob[]
  providers: ExternalProvider[]
  data: ExternalJobsResult | null
  loading: boolean
  loaded: boolean
  error: string | null
  filters: ExternalJobsFilters
  search: (filters: Omit<ExternalJobsFilters, 'page'>) => void
  setPage: (page: number) => void
  reload: () => void
}

export function useExternalJobs(): UseExternalJobs {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [filters, setFilters] = useState<ExternalJobsFilters>(initialFilters)
  const [data, setData] = useState<ExternalJobsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken) {
      setData(null)
      setLoading(false)
      setLoaded(false)
      setError(null)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    listExternalJobs(accessToken, filters)
      .then(result => {
        if (active) setData(result)
      })
      .catch(err => {
        if (active) setError(describeError(err))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setLoaded(true)
      })

    return () => {
      active = false
    }
  }, [accessToken, filters, nonce])

  const search = useCallback((next: Omit<ExternalJobsFilters, 'page'>) => {
    setFilters({ ...next, page: 1 })
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters(previous => ({ ...previous, page }))
  }, [])

  const reload = useCallback(() => setNonce(value => value + 1), [])

  return {
    jobs: data?.jobs ?? [],
    providers: data?.providers ?? [],
    data,
    loading,
    loaded,
    error,
    filters,
    search,
    setPage,
    reload,
  }
}
