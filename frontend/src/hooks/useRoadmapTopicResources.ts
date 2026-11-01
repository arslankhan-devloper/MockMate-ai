import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  generateRoadmapTopicResources,
  getRoadmapTopicResources,
} from '../lib/roadmap'
import type { RoadmapDomainId } from '../data/roadmap/types'
import {
  asRoadmapTopicResources,
  type RoadmapTopicResource,
} from '../data/roadmap/resources'

export interface UseRoadmapTopicResources {
  resources: RoadmapTopicResource[]
  generatedAt: string | null
  loading: boolean
  generating: boolean
  error: string | null
  storageAvailable: boolean
  persisted: boolean
  reload: () => void
  clearError: () => void
  generate: () => Promise<boolean>
}

function describeLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 403) return 'Learning resources are available only to student accounts.'
    if (err.status === 503) return 'AI learning resources are not configured on the server.'
    return err.message
  }
  return 'Could not load learning resources for this topic.'
}

function describeGenerateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 403) return 'Learning resources are available only to student accounts.'
    if (err.status === 429) return 'The AI service is busy. Please wait a moment and try again.'
    if (err.status === 504) return 'Resource generation timed out. Please try again.'
    if (err.status === 503) return 'AI learning resources are not configured on the server.'
    if (err.status === 502) return err.message
    return err.message
  }
  return 'Could not generate learning resources. Please try again.'
}

// Loads persisted resources for the selected curated topic. Generation is
// explicit: opening a topic never silently spends AI credits. The backend
// upserts four type slots, so repeated generation cannot create duplicates.
export function useRoadmapTopicResources(
  domainId: RoadmapDomainId | null,
  topicId: string | null,
): UseRoadmapTopicResources {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [resources, setResources] = useState<RoadmapTopicResource[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [persisted, setPersisted] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken || !domainId || !topicId) {
      setResources([])
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
    setResources([])
    setGeneratedAt(null)
    setStorageAvailable(true)
    setPersisted(true)

    getRoadmapTopicResources(accessToken, domainId, topicId, controller.signal)
      .then((result) => {
        if (!active) return
        setResources(asRoadmapTopicResources(result.resources))
        setGeneratedAt(result.generatedAt)
        setStorageAvailable(result.storageAvailable)
        setPersisted(result.storageAvailable)
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
  }, [accessToken, domainId, topicId, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const clearError = useCallback(() => setError(null), [])

  const generate = useCallback(async (): Promise<boolean> => {
    if (!accessToken || !domainId || !topicId) {
      setError('Select a curated topic before generating resources.')
      return false
    }
    if (generating) return false

    setGenerating(true)
    setError(null)
    try {
      const result = await generateRoadmapTopicResources(accessToken, domainId, topicId)
      const parsed = asRoadmapTopicResources(result.resources)
      if (parsed.length === 0) {
        setError('The generated resources could not be read. Please try again.')
        return false
      }
      setResources(parsed)
      setGeneratedAt(result.generatedAt)
      setStorageAvailable(result.storageAvailable)
      setPersisted(result.persisted)
      return true
    } catch (err) {
      setError(describeGenerateError(err))
      return false
    } finally {
      setGenerating(false)
    }
  }, [accessToken, domainId, generating, topicId])

  return {
    resources,
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
