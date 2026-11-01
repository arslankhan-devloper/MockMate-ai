import { useMemo } from 'react'
import { Brain, FileText, Mic, Calendar, ChevronRight, Zap, Target, Flame, Activity, Sparkles, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react'
import { Card, StatCard, Badge, Button, Avatar, ProgressBar } from '../components/ui'
import type { CampusJob } from '../data/campusJobs'
import { useInterviewAnalytics } from '../hooks/useInterviewAnalytics'
import { useAuth } from '../lib/auth'
import { loadResumeAnalysis } from '../lib/resumeStore'
import type { InterviewAnalyticsGroup } from '../lib/interviews'
import RecommendedJobs from '../components/RecommendedJobs'

type Page = 'resume' | 'interview-setup' | 'report' | 'roadmap' | 'analytics' | 'ai-interview' | 'job-portal' | 'profile-setup'

interface DashboardProps {
  onNavigate: (p: Page, param?: string) => void
  profileIncomplete?: boolean
  userName?: string
  userCollege?: string
  /** Open campus drives published for the student's college. */
  upcomingJobs?: CampusJob[]
  collegeId?: string
  studentBranch?: string
  profileLoading?: boolean
  jobsLoading?: boolean
  jobsError?: string | null
  onReloadJobs?: () => void
}

// A session timestamp is a full ISO string, so it is formatted directly rather
// than through the date-only helper used by campus jobs.
function formatSessionDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Completed'
  if (status === 'abandoned') return 'Abandoned'
  return 'In progress'
}

