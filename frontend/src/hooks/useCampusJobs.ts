import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  applyToJob,
  closeJob,
  createJob,
  listCollegeApplications,
  listJobs,
  listMyApplications,
  publishJob,
  updateApplicationStatus,
  updateJob,
  withdrawApplication,
} from '../lib/jobs'
import type {
  ApplicationStatus,
  CampusApplicationWithJob,
  CampusJob,
  CampusJobInput,
} from '../data/campusJobs'

export interface MutationResult {
  ok: boolean
  error?: string
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    if (err.status === 503) return 'Jobs are not available yet. The server is not fully configured.'
    return err.message
  }
  return fallback
}

function normalizeError(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'Something went wrong. Please try again.'
}

export interface UseCampusJobs {
  jobs: CampusJob[]
  loading: boolean
  error: string | null
  reload: () => void
  create: (payload: CampusJobInput, publish: boolean) => Promise<MutationResult>
  update: (jobId: string, payload: CampusJobInput) => Promise<MutationResult>
  publish: (jobId: string) => Promise<MutationResult>
  close: (jobId: string) => Promise<MutationResult>
}

// Loads jobs visible to the signed-in user and exposes officer mutations.
// Students receive published jobs only; officers receive their college's jobs.
// The backend (RLS) is the authority in both cases.
export function useCampusJobs(): UseCampusJobs {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [jobs, setJobs] = useState<CampusJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken) {
      setJobs([])
      setLoading(false)
      setError(null)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    listJobs(accessToken)
      .then(rows => {
        if (active) setJobs(rows)
      })
      .catch(err => {
        if (!active) return
        setJobs([])
        setError(describeError(err, 'Could not load jobs.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accessToken, nonce])

  const reload = useCallback(() => setNonce(n => n + 1), [])

  const upsert = useCallback((job: CampusJob) => {
    setJobs(prev => {
      const exists = prev.some(j => j.id === job.id)
      return exists ? prev.map(j => (j.id === job.id ? job : j)) : [job, ...prev]
    })
  }, [])

  const create = useCallback(
    async (payload: CampusJobInput, publish: boolean): Promise<MutationResult> => {
      if (!accessToken) return { ok: false, error: 'You are not signed in.' }
      try {
        const job = await createJob(accessToken, payload, publish)
        upsert(job)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: describeError(err, 'Could not create the job.') }
      }
    },
    [accessToken, upsert],
  )

  const update = useCallback(
    async (jobId: string, payload: CampusJobInput): Promise<MutationResult> => {
      if (!accessToken) return { ok: false, error: 'You are not signed in.' }
      try {
        const job = await updateJob(accessToken, jobId, payload)
        upsert(job)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: describeError(err, 'Could not save the job.') }
      }
    },
    [accessToken, upsert],
  )

  const publish = useCallback(
    async (jobId: string): Promise<MutationResult> => {
      if (!accessToken) return { ok: false, error: 'You are not signed in.' }
      try {
        const job = await publishJob(accessToken, jobId)
        upsert(job)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: describeError(err, 'Could not publish the job.') }
      }
    },
    [accessToken, upsert],
  )

  const close = useCallback(
    async (jobId: string): Promise<MutationResult> => {
      if (!accessToken) return { ok: false, error: 'You are not signed in.' }
      try {
        const job = await closeJob(accessToken, jobId)
        upsert(job)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: describeError(err, 'Could not close the job.') }
      }
    },
    [accessToken, upsert],
  )

  return { jobs, loading, error, reload, create, update, publish, close }
}

export interface UseStudentApplications {
  applications: CampusApplicationWithJob[]
  loading: boolean
  error: string | null
  reload: () => void
  apply: (jobId: string) => Promise<MutationResult>
  withdraw: (applicationId: string) => Promise<MutationResult>
}

// The signed-in student's applications to internal jobs. Pass `enabled = false`
// for officers so no student-only request is made.
export function useStudentApplications(enabled = true): UseStudentApplications {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [applications, setApplications] = useState<CampusApplicationWithJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken || !enabled) {
      setApplications([])
      setLoading(false)
      setError(null)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    listMyApplications(accessToken)
      .then(rows => {
        if (active) setApplications(rows)
      })
      .catch(err => {
        if (!active) return
        setError(describeError(err, 'Could not load your applications.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accessToken, nonce, enabled])

  const reload = useCallback(() => setNonce(n => n + 1), [])

  const apply = useCallback(
    async (jobId: string): Promise<MutationResult> => {
      if (!accessToken) return { ok: false, error: 'You are not signed in.' }
      try {
        await applyToJob(accessToken, jobId)
        setNonce(n => n + 1)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: normalizeError(err) }
      }
    },
    [accessToken],
  )

  const withdraw = useCallback(
    async (applicationId: string): Promise<MutationResult> => {
      if (!accessToken) return { ok: false, error: 'You are not signed in.' }
      try {
        await withdrawApplication(accessToken, applicationId)
        setApplications(prev => prev.filter(a => a.id !== applicationId))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: normalizeError(err) }
      }
    },
    [accessToken],
  )

  return { applications, loading, error, reload, apply, withdraw }
}

export interface UseOfficerApplications {
  applications: CampusApplicationWithJob[]
  loading: boolean
  error: string | null
  reload: () => void
  updateStatus: (applicationId: string, status: ApplicationStatus) => Promise<MutationResult>
}

// Every application for the officer's college, with an embedded job summary.
// Pass `enabled = false` for students so no officer-only request is made.
export function useOfficerApplications(enabled = true): UseOfficerApplications {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? null

  const [applications, setApplications] = useState<CampusApplicationWithJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!accessToken || !enabled) {
      setApplications([])
      setLoading(false)
      setError(null)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    listCollegeApplications(accessToken)
      .then(rows => {
        if (active) setApplications(rows)
      })
      .catch(err => {
        if (!active) return
        setError(describeError(err, 'Could not load applications.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accessToken, nonce, enabled])

  const reload = useCallback(() => setNonce(n => n + 1), [])

  const updateStatus = useCallback(
    async (applicationId: string, status: ApplicationStatus): Promise<MutationResult> => {
      if (!accessToken) return { ok: false, error: 'You are not signed in.' }
      try {
        const updated = await updateApplicationStatus(accessToken, applicationId, status)
        setApplications(prev =>
          prev.map(a => (a.id === applicationId ? { ...a, ...updated } : a)),
        )
        return { ok: true }
      } catch (err) {
        return { ok: false, error: normalizeError(err) }
      }
    },
    [accessToken],
  )

  return { applications, loading, error, reload, updateStatus }
}
