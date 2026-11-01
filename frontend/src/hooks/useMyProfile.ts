import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  getMyProfile,
  updateMyProfile,
  type AccountProfile,
  type ProfileUpdate,
} from '../lib/profile'

interface LoadFailure {
  message: string
  missing: boolean
}

function describeLoadError(err: unknown): LoadFailure {
  if (err instanceof ApiError) {
    if (err.code === 'profile_not_found' || err.status === 404) {
      return { message: err.message, missing: true }
    }
    if (err.status === 401) {
      return { message: 'Your session has expired. Please sign in again.', missing: false }
    }
    if (err.status === 503) {
      return { message: 'Profiles are not available yet. The server is not fully configured.', missing: false }
    }
    return { message: err.message, missing: false }
  }
  return { message: 'Something went wrong while loading your profile.', missing: false }
}

function describeSaveError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 503) return 'Profiles are not available yet. The server is not fully configured.'
    return err.message
  }
  return 'Something went wrong while saving your profile. Please try again.'
}

export interface UseMyProfile {
  profile: AccountProfile | null
  loading: boolean
  /** True once the initial profile load for the current session has settled. */
  loaded: boolean
  saving: boolean
  error: string | null
  saveError: string | null
  /** True when the account has no profile row yet (HTTP 404). */
  missing: boolean
  reload: () => void
  clearSaveError: () => void
  save: (patch: ProfileUpdate) => Promise<AccountProfile | null>
}

// Loads and updates the signed-in user's persisted profile through the backend.
// All requests carry the current Supabase access token; the backend never trusts
// a client-supplied user id, role or college.
export function useMyProfile(): UseMyProfile {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken) {
      setProfile(null)
      setLoading(false)
      setLoaded(true)
      setError(null)
      setMissing(false)
      return
    }

    let active = true
    setLoading(true)
    setLoaded(false)
    setError(null)
    setMissing(false)

    getMyProfile(accessToken)
      .then(next => {
        if (!active) return
        setProfile(next)
      })
      .catch(err => {
        if (!active) return
        const failure = describeLoadError(err)
        setProfile(null)
        setError(failure.message)
        setMissing(failure.missing)
      })
      .finally(() => {
        if (active) {
          setLoading(false)
          setLoaded(true)
        }
      })

    return () => {
      active = false
    }
  }, [accessToken, nonce])

  const reload = useCallback(() => setNonce(n => n + 1), [])
  const clearSaveError = useCallback(() => setSaveError(null), [])

  const save = useCallback(
    async (patch: ProfileUpdate): Promise<AccountProfile | null> => {
      if (!accessToken) {
        setSaveError('You are not signed in.')
        return null
      }
      setSaving(true)
      setSaveError(null)
      try {
        const updated = await updateMyProfile(accessToken, patch)
        setProfile(updated)
        setMissing(false)
        return updated
      } catch (err) {
        setSaveError(describeSaveError(err))
        return null
      } finally {
        setSaving(false)
      }
    },
    [accessToken],
  )

  return { profile, loading, loaded, saving, error, saveError, missing, reload, clearSaveError, save }
}
