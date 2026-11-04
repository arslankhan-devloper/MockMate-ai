// Real Supabase authentication for MockMate.
//
// This module is the single source of truth for "who is signed in". A role or a
// college id is NEVER taken from local React state, a URL, or a form field —
// it is always read from the `public.profiles` row that the database links to
// the authenticated Supabase user. The database (RLS + triggers) is the only
// thing that can grant the `placement-officer` role.
//
// When Supabase is not configured the provider reports `configured = false`
// and every auth action returns a clear message instead of faking a login.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'
import {
  isLocalhost,
  getPresentationRole,
  setPresentationRole as persistPresentationRole,
  getPresentationSession,
  type PresentationRole,
} from './presentationMode'

export type ProfileRole = 'student' | 'placement-officer' | 'super_admin'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type CollegeVerificationStatus = 'pending' | 'verified' | 'rejected'

export interface AuthProfile {
  id: string
  role: ProfileRole
  approvalStatus: ApprovalStatus | null
  rejectionReason: string | null
  collegeId: string | null
  fullName: string | null
  email: string | null
  rollNumber?: string | null
  collegeVerificationStatus?: CollegeVerificationStatus | null
  collegeVerificationReason?: string | null
}

export const SUPABASE_UNCONFIGURED_MESSAGE =
  'Cloud accounts are not configured in this build. Add VITE_SUPABASE_URL and a ' +
  'public client key to frontend/.env.local, then restart the dev server. ' +
  'See SUPABASE_SETUP.md.'

interface SignInResult {
  error: string | null
  profile: AuthProfile | null
}

interface SignUpResult {
  error: string | null
  // True when Supabase is set to require email confirmation, so no session is
  // issued yet and the user must confirm before signing in.
  needsEmailConfirmation: boolean
  profile: AuthProfile | null
}

interface AuthContextValue {
  /** Whether Supabase credentials are present in this build. */
  configured: boolean
  /** True while the initial session is being restored from storage. */
  initializing: boolean
  session: Session | null
  user: User | null
  /** The authenticated user's profile row (role + college), or null. */
  profile: AuthProfile | null
  profileLoading: boolean
  profileError: string | null
  signIn: (email: string, password: string) => Promise<SignInResult>
  signUp: (email: string, password: string, fullName: string, collegeId?: string, rollNumber?: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
  signOutLocal: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>
  changePassword: (password: string) => Promise<{ error: string | null }>
  refreshProfile: () => Promise<void>
  presentationRole: PresentationRole | null
  setPresentationRole: (role: PresentationRole | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const PROFILE_COLUMNS = 'id, role, college_id, full_name, email, approval_status, rejection_reason, roll_number, college_verification_status, college_verification_reason'

function normalizeError(err: unknown): string {
  if (!err) return 'Something went wrong. Please try again.'
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return 'Something went wrong. Please try again.'
}

interface ProfileRow {
  id: string
  role: string | null
  college_id: string | null
  full_name: string | null
  email: string | null
  approval_status?: string | null
  rejection_reason?: string | null
  roll_number?: string | null
  college_verification_status?: string | null
  college_verification_reason?: string | null
}

function mapProfile(row: ProfileRow): AuthProfile {
  const role: ProfileRole =
    row.role === 'super_admin'
      ? 'super_admin'
      : row.role === 'placement-officer'
      ? 'placement-officer'
      : 'student'

  const approvalStatus: ApprovalStatus | null =
    (row.approval_status as ApprovalStatus) ||
    (role === 'student' || role === 'super_admin' ? 'approved' : 'pending')

  const collegeVerificationStatus =
    (row.college_verification_status as CollegeVerificationStatus) || 'pending'

  return {
    id: row.id,
    role,
    approvalStatus,
    rejectionReason: typeof row.rejection_reason === 'string' ? row.rejection_reason : null,
    collegeId: row.college_id ?? null,
    fullName: row.full_name ?? null,
    email: row.email ?? null,
    rollNumber: row.roll_number ?? null,
    collegeVerificationStatus,
    collegeVerificationReason: typeof row.college_verification_reason === 'string' ? row.college_verification_reason : null,
  }
}

// Shown when a signed-in user has no `profiles` row yet. The row is provisioned
// server-side by the database `on_auth_user_created` trigger; the browser never
// writes to the database. This is a recoverable state: the UI offers retry and
// sign-out.
export const PROFILE_MISSING_MESSAGE =
  'Your account profile is not available yet. It is normally created ' +
  'automatically when you sign up. Try again in a moment, or sign out and sign ' +
  'back in. If this keeps happening, ask your placement cell administrator to ' +
  'check your account.'

// Reads the caller's own profile through RLS, which guarantees a user can only
// select their own row. Provisioning is owned by the database trigger, so a
// missing row is surfaced as a clear, recoverable error — never fabricated here.
async function fetchProfileRow(user: User): Promise<AuthProfile> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error(SUPABASE_UNCONFIGURED_MESSAGE)

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  if (data) return mapProfile(data as ProfileRow)

  // No row is visible yet (the signup trigger may not have run, or the row is
  // not yet readable). Do not insert from the browser; report a recoverable
  // error instead.
  throw new Error(PROFILE_MISSING_MESSAGE)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseClient()
  const configured = Boolean(supabase)

  const [initializing, setInitializing] = useState(configured)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileNonce, setProfileNonce] = useState(0)

  // Localhost presentation access role (strictly ignored on non-localhost)
  const [presentationRole, setPresentationRoleState] = useState<PresentationRole | null>(() => {
    return isLocalhost() ? getPresentationRole() : null
  })

  const setPresentationRoleCallback = useCallback((role: PresentationRole | null) => {
    if (!isLocalhost()) return
    persistPresentationRole(role)
    setPresentationRoleState(role)
  }, [])

  // If on localhost and no real Supabase session is signed in, synthesize
  // presentation session/profile for faculty review of blocked admin/officer panels.
  const presentationData = useMemo(() => {
    if (session || !presentationRole || !isLocalhost()) return null
    return getPresentationSession(presentationRole)
  }, [session, presentationRole])

  const effectiveSession = session ?? presentationData?.session ?? null
  const effectiveUser = session?.user ?? presentationData?.user ?? null
  const effectiveProfile = profile ?? presentationData?.profile ?? null

  // Restore the session from Supabase storage and subscribe to auth changes.
  useEffect(() => {
    if (!supabase) {
      setInitializing(false)
      return
    }
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session ?? null)
        setInitializing(false)
      })
      .catch(() => {
        if (active) setInitializing(false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Keep this callback synchronous: only update state here. Any Supabase
      // call (like loading the profile) happens in the effect below, which
      // avoids deadlocking the auth client.
      setSession(nextSession)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [supabase])

  const userId = session?.user?.id ?? null

  // Load (or create) the profile whenever the signed-in user changes. A token
  // refresh keeps the same user id, so it does not trigger a reload.
  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null)
      setProfileError(null)
      setProfileLoading(false)
      return
    }
    const currentUser = session?.user
    if (!currentUser) return

