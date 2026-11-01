import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  generateRoadmapPlan as requestRoadmapPlan,
  getRoadmapPlan,
} from '../lib/roadmap'
import type { RoadmapPlan, RoadmapResumeContext } from '../data/roadmap/plan'

export interface UseRoadmapPlan {
  plan: RoadmapPlan | null
  generatedAt: string | null
  loading: boolean
  generating: boolean
  error: string | null
  storageAvailable: boolean
  persisted: boolean
  reload: () => void
  clearError: () => void
  generate: (context: RoadmapResumeContext | null) => Promise<boolean>
}

function describeLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 403) return 'AI roadmap plans are available only to student accounts.'
    if (err.status === 404) return 'The AI roadmap API is not available yet. Restart the backend and try again.'
    if (err.status === 503) return 'AI roadmap generation is not configured on the server.'
    return err.message
  }
  return 'Could not load your saved roadmap plan.'
}

function describeGenerateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 403) return 'AI roadmap plans are available only to student accounts.'
    if (err.status === 429) return 'The AI service is busy. Please wait a moment and try again.'
    if (err.status === 504) return 'AI roadmap generation timed out. Please try again.'
    if (err.status === 503) return 'AI roadmap generation is not configured on the server.'
    if (err.status === 502) return err.message
    return err.message
  }
  return 'Could not generate your roadmap. Please try again.'
}

function asPlan(value: unknown): RoadmapPlan | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.tasks) || record.tasks.length === 0) return null
  if (typeof record.title !== 'string' || typeof record.summary !== 'string') return null
  return value as RoadmapPlan
}

export function useRoadmapPlan(): UseRoadmapPlan {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [plan, setPlan] = useState<RoadmapPlan | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [persisted, setPersisted] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken) {
      setPlan(null)
      setGeneratedAt(null)
      setLoading(false)
      setGenerating(false)
      setError(null)
      setStorageAvailable(true)
      setPersisted(true)
      return
    }

    let active = true
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    getRoadmapPlan(accessToken, controller.signal)
      .then((result) => {
        if (!active) return
        const saved = asPlan(result.plan)
        setPlan(saved)
        setGeneratedAt(saved ? result.generatedAt : null)
        setStorageAvailable(result.storageAvailable)
        setPersisted(saved !== null)
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

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const clearError = useCallback(() => setError(null), [])

  const generate = useCallback(
    async (context: RoadmapResumeContext | null): Promise<boolean> => {
      if (!accessToken) {
        setError('You are not signed in.')
        return false
      }
      if (generating) return false

      setGenerating(true)
      setError(null)
      try {
        const result = await requestRoadmapPlan(accessToken, context)
        const generated = asPlan(result.plan)
        if (!generated) {
          setError('The generated roadmap could not be read. Please try again.')
          return false
        }
        setPlan(generated)
        setGeneratedAt(result.generatedAt)
        setPersisted(result.persisted)
        setStorageAvailable(result.persisted)
        return true
      } catch (err) {
        setError(describeGenerateError(err))
        return false
      } finally {
        setGenerating(false)
      }
    },
    [accessToken, generating],
  )

  return {
    plan,
    generatedAt,
    loading,
    generating,
    error,
    storageAvailable,
    persisted,
    reload,
    clearError,
    generate,
  }
}
