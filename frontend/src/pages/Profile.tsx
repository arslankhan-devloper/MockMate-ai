import { useEffect, useState, type ReactNode } from 'react'
import {
  Edit3, Save, X, Mail, Phone, Building2, GraduationCap, BookOpen, Info,
  CheckCircle2, AlertCircle, Briefcase, CalendarDays, Activity, ChevronRight,
  Mic, RefreshCw, BarChart3, ShieldCheck, UserCircle,
} from 'lucide-react'
import { Card, Button, Input, Badge, Avatar, TabBar, ProgressBar } from '../components/ui'
import { type ProfileData } from '../data/profiles'
import { useInterviewAnalytics } from '../hooks/useInterviewAnalytics'
import { profileSnapshot, validateProfileForm, type ProfileFormErrors } from '../lib/profileForm'

type ProfilePage = 'interview-setup' | 'report' | 'analytics' | 'job-portal' | 'settings'
type ProfileTab = 'Overview' | 'Interviews' | 'Applications'

const tabs: ProfileTab[] = ['Overview', 'Interviews', 'Applications']

interface ProfileProps {
  profile: ProfileData
  userName: string
  accountCreatedAt?: string | null
  saving?: boolean
  saveError?: string | null
  onSave?: (data: ProfileData) => Promise<boolean> | boolean
  onNavigate?: (page: ProfilePage, param?: string) => void
  onClearSaveError?: () => void
}

