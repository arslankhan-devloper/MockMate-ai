import { useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BellOff,
  Building2,
  CalendarDays,
  CheckCircle2,
  Code2,
  Info,
  Languages,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Moon,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  Type,
  UserCircle,
} from 'lucide-react'
import { Card, Button, Badge, Input } from '../components/ui'
import { useAuth } from '../lib/auth'
import { accountProfilePage, validatePasswordChange } from '../lib/account'
import {
  DELETE_ACCOUNT_CONFIRMATION,
  clearDeletedUserLocalData,
  requestAccountDeletion,
  validateDeleteAccountInput,
} from '../lib/accountDeletion'
import { ApiError } from '../lib/api'
import {
  CODING_LANGUAGES,
  EDITOR_FONT_SIZES,
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_DURATIONS,
  INTERVIEW_QUESTION_COUNTS,
  INTERVIEW_TYPES,
  browserPreferenceStorage,
  loadUserPreferences,
  resetUserPreferences,
  saveUserPreferences,
  type CodingLanguagePreference,
  type InterviewDifficulty,
  type InterviewDuration,
  type InterviewQuestionCount,
  type InterviewTypePreference,
  type UserPreferences,
} from '../lib/preferences'
import type { ThemeMode } from '../lib/theme'

interface SettingsProps {
  userId: string | null
  userName: string
  userEmail: string
  role: 'student' | 'placement-officer'
  collegeName: string
  accountCreatedAt?: string | null
  themeMode: ThemeMode
  systemDark: boolean
  onSetTheme: (mode: ThemeMode) => void
  onNavigate: (page: 'profile' | 'officer-profile' | 'interview-setup' | 'coding-interview') => void
  onSignOut: () => Promise<void>
  onAccountDeleted: () => Promise<void>
}

interface FeedbackMessage {
  tone: 'success' | 'error'
  text: string
}

const interviewTypeLabels: Record<InterviewTypePreference, string> = {
  technical: 'Technical',
  hr: 'HR / Behavioral',
  aptitude: 'Aptitude',
  combined: 'Combined',
  resume: 'Resume-based',
}