function humanizeType(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'Interview'
  return trimmed.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Reusable empty state used wherever there is no stored activity to show.
function EmptyState({ icon: Icon, title, hint, action }: {
  icon: typeof Mic
  title: string
  hint: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2.5 py-8">
      <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
        <Icon size={20} className="text-[var(--accent-from)]" />
      </div>
      <p className="text-sm font-bold text-[var(--text-primary)]">{title}</p>
      <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">{hint}</p>
      {action && (
        <Button size="sm" variant="secondary" onClick={action.onClick}>
          {action.label} <ChevronRight size={12} />
        </Button>
      )}
    </div>
  )
}

export default function Dashboard({
  onNavigate, profileIncomplete, userName, userCollege, upcomingJobs = [],
  collegeId = '', studentBranch = '', profileLoading = false, jobsLoading = false,
  jobsError = null, onReloadJobs = () => {},
}: DashboardProps) {
  const greetingName = userName?.trim()
  const heading = greetingName ? `Welcome back, ${greetingName}!` : 'Welcome back!'

  // Real, server-aggregated metrics. Nothing is derived or invented in the
  // browser: every value below traces back to a persisted session/turn/score.
  const { data: analytics, loading: analyticsLoading, error: analyticsError, reload: reloadAnalytics } = useInterviewAnalytics('all')
  const totals = analytics?.totals ?? null
  const averageScore = totals?.averageScore ?? null
  const recentSessions = analytics?.recentSessions ?? []

  const { user } = useAuth()
  const storedResume = useMemo(
    () => (user?.id ? loadResumeAnalysis(user.id) : null),
    [user?.id],
  )

  // Only domains with at least one valid evaluated answer are charted; a null
  // average is never rendered as zero.
  const scoredDomains = (analytics?.byDomain ?? []).filter(
    (group): group is InterviewAnalyticsGroup & { averageScore: number } =>
      group.averageScore !== null && group.evaluatedAnswers > 0,
  )
  const weakDomains = [...scoredDomains]
    .sort((a, b) => a.averageScore - b.averageScore)
    .filter(group => group.averageScore < 60)
    .slice(0, 3)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {profileIncomplete && (
        <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <Zap size={15} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Finish setting up your profile</p>
              <p className="text-xs text-[var(--text-muted)]">Add your details to personalise your profile. Your changes are saved to your account.</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onNavigate('profile-setup')}>Complete Profile</Button>
        </Card>
      )}

      {/* Welcome card */}
      <div className="relative overflow-hidden rounded-[var(--radius-xl)] p-6 text-white" style={{ background: 'linear-gradient(135deg, #7c5cfc 0%, #3b82f6 100%)', boxShadow: 'var(--shadow-glow)' }}>
        <div className="absolute right-0 top-0 w-64 h-64 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flame size={15} className="text-yellow-300" />
              <span className="text-xs font-semibold text-white/75">Let's get you interview-ready</span>
            </div>
            <h1 className="text-2xl font-extrabold mb-1">{heading}</h1>
            <p className="text-white/75 text-sm">Start a mock interview or analyze your resume to see your progress appear here.</p>
          </div>
          <div className="flex items-center gap-3">
            <Avatar name={greetingName || 'Student'} size="lg" />
            <div>
              <p className="font-bold text-sm">{greetingName || 'Student'}</p>
              <p className="text-white/60 text-xs">{userCollege?.trim() || 'College not set'}</p>
              <Badge className="mt-1 bg-white/20 text-white border-white/20">Signed in</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <Button onClick={() => onNavigate('interview-setup')} className="bg-white/15 border-white/25 text-white hover:bg-white/25 border" size="sm" variant="ghost">
            <Mic size={13} /> Start Mock Interview
          </Button>
          <Button onClick={() => onNavigate('roadmap')} className="bg-white/15 border-white/25 text-white hover:bg-white/25 border" size="sm" variant="ghost">
            <Target size={13} /> View Roadmap
          </Button>
        </div>
      </div>

      {/* Stat cards — values come from the server-side analytics aggregate;
          a metric with no underlying data stays "—" rather than showing a zero */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Interviews Done"
          value={!analytics ? '—' : String(totals?.sessions ?? 0)}
          sub={analyticsError ? 'Could not load activity' : totals && totals.sessions > 0 ? `${totals.completed} completed · ${totals.inProgress} in progress` : 'No sessions yet'}
          icon={<Mic size={16} />}
        />
        <StatCard
          label="Resume Score"
          value={storedResume ? `${storedResume.analysis.overallScore}` : '—'}
          sub={storedResume
            ? `out of 100 · ${storedResume.jobTitle || storedResume.fileName || 'latest resume'}${storedResume.savedAt ? ` · ${formatSessionDate(storedResume.savedAt)}` : ''}`
            : 'No resume analyzed yet'}
          icon={<FileText size={16} />}
          color="#10b981"
        />
        <StatCard
          label="Avg Interview Score"
          value={averageScore !== null ? averageScore.toFixed(1) : '—'}
          sub={averageScore !== null ? `From ${totals?.evaluatedAnswers ?? 0} evaluated answers` : 'No scored answers yet'}
          icon={<Brain size={16} />}
          color="#3b82f6"
        />
        <StatCard
          label="Questions Answered"
          value={totals?.answeredQuestions != null ? String(totals.answeredQuestions) : '—'}
          sub={analyticsError ? 'Could not load activity' : totals?.answeredQuestions != null ? `${totals.unansweredQuestions ?? 0} skipped` : 'Not tracked yet'}
          icon={<MessageSquare size={16} />}
          color="#f59e0b"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Placement Readiness Index */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Placement Readiness Index</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Not calculated</p>
            </div>
            <Badge variant="info">{averageScore !== null || storedResume ? 'Partial inputs' : 'No data'}</Badge>
          </div>
          {averageScore === null && !storedResume ? (
            <EmptyState
              icon={Target}
              title="Readiness not calculated"
              hint="Your Placement Readiness Index is derived from real activity. Complete a mock interview or analyze a resume to start building it."
              action={{ label: 'Start Interview', onClick: () => onNavigate('interview-setup') }}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[var(--text-secondary)]">Resume score</span>
                <span className="font-bold text-[var(--text-primary)]">
                  {storedResume ? `${storedResume.analysis.overallScore}/100` : 'Not analyzed'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[var(--text-secondary)]">Average interview score</span>
                <span className="font-bold text-[var(--text-primary)]">
                  {averageScore !== null ? `${averageScore.toFixed(1)}/100` : 'Not scored'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[var(--text-secondary)]">Sessions completed</span>
                <span className="font-bold text-[var(--text-primary)]">{totals?.completed ?? 0}</span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed pt-1">
                A full index also needs communication and consistency scoring, which this build does not calculate, so
                the real inputs are shown instead of an invented score.
              </p>
            </div>
          )}
        </Card>

        {/* Skill Radar */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Skill Radar</p>
            {scoredDomains.length > 0 && <Badge variant="info">By domain</Badge>}
          </div>
          {scoredDomains.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No skills assessed yet"
              hint="Domain scores appear after your completed answers are evaluated."
            />
          ) : (
            <div className="space-y-3.5">
              {scoredDomains.slice(0, 4).map(group => (
                <div key={group.key}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{group.label}</p>
                    <span className="text-xs font-bold text-[var(--text-secondary)] flex-shrink-0">
                      {group.averageScore.toFixed(1)}/100
                    </span>
                  </div>
                  <ProgressBar value={group.averageScore} size="sm" />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recommended jobs — replaces the previous Upcoming Jobs slot */}
        <RecommendedJobs
          jobs={upcomingJobs}
          collegeId={collegeId}
          studentBranch={studentBranch}
          profileLoading={profileLoading}
          jobsLoading={jobsLoading}
          jobsError={jobsError}
          onReloadJobs={onReloadJobs}
          storedResume={storedResume}
          onNavigate={onNavigate}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Recent Activity</p>
              <button onClick={() => onNavigate('analytics')} className="text-xs text-[var(--accent-from)] font-semibold hover:underline flex items-center gap-1">View All <ChevronRight size={13} /></button>
            </div>
            {analyticsError ? (
              <div className="flex flex-col items-center text-center gap-2.5 py-8">
                <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
                  <AlertCircle size={20} className="text-[var(--accent-from)]" />
                </div>
                <p className="text-sm font-bold text-[var(--text-primary)]">Could not load your activity</p>
                <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">{analyticsError}</p>
                <Button size="sm" variant="secondary" onClick={reloadAnalytics}><RefreshCw size={12} /> Retry</Button>
              </div>
            ) : recentSessions.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title={analyticsLoading ? 'Loading your activity…' : 'No recent activity'}
                hint="Interviews, resume checks and practice sessions will show up here once you complete them."
                action={{ label: 'Start a Session', onClick: () => onNavigate('interview-setup') }}
              />
            ) : (
              <div className="space-y-3">
                {recentSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onNavigate('report', s.id)}
                    className="w-full text-left p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-from)] transition-all-smooth cursor-pointer flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                      <Mic size={15} className="text-[var(--accent-from)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {humanizeType(s.interviewType)}{s.difficulty ? ` · ${s.difficulty}` : ''}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{formatSessionDate(s.startedAt)} · {statusLabel(s.status)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-extrabold ${s.averageScore !== null ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                        {s.averageScore !== null ? s.averageScore.toFixed(1) : '—'}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {s.questionCount !== null ? `${s.answeredQuestions ?? 0}/${s.questionCount} answered` : 'View report'}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Weak Skills + Suggestions */}
        <div className="space-y-5">
          <Card className="p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">Weak Skills</p>
            {weakDomains.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No weak areas identified"
                hint={scoredDomains.length > 0
                  ? 'Every scored domain is currently at or above 60/100.'
                  : 'Areas to improve appear once answers have been evaluated.'}
              />
            ) : (
              <div className="space-y-3">
                {weakDomains.map(group => (
                  <div key={group.key}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{group.label}</p>
                      <span className="text-xs font-bold text-[var(--text-secondary)] flex-shrink-0">
                        {group.averageScore.toFixed(1)}/100
                      </span>
                    </div>
                    <ProgressBar value={group.averageScore} size="sm" color="#f59e0b" />
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      {group.evaluatedAnswers} evaluated answer{group.evaluatedAnswers === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-[var(--accent-from)]" />
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Practice Suggestions</p>
            </div>
            {weakDomains.length === 0 ? (
              <EmptyState
                icon={Zap}
                title="No suggestions yet"
                hint="Suggestions are based on your lowest scored domains and appear once answers have been evaluated."
              />
            ) : (
              <div className="space-y-2">
                {weakDomains.map(group => (
                  <button
                    key={group.key}
                    onClick={() => onNavigate('interview-setup')}
                    className="w-full text-left p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-from)] transition-all-smooth cursor-pointer"
                  >
                    <p className="text-xs font-bold text-[var(--text-primary)]">Practise {group.label}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                      Average {group.averageScore.toFixed(1)}/100 across {group.evaluatedAnswers} evaluated answer{group.evaluatedAnswers === 1 ? '' : 's'}.
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
