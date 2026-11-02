import { useState, useEffect } from 'react'
import { useHashRoute, parseHash } from './lib/useHashRoute'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import LoginSelection from './pages/LoginSelection'
import OfficerLogin from './pages/OfficerLogin'
import Dashboard from './pages/Dashboard'
import ResumeAnalysis from './pages/ResumeAnalysis'
import InterviewSetup, { type InterviewConfig } from './pages/InterviewSetup'
import AIInterview from './pages/AIInterview'
import CodingRoundInterview from './pages/CodingRoundInterview'
import CodingInterview from './pages/CodingInterview'
import PracticeHub from './pages/PracticeHub'
import PracticePage from './pages/PracticePage'
import InterviewReport from './pages/InterviewReport'
import Roadmap from './pages/Roadmap'
import Analytics from './pages/Analytics'
import PlacementCell from './pages/PlacementCell'
import JobPosting from './pages/JobPosting'
import JobPortal from './pages/JobPortal'
import Profile from './pages/Profile'
import OfficerProfile from './pages/OfficerProfile'
import ProfileSetup from './pages/ProfileSetup'
import Settings from './pages/Settings'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import AdminColleges from './pages/AdminColleges'
import AdminOfficers from './pages/AdminOfficers'
import AdminStudents from './pages/AdminStudents'
import AdminDrives from './pages/AdminDrives'
import AdminAuditLogs from './pages/AdminAuditLogs'
import AdminAnalytics from './pages/AdminAnalytics'
import Layout, { type Role } from './components/Layout'
import AdminLayout, { type AdminPage } from './components/AdminLayout'
import { Button, Card } from './components/ui'
import { BrainCircuit, Loader2, RefreshCw, LogOut, ShieldAlert } from 'lucide-react'
import { useAuth } from './lib/auth'
import { clearDeletedUserLocalData } from './lib/accountDeletion'
import {
  THEME_STORAGE_KEY,
  browserThemeStorage,
  loadThemeMode,
  resolveThemeDark,
  type ThemeMode,
} from './lib/theme'
import { useMyProfile } from './hooks/useMyProfile'
import {
  useCampusJobs,
  useOfficerApplications,
  useStudentApplications,
} from './hooks/useCampusJobs'
import { type ProfileUpdate } from './lib/profile'
import { isJobOpen } from './data/campusJobs'
import {
  initialProfiles,
  type ProfileData, type ProfileState, type ProfileStatus,
} from './data/profiles'

// Every screen the app can show. This is the single source of truth for both
// the `Page` type and the set of hash routes the router accepts.
const PAGES = [
  'landing', 'login-selection', 'login', 'signup', 'forgot',
  'officer-login', 'admin-login',
  'dashboard', 'resume', 'interview-setup', 'ai-interview',
  'coding-interview', 'problem-solving', 'practice',
  'report', 'roadmap', 'analytics',
  'placement-cell', 'job-posting', 'job-portal', 'profile-setup',
  'officer-profile', 'profile', 'settings',
  'admin-dashboard', 'admin-colleges', 'admin-officers',
  'admin-students', 'admin-drives', 'admin-audit-logs', 'admin-analytics',
] as const

type Page = (typeof PAGES)[number]

const fullscreenPages: Page[] = ['ai-interview', 'coding-interview']

// Pages reachable while signed out. Everything else requires an authenticated
// session restored from Supabase.
const AUTH_PAGES: Page[] = [
  'landing', 'login-selection', 'login', 'signup', 'forgot', 'officer-login', 'admin-login',
]

// Entry pages a signed-in user should be routed away from. `officer-login` is
// intentionally omitted so the officer form can still surface a role error.
const SIGNED_IN_REDIRECT_PAGES: Page[] = [
  'landing', 'login-selection', 'login', 'signup', 'forgot', 'admin-login',
]

// Remember where a signed-out user was trying to go so they can be returned
// there after signing in. This survives a refresh but is scoped to the tab.
const RETURN_TO_KEY = 'mockmate.returnTo'

function rememberReturnTo(page: Page, param?: string) {
  try {
    window.sessionStorage.setItem(RETURN_TO_KEY, param ? `${page}/${param}` : page)
  } catch {
    // Storage may be unavailable; returning home is still safe.
  }
}