function EmptyPanel({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: typeof BookOpen
  title: string
  hint: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-10">
      <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
        <Icon size={22} className="text-[var(--accent-from)]" />
      </div>
      <h3 className="font-extrabold text-[var(--text-primary)]">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed">{hint}</p>
      {action}
    </div>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Completed'
  if (status === 'abandoned') return 'Abandoned'
  return 'In progress'
}

function statusVariant(status: string): 'success' | 'warning' | 'info' {
  if (status === 'completed') return 'success'
  if (status === 'abandoned') return 'warning'
  return 'info'
}

export default function Profile({
  profile,
  userName,
  accountCreatedAt = null,
  saving = false,
  saveError = null,
  onSave,
  onNavigate,
  onClearSaveError,
}: ProfileProps) {
  const [tab, setTab] = useState<ProfileTab>('Overview')
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [data, setData] = useState<ProfileData>(profile)
  const [errors, setErrors] = useState<ProfileFormErrors>({})

  const { data: analytics, loading: analyticsLoading, error: analyticsError, reload } =
    useInterviewAnalytics('all')
  const snapshot = profileSnapshot(analytics)
  const recentSessions = analytics?.recentSessions ?? []
  const applicationStatuses = snapshot?.applicationStatuses ?? []

  useEffect(() => {
    if (!editing) setData(profile)
  }, [profile, editing])

  const displayName = data.fullName.trim() || userName || 'Student'
  const headline = [data.branch, data.gradYear, data.collegeName].filter(Boolean).join(' | ')
  const profileComplete = Boolean(
    data.fullName.trim() && data.branch.trim() && data.gradYear.trim(),
  )

  const set = (key: keyof ProfileData, value: string) => {
    setData(current => ({ ...current, [key]: value }))
    setErrors(current => (current[key as keyof ProfileFormErrors] ? { ...current, [key]: undefined } : current))
    setSaved(false)
  }

  const startEditing = () => {
    onClearSaveError?.()
    setEditing(true)
    setSaved(false)
  }

  const cancelEditing = () => {
    setData(profile)
    setErrors({})
    onClearSaveError?.()
    setEditing(false)
  }

  const handleSave = async () => {
    if (!onSave) {
      setEditing(false)
      return
    }
    const nextErrors = validateProfileForm(data)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const ok = await onSave({ ...data })
    if (ok) {
      setEditing(false)
      setSaved(true)
    }
  }

  const analyticsValue = (value: number | null, suffix = '') => {
    if (analyticsLoading && value === null) return '...'
    if (value === null) return '-'
    return `${value}${suffix}`
  }

  const stats = [
    { label: 'Interviews', value: analyticsValue(snapshot?.sessions ?? null) },
    { label: 'Completed', value: analyticsValue(snapshot?.completed ?? null) },
    {
      label: 'Average score',
      value: snapshot?.averageScore === null || snapshot?.averageScore === undefined
        ? analyticsValue(null)
        : analyticsValue(Math.round(snapshot.averageScore), '%'),
    },
    { label: 'Applications', value: analyticsValue(snapshot?.applications ?? null) },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Profile</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Your saved account details and MockMate activity.
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
              <X size={13} /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={saving}>
              <Save size={13} /> {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={startEditing}>
            <Edit3 size={13} /> Edit Profile
          </Button>
        )}
      </div>

      {saved && !editing && (
        <Card className="p-3 flex items-center gap-2.5">
          <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Profile saved to your account.
          </p>
        </Card>
      )}

      {saveError && editing && (
        <Card className="p-3 flex items-center gap-2.5 border-red-500/30">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-500 leading-relaxed">{saveError}</p>
        </Card>
      )}

      {analyticsError && (
        <Card className="p-3 flex items-center gap-2.5 border-red-500/30">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-500 leading-relaxed flex-1">{analyticsError}</p>
          <Button size="sm" variant="ghost" onClick={reload}><RefreshCw size={12} /> Retry</Button>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <Avatar name={displayName} size="xl" />
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Full name"
                  value={data.fullName}
                  onChange={event => set('fullName', event.target.value)}
                  placeholder="Your name"
                  leftIcon={<UserCircle size={13} />}
                  error={errors.fullName}
                />
                <Input
                  label="College"
                  value={data.collegeName}
                  readOnly
                  placeholder="Assigned by your placement cell"
                  leftIcon={<Building2 size={13} />}
                  className="opacity-70 cursor-not-allowed"
                />
                <Input
                  label="Branch"
                  value={data.branch}
                  onChange={event => set('branch', event.target.value)}
                  placeholder="e.g. Computer Science"
                  leftIcon={<GraduationCap size={13} />}
                  error={errors.branch}
                />
                <Input
                  label="Graduation year"
                  value={data.gradYear}
                  onChange={event => set('gradYear', event.target.value)}
                  placeholder="e.g. 2026"
                  error={errors.gradYear}
                />
              </div>
            ) : (
              <>
                <h2 className="text-xl font-extrabold text-[var(--text-primary)] mb-0.5">{displayName}</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-2">
                  {headline || 'Add your branch and graduation year to complete your profile'}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="info">Student</Badge>
                  <Badge variant={profileComplete ? 'success' : 'warning'}>
                    {profileComplete ? 'Profile complete' : 'Profile incomplete'}
                  </Badge>
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {stats.map(stat => (
              <div key={stat.label}>
                <p className="text-xl font-extrabold gradient-text">{stat.value}</p>
                <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-4 flex items-center gap-1.5">
          <Info size={12} /> Name, phone and course details are saved to your account. Email, role and college are managed by your account or placement cell.
        </p>
      </Card>

      <TabBar tabs={tabs} active={tab} onChange={next => setTab(next as ProfileTab)} />

      {tab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Contact Information</p>
            {editing ? (
              <div className="space-y-3">
                <Input
                  label="Email"
                  value={data.email}
                  readOnly
                  placeholder="Managed by your account"
                  leftIcon={<Mail size={13} />}
                  className="opacity-70 cursor-not-allowed"
                />
                <Input
                  label="Phone"
                  value={data.phone}
                  onChange={event => set('phone', event.target.value)}
                  placeholder="+91 90000 00000"
                  leftIcon={<Phone size={13} />}
                  error={errors.phone}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { icon: Mail, label: 'Email', value: data.email },
                  { icon: Phone, label: 'Phone', value: data.phone },
                  { icon: Building2, label: 'College', value: data.collegeName },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3">
                    <item.icon size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{item.label}</p>
                      <p className={`text-sm break-words ${item.value ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] italic'}`}>
                        {item.value || 'Not provided'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Academic Details</p>
            <div className="space-y-3">
              {[
                { icon: GraduationCap, label: 'Branch', value: data.branch },
                { icon: CalendarDays, label: 'Graduation year', value: data.gradYear },
                { icon: Building2, label: 'College', value: data.collegeName },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3">
                  <item.icon size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{item.label}</p>
                    <p className={`text-sm break-words ${item.value ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] italic'}`}>
                      {item.value || 'Not provided'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Account</p>
            <div className="space-y-3">
              {[
                { icon: ShieldCheck, label: 'Role', value: 'Student' },
                { icon: UserCircle, label: 'Email', value: data.email },
                { icon: CalendarDays, label: 'Member since', value: formatDate(accountCreatedAt) },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3">
                  <item.icon size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{item.label}</p>
                    <p className="text-sm text-[var(--text-secondary)] break-words">{item.value || '-'}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Email, role and college membership cannot be changed from this page.
            </p>
            {onNavigate && (
              <Button size="sm" variant="secondary" onClick={() => onNavigate('settings')}>
                Open Settings
              </Button>
            )}
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Briefcase size={15} className="text-[var(--accent-from)]" />
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Placement Snapshot</p>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('job-portal')}
                  className="ml-auto text-xs text-[var(--accent-from)] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Job Portal <ChevronRight size={13} />
                </button>
              )}
            </div>
            {analyticsLoading && !analytics ? (
              <p className="text-xs text-[var(--text-muted)]">Loading application activity...</p>
            ) : snapshot?.applications === null || snapshot?.applications === undefined ? (
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                Application activity is not available in this environment yet.
              </p>
            ) : applicationStatuses.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  No job applications have been recorded yet.
                </p>
                {onNavigate && (
                  <Button size="sm" variant="secondary" onClick={() => onNavigate('job-portal')}>
                    <Briefcase size={13} /> Browse Jobs
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-2xl font-extrabold text-[var(--text-primary)]">{snapshot?.applications ?? 0}</p>
                  <p className="text-xs text-[var(--text-muted)]">total applications</p>
                </div>
                <div className="space-y-3">
                  {applicationStatuses.map(status => (
                    <div key={status.status} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--text-secondary)]">{status.status}</span>
                        <span className="text-xs font-bold text-[var(--text-primary)]">{status.count}</span>
                      </div>
                      <ProgressBar
                        value={snapshot?.applications ? (status.count / snapshot.applications) * 100 : 0}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {tab === 'Interviews' && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mic size={15} className="text-[var(--accent-from)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Recent Interviews</p>
            {onNavigate && recentSessions.length > 0 && (
              <button
                onClick={() => onNavigate('analytics')}
                className="ml-auto text-xs text-[var(--accent-from)] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <BarChart3 size={12} /> Analytics
              </button>
            )}
          </div>

          {analyticsError ? (
            <EmptyPanel
              icon={AlertCircle}
              title="Could not load interviews"
              hint={analyticsError}
              action={<Button size="sm" variant="secondary" onClick={reload}><RefreshCw size={12} /> Retry</Button>}
            />
          ) : analyticsLoading && !analytics ? (
            <p className="text-xs text-[var(--text-muted)]">Loading recent interviews...</p>
          ) : analytics && !analytics.availability.sessions ? (
            <EmptyPanel
              icon={Activity}
              title="Interview history unavailable"
              hint="Interview sessions are not available in this environment yet."
            />
          ) : recentSessions.length === 0 ? (
            <EmptyPanel
              icon={Mic}
              title="No interviews yet"
              hint="Completed and in-progress AI interviews appear here after you start a session."
              action={onNavigate ? (
                <Button size="sm" onClick={() => onNavigate('interview-setup')}>
                  <Mic size={13} /> Start an Interview
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-3">
              {recentSessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => onNavigate?.('report', session.id)}
                  disabled={!onNavigate}
                  className="w-full text-left p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-from)] transition-all-smooth cursor-pointer disabled:cursor-default disabled:hover:border-[var(--border)] flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                    {session.status === 'completed'
                      ? <CheckCircle2 size={15} className="text-[var(--accent-from)]" />
                      : <Activity size={15} className="text-[var(--accent-from)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] capitalize truncate">
                      {session.mode || session.interviewType || 'Interview'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{formatDate(session.startedAt)}</span>
                      <Badge variant={statusVariant(session.status)}>{statusLabel(session.status)}</Badge>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-extrabold ${session.averageScore !== null ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                      {session.averageScore !== null ? `${Math.round(session.averageScore)}%` : '-'}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {session.questionCount !== null
                        ? `${session.answeredQuestions ?? 0}/${session.questionCount} answered`
                        : 'View report'}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'Applications' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Briefcase size={15} className="text-[var(--accent-from)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Job Applications</p>
            {snapshot?.applications !== null && snapshot?.applications !== undefined && (
              <Badge variant="info" className="ml-auto">{snapshot.applications} total</Badge>
            )}
          </div>

          {analyticsError ? (
            <EmptyPanel
              icon={AlertCircle}
              title="Could not load applications"
              hint={analyticsError}
              action={<Button size="sm" variant="secondary" onClick={reload}><RefreshCw size={12} /> Retry</Button>}
            />
          ) : analyticsLoading && !analytics ? (
            <p className="text-xs text-[var(--text-muted)]">Loading application activity...</p>
          ) : snapshot?.applications === null || snapshot?.applications === undefined ? (
            <EmptyPanel
              icon={Briefcase}
              title="Applications unavailable"
              hint="Application activity is not available in this environment yet."
            />
          ) : applicationStatuses.length === 0 ? (
            <EmptyPanel
              icon={Briefcase}
              title="No applications yet"
              hint="Applications you submit through the Job Portal appear here with their current status."
              action={onNavigate ? (
                <Button size="sm" onClick={() => onNavigate('job-portal')}>
                  <Briefcase size={13} /> Browse Jobs
                </Button>
              ) : undefined}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {applicationStatuses.map(status => (
                  <div key={status.status} className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
                    <p className="text-2xl font-extrabold text-[var(--text-primary)]">{status.count}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{status.status}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Only applications recorded through MockMate are counted. Application status is updated by your placement cell.
              </p>
            </>
          )}
        </Card>
      )}

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed flex items-center gap-1.5">
        <Info size={12} /> This page only shows data saved to your MockMate account.
      </p>
    </div>
  )
}