const codingLanguageLabels: Record<CodingLanguagePreference, string> = {
  python: 'Python',
  javascript: 'JavaScript',
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Not available'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function readPreferences(userId: string | null): UserPreferences {
  return loadUserPreferences(browserPreferenceStorage(), userId)
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-2 px-3 rounded-[var(--radius-md)] text-xs font-bold transition-all-smooth cursor-pointer ${
        active
          ? 'gradient-bg text-white'
          : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'
      }`}
    >
      {children}
    </button>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)]">
      <Info size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{children}</p>
    </div>
  )
}

function Feedback({ message }: { message: FeedbackMessage }) {
  const success = message.tone === 'success'
  return (
    <div
      className={`flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] border ${
        success
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-red-500/5 border-red-500/20'
      }`}
      role={success ? 'status' : 'alert'}
    >
      {success ? (
        <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
      ) : (
        <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
      )}
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{message.text}</p>
    </div>
  )
}

export default function Settings({
  userId,
  userName,
  userEmail,
  role,
  collegeName,
  accountCreatedAt = null,
  themeMode,
  systemDark,
  onSetTheme,
  onNavigate,
  onSignOut,
  onAccountDeleted,
}: SettingsProps) {
  const { changePassword, session } = useAuth()

  const [savedPreferences, setSavedPreferences] = useState<UserPreferences>(
    () => readPreferences(userId),
  )
  const [draftPreferences, setDraftPreferences] = useState<UserPreferences>(
    () => readPreferences(userId),
  )
  const [preferenceFeedback, setPreferenceFeedback] = useState<FeedbackMessage | null>(null)

  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordFeedback, setPasswordFeedback] = useState<FeedbackMessage | null>(null)

  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteSucceeded, setDeleteSucceeded] = useState(false)
  const [deleteFeedback, setDeleteFeedback] = useState<FeedbackMessage | null>(null)

  const roleLabel = role === 'placement-officer' ? 'Placement Officer' : 'Student'
  const profilePage = accountProfilePage(role)
  const hasUnsavedPreferences =
    JSON.stringify(savedPreferences) !== JSON.stringify(draftPreferences)

  const themeOptions: { id: ThemeMode; icon: typeof Sun; label: string }[] = [
    { id: 'light', icon: Sun, label: 'Light' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'system', icon: Monitor, label: 'System' },
  ]

  const updateInterview = <K extends keyof UserPreferences['interview']>(
    key: K,
    value: UserPreferences['interview'][K],
  ) => {
    setDraftPreferences(previous => ({
      ...previous,
      interview: { ...previous.interview, [key]: value },
    }))
    setPreferenceFeedback(null)
  }

  const updateCoding = <K extends keyof UserPreferences['coding']>(
    key: K,
    value: UserPreferences['coding'][K],
  ) => {
    setDraftPreferences(previous => ({
      ...previous,
      coding: { ...previous.coding, [key]: value },
    }))
    setPreferenceFeedback(null)
  }

  const savePreferences = () => {
    if (!saveUserPreferences(browserPreferenceStorage(), userId, draftPreferences)) {
      setPreferenceFeedback({
        tone: 'error',
        text: 'Could not save preferences in this browser. Check that site storage is enabled and try again.',
      })
      return
    }
    const next = readPreferences(userId)
    setSavedPreferences(next)
    setDraftPreferences(next)
    setPreferenceFeedback({
      tone: 'success',
      text: 'Default preferences saved for this account on this browser.',
    })
  }

  const resetPreferences = () => {
    if (!resetUserPreferences(browserPreferenceStorage(), userId)) {
      setPreferenceFeedback({
        tone: 'error',
        text: 'Could not restore default preferences in this browser. Check that site storage is enabled and try again.',
      })
      return
    }
    const next = readPreferences(userId)
    setSavedPreferences(next)
    setDraftPreferences(next)
    setPreferenceFeedback({
      tone: 'success',
      text: 'Practice defaults restored to the documented defaults.',
    })
  }

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validatePasswordChange(password, confirmation)
    if (validationError) {
      setPasswordFeedback({ tone: 'error', text: validationError })
      return
    }

    setPasswordSaving(true)
    setPasswordFeedback(null)
    try {
      const result = await changePassword(password)
      if (result.error) {
        setPasswordFeedback({ tone: 'error', text: result.error })
        return
      }
      setPassword('')
      setConfirmation('')
      setPasswordFeedback({
        tone: 'success',
        text: 'Password updated successfully.',
      })
    } catch {
      setPasswordFeedback({
        tone: 'error',
        text: 'Could not update your password. Please try again.',
      })
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    setSignOutError(null)
    try {
      await onSignOut()
    } catch {
      setSignOutError('Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  const submitAccountDeletion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validateDeleteAccountInput({
      password: deletePassword,
      confirmation: deleteConfirmation,
      acknowledged: deleteAcknowledged,
    })
    if (validationError) {
      setDeleteFeedback({ tone: 'error', text: validationError })
      return
    }

    setDeleteLoading(true)
    setDeleteFeedback(null)
    try {
      await requestAccountDeletion(
        session?.access_token,
        deletePassword,
        deleteConfirmation,
      )
      setDeleteSucceeded(true)
      setDeletePassword('')
      setDeleteConfirmation('')
      setDeleteAcknowledged(false)
      clearDeletedUserLocalData(session?.user.id)
      setDeleteFeedback({
        tone: 'success',
        text: 'Account deleted. Signing you out and removing this account from this browser...',
      })
      await new Promise(resolve => setTimeout(resolve, 900))
      await onAccountDeleted()
    } catch (error) {
      let message = 'Account deletion did not complete. No success was recorded. Please try again.'
      if (error instanceof ApiError) {
        if (error.status === 401) {
          message = 'Your session has expired. Sign in again before deleting your account.'
        } else if (error.status === 403 && error.code === 'reauth_failed') {
          message = 'The current password could not be verified. No data was deleted.'
        } else if (error.status === 429) {
          message = error.message
        } else if (error.status === 503) {
          message = error.message
        } else if (error.status >= 500) {
          message = 'Account deletion did not complete. No success was recorded; you can retry safely.'
        } else {
          message = error.message
        }
      }
      setDeleteFeedback({ tone: 'error', text: message })
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Manage your account and the defaults used by new practice sessions.
        </p>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full gradient-bg flex items-center justify-center flex-shrink-0">
            <UserCircle size={24} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                {userName || 'Your account'}
              </h2>
              <Badge variant="info">{roleLabel}</Badge>
            </div>
            <p className="text-sm text-[var(--text-secondary)] truncate">
              {userEmail || 'Email not available'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: Mail, label: 'Email', value: userEmail || 'Not available' },
            { icon: Building2, label: 'College', value: collegeName || 'Not set' },
            { icon: ShieldCheck, label: 'Account role', value: roleLabel },
            { icon: CalendarDays, label: 'Member since', value: formatDate(accountCreatedAt) },
          ].map(item => (
            <div
              key={item.label}
              className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]"
            >
              <item.icon size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {item.label}
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)] break-words">
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Name, phone and course details are edited on your profile. Email, role and college are
          managed by your account or placement cell.
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => onNavigate(profilePage)}>
            <UserCircle size={13} /> Manage profile
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { void handleSignOut() }}
            loading={signingOut}
            disabled={signingOut}
          >
            <LogOut size={13} /> Sign out
          </Button>
        </div>

        {signOutError && <Feedback message={{ tone: 'error', text: signOutError }} />}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-[var(--accent-from)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Password and security
          </p>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Change the password for this signed-in account. Your email address stays the same.
        </p>
        <form onSubmit={submitPassword} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={event => {
                setPassword(event.target.value)
                setPasswordFeedback(null)
              }}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmation}
              onChange={event => {
                setConfirmation(event.target.value)
                setPasswordFeedback(null)
              }}
              autoComplete="new-password"
              placeholder="Re-enter the new password"
              required
            />
          </div>
          {passwordFeedback && <Feedback message={passwordFeedback} />}
          <Button
            type="submit"
            size="sm"
            loading={passwordSaving}
            disabled={passwordSaving || !password || !confirmation}
          >
            Update password
          </Button>
        </form>
      </Card>

      <Card className="p-6 space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Appearance
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeOptions.map(option => {
            const active = themeMode === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSetTheme(option.id)}
                aria-pressed={active}
                className={`flex items-center gap-3 p-4 rounded-[var(--radius-lg)] border-2 transition-all-smooth cursor-pointer ${
                  active
                    ? 'border-[var(--accent-from)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center flex-shrink-0 ${
                    active
                      ? 'gradient-bg text-white'
                      : 'bg-[var(--accent-soft)] text-[var(--accent-from)]'
                  }`}
                >
                  <option.icon size={16} />
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {option.label}
                </span>
                {active && <Badge variant="default" className="ml-auto">Active</Badge>}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
          {themeMode === 'system'
            ? `Following your system appearance, currently ${systemDark ? 'dark' : 'light'}.`
            : `Theme set manually to ${themeMode === 'dark' ? 'dark' : 'light'} mode.`}
        </p>
      </Card>

      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Code2 size={14} className="text-[var(--accent-from)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            AI Interview defaults
          </p>
          {hasUnsavedPreferences && <Badge variant="warning">Unsaved changes</Badge>}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          These values prefill new AI interview setup. They do not change a session already in
          progress.
        </p>

        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Default interview type
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {INTERVIEW_TYPES.map(type => (
              <ChoiceButton
                key={type}
                active={draftPreferences.interview.type === type}
                onClick={() => updateInterview('type', type)}
              >
                {interviewTypeLabels[type]}
              </ChoiceButton>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Difficulty
          </p>
          <div className="grid grid-cols-4 gap-2">
            {INTERVIEW_DIFFICULTIES.map((difficulty: InterviewDifficulty) => (
              <ChoiceButton
                key={difficulty}
                active={draftPreferences.interview.difficulty === difficulty}
                onClick={() => updateInterview('difficulty', difficulty)}
              >
                {difficulty}
              </ChoiceButton>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Duration
            </p>
            <div className="grid grid-cols-4 gap-2">
              {INTERVIEW_DURATIONS.map((minutes: InterviewDuration) => (
                <ChoiceButton
                  key={minutes}
                  active={draftPreferences.interview.durationMinutes === minutes}
                  onClick={() => updateInterview('durationMinutes', minutes)}
                >
                  {minutes}m
                </ChoiceButton>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Question limit
            </p>
            <div className="grid grid-cols-3 gap-2">
              {INTERVIEW_QUESTION_COUNTS.map((count: InterviewQuestionCount) => (
                <ChoiceButton
                  key={count}
                  active={draftPreferences.interview.questionCount === count}
                  onClick={() => updateInterview('questionCount', count)}
                >
                  {count}
                </ChoiceButton>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
          <Languages size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">English only</p>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Questions, follow-ups, evaluations and feedback are generated in English. No other
              interview language is available.
            </p>
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={() => onNavigate('interview-setup')}>
          Open interview setup
        </Button>
      </Card>

      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Type size={14} className="text-[var(--accent-from)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Problem Solving defaults
          </p>
          {hasUnsavedPreferences && <Badge variant="warning">Unsaved changes</Badge>}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Choose the starting language and editor text size for new practice problems.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Default language
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CODING_LANGUAGES.map(language => (
                <ChoiceButton
                  key={language}
                  active={draftPreferences.coding.language === language}
                  onClick={() => updateCoding('language', language)}
                >
                  {codingLanguageLabels[language]}
                </ChoiceButton>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Editor font size
            </p>
            <div className="grid grid-cols-4 gap-2">
              {EDITOR_FONT_SIZES.map(size => (
                <ChoiceButton
                  key={size}
                  active={draftPreferences.coding.fontSize === size}
                  onClick={() => updateCoding('fontSize', size)}
                >
                  {size}px
                </ChoiceButton>
              ))}
            </div>
          </div>
        </div>

        <Note>
          The default language applies to problems without a saved draft. Existing drafts keep the
          language you last used. Problem difficulty is selected adaptively by the practice engine
          and is not configurable here.
        </Note>

        <Button variant="secondary" size="sm" onClick={() => onNavigate('coding-interview')}>
          Open problem solving
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Save size={14} className="text-[var(--accent-from)]" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Save practice defaults</p>
          <Badge variant={hasUnsavedPreferences ? 'warning' : 'success'}>
            {hasUnsavedPreferences ? 'Unsaved changes' : 'All changes saved'}
          </Badge>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Preferences are stored on this browser for this signed-in account. Appearance changes are
          applied immediately.
        </p>
        {preferenceFeedback && <Feedback message={preferenceFeedback} />}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={resetPreferences}
            disabled={!userId}
          >
            <RotateCcw size={13} /> Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={savePreferences}
            disabled={!hasUnsavedPreferences || !userId}
          >
            <Save size={13} /> Save preferences
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <BellOff size={14} className="text-[var(--accent-from)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Notifications
          </p>
          <Badge variant="warning">Not configured</Badge>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Email, push, reminder and weekly-report delivery are not connected in this build. No
          notification controls are shown because MockMate cannot send those messages.
        </p>
      </Card>

      <Card className="p-6 space-y-4 border-red-500/20">
        <div className="flex items-center gap-2 flex-wrap">
          <Shield size={14} className="text-red-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Data and privacy
          </p>
          <Badge variant="error">Permanent action</Badge>
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">Delete account</p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-1">
            Permanently delete your MockMate account and the data owned by it. This cannot be
            undone and the account cannot be recovered.
          </p>
        </div>

        {!deleteOpen && !deleteSucceeded && (
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={13} /> Delete account
          </Button>
        )}

        {deleteOpen && !deleteSucceeded && (
          <form onSubmit={submitAccountDeletion} className="space-y-4">
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-red-500/5 border border-red-500/20"
            >
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-2">
                <p className="font-semibold text-[var(--text-primary)]">
                  This permanently deletes your account.
                </p>
                <p>
                  Deleted: your profile, interview sessions, turns, evaluations and reports,
                  problem-solving sessions, questions and submissions, roadmap progress, job
                  applications, and this account&apos;s locally stored analysis and drafts.
                </p>
                <p>
                  Kept: institution-owned college records and job postings. If you posted jobs as a
                  placement officer, those postings remain with the poster link removed. Your
                  college may retain independent records outside MockMate.
                </p>
                <p>
                  Resume files are processed in memory and are not stored in a MockMate file bucket.
                  Provider backups, authentication logs and operational logs may retain copies for
                  their configured retention windows. A pseudonymous deletion audit record (user id,
                  outcome, no profile data) is targeted for purge after 30 days.
                </p>
              </div>
            </div>

            <Input
              label="Current password (reauthentication)"
              type="password"
              value={deletePassword}
              onChange={event => {
                setDeletePassword(event.target.value)
                setDeleteFeedback(null)
              }}
              autoComplete="current-password"
              placeholder="Enter your current password"
              required
            />

            <Input
              label={`Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm`}
              value={deleteConfirmation}
              onChange={event => {
                setDeleteConfirmation(event.target.value)
                setDeleteFeedback(null)
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder={DELETE_ACCOUNT_CONFIRMATION}
              required
            />

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteAcknowledged}
                onChange={event => {
                  setDeleteAcknowledged(event.target.checked)
                  setDeleteFeedback(null)
                }}
                className="mt-0.5 h-4 w-4 accent-red-500"
              />
              <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                I understand that deletion is permanent, that I will be signed out, and that data in
                provider backups or logs may remain until their retention period expires.
              </span>
            </label>

            {deleteFeedback && <Feedback message={deleteFeedback} />}

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="submit"
                variant="danger"
                size="sm"
                loading={deleteLoading}
                disabled={
                  deleteLoading ||
                  !deletePassword ||
                  deleteConfirmation !== DELETE_ACCOUNT_CONFIRMATION ||
                  !deleteAcknowledged
                }
              >
                <Trash2 size={13} /> Permanently delete account
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleteLoading}
                onClick={() => {
                  setDeleteOpen(false)
                  setDeletePassword('')
                  setDeleteConfirmation('')
                  setDeleteAcknowledged(false)
                  setDeleteFeedback(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {deleteSucceeded && (
          <Feedback
            message={{
              tone: 'success',
              text: 'Account deleted. Signing you out and removing this account from this browser...',
            }}
          />
        )}
      </Card>
    </div>
  )
}