function consumeReturnTo(): { page: Page; param: string } | null {
  try {
    const saved = window.sessionStorage.getItem(RETURN_TO_KEY)
    window.sessionStorage.removeItem(RETURN_TO_KEY)
    if (!saved) return null
    const parsed = parseHash(`#/${saved}`)
    if ((PAGES as readonly string[]).includes(parsed.page) && !AUTH_PAGES.includes(parsed.page as Page)) {
      return { page: parsed.page as Page, param: parsed.param }
    }
  } catch {
    // Ignore unavailable storage.
  }
  return null
}

// A skipped profile prompt stays dismissed for the rest of the browser session,
// including across a refresh. A new tab or sign-in can prompt again.
const PROFILE_SKIPPED_PREFIX = 'mockmate.profileSkipped.'

function wasProfileSkipped(userId: string | null): boolean {
  if (!userId) return false
  try {
    return window.sessionStorage.getItem(`${PROFILE_SKIPPED_PREFIX}${userId}`) === '1'
  } catch {
    return false
  }
}

function rememberProfileSkipped(userId: string | null) {
  if (!userId) return
  try {
    window.sessionStorage.setItem(`${PROFILE_SKIPPED_PREFIX}${userId}`, '1')
  } catch {
    // Ignore unavailable storage.
  }
}

function clearProfileSkipped(userId: string | null) {
  if (!userId) return
  try {
    window.sessionStorage.removeItem(`${PROFILE_SKIPPED_PREFIX}${userId}`)
  } catch {
    // Ignore unavailable storage.
  }
}

function SessionLoadingScreen({ dark, label }: { dark: boolean; label: string }) {
  return (
    <div className={dark ? 'dark' : ''} style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-[var(--radius-lg)] gradient-bg flex items-center justify-center shadow-[var(--shadow-glow)]">
          <BrainCircuit size={24} className="text-white" />
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 size={15} className="animate-spin text-[var(--accent-from)]" />
          {label}
        </div>
      </div>
    </div>
  )
}

