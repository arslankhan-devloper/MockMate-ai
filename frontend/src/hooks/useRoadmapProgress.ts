import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  getRoadmapProgress,
  setRoadmapTopicCompletion,
  type RoadmapProgressEntry,
} from '../lib/roadmap'
import type { RoadmapDomainId } from '../data/roadmap/types'
import { progressKey } from '../data/roadmap/progress'

type CompletedMap = Record<string, string>

export interface UseRoadmapProgress {
  completedKeys: ReadonlySet<string>
  completedAt: Readonly<CompletedMap>
  loading: boolean
  loaded: boolean
  error: string | null
  mutationError: string | null
  pendingKeys: ReadonlySet<string>
  /** True only when the server progress has loaded successfully. */
  ready: boolean
  reload: () => void
  clearMutationError: () => void
  setCompleted: (
    domainId: RoadmapDomainId,
    topicId: string,
    completed: boolean,
  ) => Promise<boolean>
}

function describeLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 403) return 'Roadmap progress is available only to student accounts.'
    if (err.status === 503) return 'Roadmap progress is not available yet. The server is not fully configured.'
    if (err.status === 404) {
      return 'Roadmap progress is not available yet. Apply the roadmap migration and try again.'
    }
    return err.message
  }
  return 'Could not load your roadmap progress. Please try again.'
}

function describeSaveError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Progress was not saved.'
    if (err.status === 403) return 'You do not have permission to change roadmap progress.'
    if (err.status === 404 && err.code === 'profile_not_found') {
      return 'Your student profile could not be found. Progress was not saved.'
    }
    return err.message
  }
  return 'Could not save your roadmap progress. Your previous state was restored.'
}

function mapEntries(entries: RoadmapProgressEntry[]): CompletedMap {
  const map: CompletedMap = {}
  for (const entry of entries) {
    map[progressKey(entry.domainId, entry.topicId)] = entry.completedAt
  }
  return map
}

// Loads persisted topic completion and exposes an optimistic toggle.
//
// A failed mutation restores only the affected key, so unrelated updates are
// never rolled back. If the initial load fails, study material stays visible and
// the page can disable completion controls until the student retries.
export function useRoadmapProgress(): UseRoadmapProgress {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [completedAt, setCompletedAt] = useState<CompletedMap>({})
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set())
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken) {
      setCompletedAt({})
      setLoading(false)
      setLoaded(false)
      setError(null)
      setMutationError(null)
      return
    }

    let active = true
    const controller = new AbortController()
    setLoading(true)
    setLoaded(false)
    setError(null)
    setMutationError(null)

    getRoadmapProgress(accessToken, controller.signal)
      .then((result) => {
        if (!active) return
        setCompletedAt(mapEntries(result.progress))
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (!active) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(describeLoadError(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, nonce])

  const completedKeys = useMemo(
    () => new Set(Object.keys(completedAt)),
    [completedAt],
  )

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const clearMutationError = useCallback(() => setMutationError(null), [])

  const setCompleted = useCallback(
    async (domainId: RoadmapDomainId, topicId: string, completed: boolean): Promise<boolean> => {
      if (!accessToken) {
        setMutationError('You are not signed in.')
        return false
      }
      if (!loaded || error) {
        setMutationError('Roadmap progress is not available until it reloads successfully.')
        return false
      }

      const key = progressKey(domainId, topicId)
      if (pendingKeys.has(key)) return false

      const previous = completedAt[key]
      setMutationError(null)
      setPendingKeys((current) => new Set(current).add(key))
      setCompletedAt((current) => {
        const next = { ...current }
        if (completed) next[key] = new Date().toISOString()
        else delete next[key]
        return next
      })

      try {
        await setRoadmapTopicCompletion(accessToken, domainId, topicId, completed)
        return true
      } catch (err) {
        setCompletedAt((current) => {
          const next = { ...current }
          if (previous) next[key] = previous
          else delete next[key]
          return next
        })
        setMutationError(describeSaveError(err))
        return false
      } finally {
        setPendingKeys((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    },
    [accessToken, completedAt, error, loaded, pendingKeys],
  )

  return {
    completedKeys,
    completedAt,
    loading,
    loaded,
    error,
    mutationError,
    pendingKeys,
    ready: loaded && !error,
    reload,
    clearMutationError,
    setCompleted,
  }
}