    let active = true
    setProfileLoading(true)
    setProfileError(null)
    fetchProfileRow(currentUser)
      .then(next => {
        if (active) setProfile(next)
      })
      .catch(err => {
        if (!active) return
        setProfile(null)
        setProfileError(normalizeError(err))
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId, profileNonce])

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password) => {
      if (!supabase) return { error: SUPABASE_UNCONFIGURED_MESSAGE, profile: null }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: normalizeError(error), profile: null }
      const signedInUser = data.user
      if (!signedInUser) return { error: 'Sign-in did not return a user.', profile: null }
      try {
        const next = await fetchProfileRow(signedInUser)
        setProfile(next)
        return { error: null, profile: next }
      } catch (err) {
        return { error: normalizeError(err), profile: null }
      }
    },
    [supabase],
  )

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (email, password, fullName, collegeId, rollNumber) => {
      if (!supabase) {
        return { error: SUPABASE_UNCONFIGURED_MESSAGE, needsEmailConfirmation: false, profile: null }
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            college_id: collegeId ? collegeId.trim() : null,
            roll_number: rollNumber ? rollNumber.trim() : null,
          },
        },
      })
      if (error) {
        return { error: normalizeError(error), needsEmailConfirmation: false, profile: null }
      }
      // With email confirmation enabled, `session` is null until the user
      // clicks the link. Do not fabricate a signed-in state.
      if (!data.session) {
        return { error: null, needsEmailConfirmation: true, profile: null }
      }
      try {
        const next = data.user ? await fetchProfileRow(data.user) : null
        return { error: null, needsEmailConfirmation: false, profile: next }
      } catch (err) {
        return { error: normalizeError(err), needsEmailConfirmation: false, profile: null }
      }
    },
    [supabase],
  )

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    if (presentationRole) {
      setPresentationRoleCallback(null)
    }
    if (!supabase) return
    await supabase.auth.signOut()
    setProfile(null)
  }, [supabase, presentationRole, setPresentationRoleCallback])

  // Local-only sign-out is used after the backend has already deleted the Auth
  // user. A server sign-out would fail because the account no longer exists, but
  // the local token and profile state still need to be discarded.
  const signOutLocal = useCallback<AuthContextValue['signOutLocal']>(async () => {
    if (presentationRole) {
      setPresentationRoleCallback(null)
    }
    if (!supabase) return
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Local-only cleanup is best effort; the backend account is already gone.
    } finally {
      // Clear React state even if the local storage adapter failed. The backend
      // has already deleted the account, so a stale session must not remain.
      setSession(null)
      setProfile(null)
    }
  }, [supabase, presentationRole, setPresentationRoleCallback])

  const sendPasswordReset = useCallback<AuthContextValue['sendPasswordReset']>(
    async email => {
      if (!supabase) return { error: SUPABASE_UNCONFIGURED_MESSAGE }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      })
      return { error: error ? normalizeError(error) : null }
    },
    [supabase],
  )

  const changePassword = useCallback<AuthContextValue['changePassword']>(
    async password => {
      if (!supabase) return { error: SUPABASE_UNCONFIGURED_MESSAGE }
      if (!password) return { error: 'Please enter a new password.' }

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) return { error: normalizeError(sessionError) }
      if (!data.session) return { error: 'Your session has expired. Sign in again.' }

      const { error } = await supabase.auth.updateUser({ password })
      if (!error) return { error: null }

      const message = normalizeError(error)
      return {
        error: /session/i.test(message)
          ? 'Your session has expired. Sign in again.'
          : message,
      }
    },
    [supabase],
  )

  const refreshProfile = useCallback(async () => {
    setProfileNonce(n => n + 1)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      initializing,
      session: effectiveSession,
      user: effectiveUser,
      profile: effectiveProfile,
      profileLoading,
      profileError,
      signIn,
      signUp,
      signOut,
      signOutLocal,
      sendPasswordReset,
      changePassword,
      refreshProfile,
      presentationRole,
      setPresentationRole: setPresentationRoleCallback,
    }),
    [
      configured,
      initializing,
      effectiveSession,
      effectiveUser,
      effectiveProfile,
      profileLoading,
      profileError,
      signIn,
      signUp,
      signOut,
      signOutLocal,
      sendPasswordReset,
      changePassword,
      refreshProfile,
      presentationRole,
      setPresentationRoleCallback,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