function ProfileProblemScreen({
  dark, message, onRetry, onSignOut,
}: { dark: boolean; message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <div className={dark ? 'dark' : ''} style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <div className="min-h-[100dvh] flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={26} className="text-red-500" />
            </div>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)] mb-2">We couldn't load your profile</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 break-words">{message}</p>
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <Button onClick={onRetry}><RefreshCw size={14} /> Try Again</Button>
              <Button variant="secondary" onClick={onSignOut}><LogOut size={14} /> Sign Out</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const {
    session, user, profile: authProfile, initializing, profileLoading, profileError,
    signOut, signOutLocal, refreshProfile,
  } = useAuth()

  // Persisted profile for the signed-in user, loaded/saved through the backend.
  const myProfile = useMyProfile()

  const signedIn = Boolean(session && user)

  // The active page is driven by the URL hash so a refresh keeps the user where
  // they were and the browser Back/Forward buttons work.
  const { page, param: routeParam, navigate } = useHashRoute<Page>(PAGES, 'landing')
  // Theme: 'light' | 'dark' | 'system'. "System" follows the OS preference.
  // The choice is persisted locally so it survives a reload.
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    loadThemeMode(browserThemeStorage()),
  )
  const [systemDark, setSystemDark] = useState(false)
  const dark = resolveThemeDark(themeMode, systemDark)
  // The active role is derived from the database profile — never from a user
  // selection. Signing out falls back to the student role for display only.
  const isSuperAdmin = authProfile?.role === 'super_admin'
  const role: Role = authProfile?.role === 'placement-officer' ? 'placement-officer' : 'student'
  // In-memory profile form data per role. Seeded with the authenticated user's
  // name/email, then merged with the persisted profile from the backend.
  const [profiles, setProfiles] = useState<Record<Role, ProfileState>>(() => initialProfiles())

  // The account's college (UUID) and display name come from the persisted
  // profile — never from free-text input or a client-supplied value.
  const collegeId = myProfile.profile?.collegeId ?? authProfile?.collegeId ?? null
  const collegeLabel =
    (myProfile.profile?.collegeName ?? profiles[role].data.collegeName).trim() || 'Your College'

  // Hydration guard: routing decisions wait until the persisted profile has
  // actually loaded, so a refresh can never mistake "not loaded yet" for
  // "profile incomplete" and bounce a complete account into Profile Setup.
  const profileHydrated = myProfile.loaded
  const persistedComplete = myProfile.profile
    ? role === 'student'
      ? Boolean(myProfile.profile.fullName && myProfile.profile.branch && myProfile.profile.gradYear)
      : Boolean(myProfile.profile.fullName && myProfile.profile.designation && myProfile.profile.department)
    : false

  // Persisted campus jobs and applications (Supabase-backed through the API).
  const campusJobs = useCampusJobs()
  const studentApplications = useStudentApplications(role === 'student')
  const officerApplications = useOfficerApplications(role === 'placement-officer')

  // Active profile for the signed-in role. Display values come from the user's
  // own profile data (empty until they complete it) — never fabricated.
  const activeProfile = profiles[role]
  const profile = activeProfile.data
  const displayName = authProfile?.fullName?.trim() || profile.fullName.trim()
  const userLabel = displayName || (role === 'student' ? 'Student' : 'Placement Officer')
  const userEmail = authProfile?.email?.trim() || profile.email.trim()
  const studentId = user?.id ?? ''
  const openJobs = campusJobs.jobs.filter(isJobOpen)

  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>({
    type: 'technical',
    typeLabel: 'IT / Software',
    mode: 'technical',
    modeLabel: 'Technical Interview',
    difficulty: 'Medium',
    experience: 'Fresher',
    role: 'Software Engineer',
    company: 'Google',
    language: 'en',
    languageLabel: 'English',
  })

  // Track the OS colour-scheme preference so "System" theme can follow it.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Apply the dark class to the root element and persist the chosen mode.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
    } catch {
      // Storage may be unavailable (private mode); theme still applies.
    }
  }, [dark, themeMode])

  // Topbar/landing toggle switches to an explicit light/dark mode.
  const toggleDark = () => setThemeMode(dark ? 'light' : 'dark')

  // Seed the in-memory profile forms with the authenticated user's identity.
  // Only empty fields are filled so user-entered values are never overwritten.
  useEffect(() => {
    if (!authProfile) return
    setProfiles(prev => {
      const current = prev[role]
      const nextFullName = current.data.fullName || authProfile.fullName || ''
      const nextEmail = current.data.email || authProfile.email || ''
      if (nextFullName === current.data.fullName && nextEmail === current.data.email) return prev
      return {
        ...prev,
        [role]: { ...current, data: { ...current.data, fullName: nextFullName, email: nextEmail } },
      }
    })
  }, [authProfile, role])

  // Merge the persisted (backend) profile into the in-memory form state so the
  // profile screens show the saved values. College is never overwritten with a
  // null — the account's assigned college wins when present.
  useEffect(() => {
    const loaded = myProfile.profile
    if (!loaded) return
    setProfiles(prev => {
      const r = loaded.role
      const current = prev[r]
      const nextData: ProfileData = {
        ...current.data,
        fullName: loaded.fullName ?? '',
        email: loaded.email ?? current.data.email,
        phone: loaded.phone ?? '',
        branch: loaded.branch ?? '',
        gradYear: loaded.gradYear ?? '',
        designation: loaded.designation ?? '',
        department: loaded.department ?? '',
        collegeName: loaded.collegeName ?? current.data.collegeName,
      }
      const complete =
        r === 'student'
          ? Boolean(loaded.fullName && loaded.branch && loaded.gradYear)
          : Boolean(loaded.fullName && loaded.designation && loaded.department)
      const status: ProfileStatus = complete ? 'complete' : current.status
      if (
        current.status === status &&
        JSON.stringify(current.data) === JSON.stringify(nextData)
      ) {
        return prev
      }
      return { ...prev, [r]: { ...current, data: nextData, status } }
    })
  }, [myProfile.profile])

  // Session-driven routing. This is the only authority on whether app pages are
  // reachable — local state never proves authentication. These are redirects, so
  // they replace the current history entry instead of pushing a new one.
  useEffect(() => {
    if (initializing) return
    if (signedIn) {
      if (isSuperAdmin) {
        if (SIGNED_IN_REDIRECT_PAGES.includes(page) || page === 'officer-login' || !page.startsWith('admin-')) {
          navigate('admin-dashboard', { replace: true })
        }
      } else if (page.startsWith('admin-')) {
        navigate(role === 'student' ? 'dashboard' : 'placement-cell', { replace: true })
      } else if (authProfile?.role === 'placement-officer' && authProfile.approvalStatus !== 'approved') {
        void signOut()
        navigate('officer-login', { replace: true })
      } else if (SIGNED_IN_REDIRECT_PAGES.includes(page)) {
        const returnTo = consumeReturnTo()
        if (returnTo) {
          navigate(returnTo.page, { replace: true, param: returnTo.param })
        } else {
          navigate(role === 'student' ? 'dashboard' : 'placement-cell', { replace: true })
        }
      } else if (page === 'officer-login' && role === 'placement-officer') {
        navigate('placement-cell', { replace: true })
      }
    } else if (!AUTH_PAGES.includes(page)) {
      rememberReturnTo(page, routeParam)
      navigate('landing', { replace: true })
    }
  }, [initializing, signedIn, page, routeParam, role, isSuperAdmin, authProfile, navigate, signOut])

  // Server-derived guards: keep students out of officer-only routes, and keep
  // placement officers out of the student-only roadmap.
  useEffect(() => {
    if (isSuperAdmin) return
    if ((page === 'placement-cell' || page === 'job-posting' || page === 'officer-profile') && role !== 'placement-officer') {
      navigate('dashboard', { replace: true })
      return
    }
    if (page === 'profile' && role !== 'student') {
      navigate('officer-profile', { replace: true })
      return
    }
    if (page === 'roadmap' && role !== 'student') {
      navigate('placement-cell', { replace: true })
    }
  }, [page, role, isSuperAdmin, navigate])

  // After login, show the (optional) profile setup step once, if the active
  // profile is not complete and the user has not skipped it this session.
  useEffect(() => {
    if (!signedIn || !profileHydrated) return
    const home = role === 'student' ? 'dashboard' : 'placement-cell'
    // Only prompt when the persisted profile actually exists and is incomplete.
    // A missing profile row is handled by the account gate, not this redirect.
    if (page === home && myProfile.profile && !persistedComplete && !activeProfile.dismissed && !wasProfileSkipped(user?.id ?? null)) {
      navigate('profile-setup', { replace: true })
    }
  }, [page, role, activeProfile, signedIn, profileHydrated, myProfile.profile, persistedComplete, navigate, user?.id])

  const nav = (p: Page, param?: string) => navigate(p, { param })

  // Logout revokes the Supabase session and returns to the Login Selection page.
  const logout = async () => {
    await signOut()
    navigate('login-selection', { replace: true })
  }

  // Runs only after the backend confirms deletion. The Auth user is already
  // gone, so clear this user's browser data and discard the local session.
  const accountDeleted = async () => {
    clearDeletedUserLocalData(user?.id ?? null)
    try {
      await signOutLocal()
    } finally {
      navigate('login-selection', { replace: true })
    }
  }

  // ── Profile setup ──────────────────────────────────────────────
  const goHome = () => navigate(role === 'student' ? 'dashboard' : 'placement-cell', { replace: true })

  // Map the form data to the only fields the backend accepts. Role, college and
  // email are never sent — the backend rejects them.
  const toProfileUpdate = (data: ProfileData, r: Role): ProfileUpdate =>
    r === 'student'
      ? {
          fullName: data.fullName.trim() || null,
          phone: data.phone.trim() || null,
          branch: data.branch.trim() || null,
          gradYear: data.gradYear.trim() || null,
        }
      : {
          fullName: data.fullName.trim() || null,
          phone: data.phone.trim() || null,
          designation: data.designation.trim() || null,
          department: data.department.trim() || null,
        }

  // Persist the profile for the active role. Marks the profile complete only
  // when the backend confirms the save. College keeps the account's value.
  const saveProfile = async (data: ProfileData): Promise<boolean> => {
    const updated = await myProfile.save(toProfileUpdate(data, role))
    if (!updated) return false
    clearProfileSkipped(user?.id ?? null)
    setProfiles(prev => ({
      ...prev,
      [role]: {
        status: 'complete',
        dismissed: true,
        data: {
          ...prev[role].data,
          ...data,
          fullName: updated.fullName ?? '',
          email: updated.email ?? prev[role].data.email,
          phone: updated.phone ?? '',
          branch: updated.branch ?? '',
          gradYear: updated.gradYear ?? '',
          designation: updated.designation ?? '',
          department: updated.department ?? '',
          collegeName: updated.collegeName ?? prev[role].data.collegeName,
        },
      },
    }))
    return true
  }

  // Skipping never marks the profile complete and never fabricates data.
  const skipProfile = () => {
    rememberProfileSkipped(user?.id ?? null)
    setProfiles(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        status: prev[role].status === 'complete' ? 'complete' : 'skipped',
        dismissed: true,
      },
    }))
  }

  // ── Auth state gates ───────────────────────────────────────────
  if (initializing) {
    return <SessionLoadingScreen dark={dark} label="Restoring your session…" />
  }

  if (signedIn && !authProfile) {
    if (profileError) {
      return (
        <ProfileProblemScreen
          dark={dark}
          message={profileError}
          onRetry={() => { void refreshProfile() }}
          onSignOut={() => { void logout() }}
        />
      )
    }
    if (profileLoading) {
      return <SessionLoadingScreen dark={dark} label="Loading your profile…" />
    }
    return <SessionLoadingScreen dark={dark} label="Preparing your account…" />
  }

  // Super Admin control plane
  if (signedIn && isSuperAdmin) {
    const adminPage = page.startsWith('admin-') && page !== 'admin-login'
      ? (page as AdminPage)
      : 'admin-dashboard'

    return (
      <div className={dark ? 'dark' : ''} style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
        <AdminLayout
          page={adminPage}
          onNavigate={p => navigate(p)}
          dark={dark}
          onToggleDark={toggleDark}
          onLogout={() => { void logout() }}
          adminEmail={authProfile?.email || user?.email || 'admin@mockmate.ai'}
          adminName={authProfile?.fullName || 'Super Administrator'}
        >
          {adminPage === 'admin-dashboard' && <AdminDashboard onNavigate={p => navigate(p)} />}
          {adminPage === 'admin-colleges' && <AdminColleges />}
          {adminPage === 'admin-officers' && <AdminOfficers />}
          {adminPage === 'admin-students' && <AdminStudents />}
          {adminPage === 'admin-drives' && <AdminDrives />}
          {adminPage === 'admin-audit-logs' && <AdminAuditLogs />}
          {adminPage === 'admin-analytics' && <AdminAnalytics />}
        </AdminLayout>
      </div>
    )
  }

  // Admin login page
  if (page === 'admin-login') {
    return (
      <div className={dark ? 'dark' : ''} style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
        <AdminLogin
          onLoginSuccess={() => navigate('admin-dashboard', { replace: true })}
          onNavigateHome={() => navigate('landing', { replace: true })}
        />
      </div>
    )
  }

  // Full-screen pages (no sidebar layout)
  if (fullscreenPages.includes(page)) {
    return (
      <div className={dark ? 'dark' : ''} style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {page === 'ai-interview' && (interviewConfig?.type === 'coding'
          ? <CodingRoundInterview onNavigate={nav} config={interviewConfig} />
          : <AIInterview onNavigate={nav} config={interviewConfig} />)}
        {page === 'coding-interview' && <CodingInterview onNavigate={nav} />}
      </div>
    )
  }

  // Standalone onboarding (no app sidebar/nav): Profile Setup is shown as a
  // clean, standalone screen with the MockMate brand header only.
  if (page === 'profile-setup') {
    return (
      <div className={dark ? 'dark' : ''} style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 pt-8">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center shadow-[var(--shadow-sm)]">
              <BrainCircuit size={19} className="text-white" />
            </div>
            <span className="text-lg font-extrabold text-[var(--text-primary)]">MockMate</span>
          </div>
        </div>
        <ProfileSetup
          key={role}
          role={role}
          status={activeProfile.status}
          initial={activeProfile.data}
          saving={myProfile.saving}
          saveError={myProfile.saveError}
          onSave={async data => { const ok = await saveProfile(data); if (ok) goHome() }}
          onSkip={() => { skipProfile(); goHome() }}
          onCancel={() => { skipProfile(); goHome() }}
        />
      </div>
    )
  }

  // Auth pages
  if (page === 'landing') return <Landing onNavigate={nav} dark={dark} onToggleDark={toggleDark} />
  if (page === 'login-selection') return <LoginSelection onNavigate={nav} />
  if (page === 'login') return <Auth mode="login" onNavigate={nav} />
  if (page === 'signup') return <Auth mode="signup" onNavigate={nav} />
  if (page === 'forgot') return <Auth mode="forgot" onNavigate={nav} />
  if (page === 'officer-login') return <OfficerLogin onNavigate={nav} />

  // App pages (with sidebar layout)
  return (
    <Layout page={page as any} onNavigate={nav as any} dark={dark} onToggleDark={toggleDark} role={role} onLogout={() => { void logout() }} userName={userLabel} userEmail={userEmail}>
      {page === 'dashboard' && (
        <Dashboard
          onNavigate={nav}
          profileIncomplete={profileHydrated && !persistedComplete}
          userName={displayName}
          userCollege={collegeLabel}
          upcomingJobs={role === 'student' ? openJobs : []}
          collegeId={collegeId ?? ''}
          studentBranch={role === 'student' ? profile.branch.trim() : ''}
          profileLoading={myProfile.loading || !myProfile.loaded}
          jobsLoading={campusJobs.loading}
          jobsError={campusJobs.error}
          onReloadJobs={campusJobs.reload}
        />
      )}
      {page === 'resume' && <ResumeAnalysis onNavigate={nav} />}
      {page === 'problem-solving' && role === 'student' && (
        <PracticeHub
          onNavigate={nav}
          studentBranch={profile.branch.trim()}
        />
      )}
      {page === 'practice' && role === 'student' && (
        <PracticePage
          kind={routeParam === 'aptitude' ? 'aptitude' : 'branch_mcq'}
          studentBranch={profile.branch.trim()}
          onNavigate={nav}
        />
      )}
      {page === 'interview-setup' && <InterviewSetup onNavigate={nav} onStart={setInterviewConfig} />}
      {page === 'report' && <InterviewReport onNavigate={nav} sessionId={routeParam || null} />}
      {page === 'roadmap' && <Roadmap branch={role === 'student' ? profile.branch.trim() : ''} />}
      {page === 'analytics' && <Analytics onNavigate={nav} />}
      {page === 'placement-cell' && role === 'placement-officer' && (
        <PlacementCell
          jobs={campusJobs.jobs}
          applications={officerApplications.applications}
          loading={campusJobs.loading || officerApplications.loading}
          error={campusJobs.error ?? officerApplications.error}
          collegeName={collegeLabel}
          profileIncomplete={profileHydrated && !persistedComplete}
          onOpenProfile={() => nav('profile-setup')}
          onOpenJobPosting={() => nav('job-posting')}
        />
      )}
      {page === 'job-posting' && role === 'placement-officer' && (
        <JobPosting
          jobs={campusJobs.jobs}
          applications={officerApplications.applications}
          loading={campusJobs.loading}
          error={campusJobs.error}
          collegeName={collegeLabel}
          onCreate={campusJobs.create}
          onUpdate={campusJobs.update}
          onPublish={campusJobs.publish}
          onClose={campusJobs.close}
          onUpdateApplicationStatus={officerApplications.updateStatus}
          onReload={campusJobs.reload}
        />
      )}
      {page === 'job-portal' && (
        <JobPortal
          onNavigate={nav}
          campusJobs={campusJobs.jobs}
          applications={studentApplications.applications}
          studentId={studentId}
          studentName={userLabel}
          collegeId={collegeId ?? ''}
          collegeName={collegeLabel}
          onApply={studentApplications.apply}
          onWithdraw={studentApplications.withdraw}
          jobsLoading={campusJobs.loading}
          jobsError={campusJobs.error}
          appsLoading={studentApplications.loading}
          appsError={studentApplications.error}
          onReload={() => { campusJobs.reload(); studentApplications.reload() }}
        />
      )}
      {page === 'officer-profile' && role === 'placement-officer' && (
        <OfficerProfile
          name={userLabel}
          collegeName={collegeLabel}
          status={activeProfile.status}
          initial={activeProfile.data}
          saving={myProfile.saving}
          saveError={myProfile.saveError}
          onSave={saveProfile}
        />
      )}
      {page === 'profile' && role === 'student' && (
        <Profile
          profile={profile}
          userName={userLabel}
          accountCreatedAt={myProfile.profile?.createdAt ?? null}
          saving={myProfile.saving}
          saveError={myProfile.saveError}
          onSave={saveProfile}
          onNavigate={nav}
          onClearSaveError={myProfile.clearSaveError}
        />
      )}
      {page === 'settings' && (
        <Settings
          userId={user?.id ?? null}
          userName={userLabel}
          userEmail={userEmail}
          role={role}
          collegeName={collegeLabel}
          accountCreatedAt={myProfile.profile?.createdAt ?? null}
          themeMode={themeMode}
          systemDark={systemDark}
          onSetTheme={setThemeMode}
          onNavigate={nav}
          onSignOut={logout}
          onAccountDeleted={accountDeleted}
        />
      )}
    </Layout>
  )
}
