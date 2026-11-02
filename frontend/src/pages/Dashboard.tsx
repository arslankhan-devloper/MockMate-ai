import { useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Brain,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Code2,
  Compass,
  FileText,
  Flame,
  GraduationCap,
  Lightbulb,
  Mic,
  RefreshCw,
  Sparkles,
  Target,
  Terminal,
  Zap,
} from 'lucide-react'
import { Avatar, Badge, Button, Card, ProgressBar, StatCard } from '../components/ui'
import type { CampusJob } from '../data/campusJobs'
import { useAnalyticsDashboard } from '../hooks/useAnalyticsDashboard'
import { useAuth } from '../lib/auth'
import { loadResumeAnalysis, type StoredResume } from '../lib/resumeStore'
import RecommendedJobs from '../components/RecommendedJobs'
import type {
  AnalyticsActivityItem,
} from '../lib/analyticsDashboard'
import {
  formatCount,
  formatPercent,
  formatScore,
} from '../lib/analyticsFormat'

type Page =
  | 'resume'
  | 'interview-setup'
  | 'report'
  | 'roadmap'
  | 'analytics'
  | 'ai-interview'
  | 'job-portal'
  | 'profile-setup'
  | 'problem-solving'
  | 'practice'
  | 'coding-interview'
  | 'profile'
  | 'settings'

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

function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function readinessStatus(score: number | null, available: boolean) {
  if (!available || score === null) {
    return { label: 'Building Index', variant: 'warning' as const, color: '#f59e0b' }
  }
  if (score >= 80) {
    return { label: 'Placement Ready', variant: 'success' as const, color: '#10b981' }
  }
  if (score >= 60) {
    return { label: 'Good Progress', variant: 'info' as const, color: '#3b82f6' }
  }
  return { label: 'Needs Focus', variant: 'warning' as const, color: '#f59e0b' }
}

function resolveActivityDestination(item: AnalyticsActivityItem): { page: Page; param?: string } {
  switch (item.kind) {
    case 'interview':
      return { page: 'report', param: item.id }
    case 'practice':
      return { page: 'practice' }
    case 'dsa':
      return { page: 'coding-interview' }
    case 'coding':
      return { page: 'coding-interview' }
    case 'application':
      return { page: 'job-portal' }
    default:
      return { page: 'analytics' }
  }
}

function activityIcon(kind: AnalyticsActivityItem['kind']) {
  switch (kind) {
    case 'interview':
      return <Mic size={14} className="text-[#7c5cfc]" />
    case 'practice':
      return <BookOpenCheck size={14} className="text-[#6366f1]" />
    case 'dsa':
      return <Code2 size={14} className="text-[#10b981]" />
    case 'coding':
      return <Terminal size={14} className="text-[#06b6d4]" />
    case 'application':
      return <Building2 size={14} className="text-[#ec4899]" />
    default:
      return <Activity size={14} className="text-[var(--accent-from)]" />
  }
}

export default function Dashboard({
  onNavigate,
  profileIncomplete,
  userName,
  userCollege,
  upcomingJobs = [],
  collegeId = '',
  studentBranch = '',
  profileLoading = false,
  jobsLoading = false,
  jobsError = null,
  onReloadJobs = () => {},
}: DashboardProps) {
  const greetingName = userName?.trim()
  const heading = greetingName ? `Welcome back, ${greetingName}!` : 'Welcome back!'

  // Real, server-aggregated metrics across all modules.
  const {
    data: analytics,
    loading: analyticsLoading,
    refreshing: analyticsRefreshing,
    error: analyticsError,
    reload: reloadAnalytics,
  } = useAnalyticsDashboard('all')

  const { user } = useAuth()
  const storedResume: StoredResume | null = useMemo(
    () => (user?.id ? loadResumeAnalysis(user.id) : null),
    [user?.id],
  )

  const [activityFilter, setActivityFilter] = useState<'all' | 'interview' | 'practice' | 'dsa'>('all')

  // Top KPIs from verified unified analytics
  const overview = analytics?.overview
  const readiness = analytics?.readiness
  const readinessMeta = readinessStatus(readiness?.score ?? null, readiness?.available ?? false)

  // Interview scored domains with strict type guard
  const scoredDomains = useMemo(() => {
    return (analytics?.interviews.byDomain ?? []).filter(
      (group): group is typeof group & { averageScore: number } =>
        group.averageScore !== null && group.evaluatedAnswers > 0,
    )
  }, [analytics?.interviews.byDomain])

  // Strengths (>= 70) and Weak areas (< 60)
  const strengths = useMemo(() => {
    return [...scoredDomains]
      .filter((g) => g.averageScore >= 70)
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 3)
  }, [scoredDomains])

  const weakDomains = useMemo(() => {
    return [...scoredDomains]
      .filter((g) => g.averageScore < 60)
      .sort((a, b) => a.averageScore - b.averageScore)
      .slice(0, 3)
  }, [scoredDomains])

  // Filtered recent activities
  const recentActivities = useMemo(() => {
    const list = analytics?.recentActivity ?? []
    if (activityFilter === 'all') return list.slice(0, 6)
    return list.filter((item) => item.kind === activityFilter).slice(0, 6)
  }, [analytics?.recentActivity, activityFilter])

  // Pillar details for the readiness breakdown
  const interviewPillar = readiness?.components.find((c) => c.key === 'interviews')
  const practicePillar = readiness?.components.find((c) => c.key === 'practice')
  const dsaPillar = readiness?.components.find((c) => c.key === 'dsa')

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* ── Profile Incomplete Alert ───────────────────────────────── */}
      {profileIncomplete && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <Zap size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Complete your student profile</p>
              <p className="text-xs text-[var(--text-muted)]">
                Add your degree, branch, and graduation year so campus drives and AI recommendations match your background.
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onNavigate('profile-setup')}>
            Complete Profile
          </Button>
        </Card>
      )}

      {/* ── Hero Welcome & Preparation Launch Banner ──────────────── */}
      <div
        className="relative overflow-hidden rounded-[var(--radius-xl)] p-6 text-white sm:p-8"
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #2563eb 100%)',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        <div
          className="absolute -right-8 -top-8 h-72 w-72 rounded-full opacity-20 blur-2xl"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/20 bg-white/15 text-white backdrop-blur-sm">
                <Flame size={12} className="text-amber-300" /> Placement Season Ready
              </Badge>
              {studentBranch ? (
                <Badge className="border-white/20 bg-white/10 text-white/90">
                  <GraduationCap size={12} /> {studentBranch.toUpperCase()}
                </Badge>
              ) : null}
              {analyticsRefreshing ? (
                <span className="flex items-center gap-1 text-[11px] font-medium text-white/70">
                  <RefreshCw size={11} className="animate-spin" /> Syncing stats…
                </span>
              ) : null}
            </div>

            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{heading}</h1>
            <p className="text-sm leading-relaxed text-white/80">
              Your real-time placement readiness score is derived from your mock interviews, MCQ practice, and DSA coding accuracy. Everything updates live with every attempt.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-3">
              <Button
                onClick={() => onNavigate('interview-setup')}
                className="border border-white/25 bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
                size="sm"
                variant="ghost"
              >
                <Mic size={14} /> Start Mock Interview
              </Button>
              <Button
                onClick={() => onNavigate('problem-solving')}
                className="border border-white/25 bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
                size="sm"
                variant="ghost"
              >
                <BookOpenCheck size={14} /> Practice Hub
              </Button>
              <Button
                onClick={() => onNavigate('roadmap')}
                className="border border-white/25 bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
                size="sm"
                variant="ghost"
              >
                <Compass size={14} /> Study Roadmap
              </Button>
              <Button
                onClick={() => onNavigate('resume')}
                className="border border-white/25 bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
                size="sm"
                variant="ghost"
              >
                <FileText size={14} /> Analyse Resume
              </Button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3.5 rounded-[var(--radius-lg)] border border-white/20 bg-white/10 p-3.5 backdrop-blur-md">
            <Avatar name={greetingName || 'Student'} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{greetingName || 'Student'}</p>
              <p className="truncate text-xs text-white/70">{userCollege?.trim() || 'Institution not specified'}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-medium text-white/85">Verified Student</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error Banner (if analytics fails) ─────────────────────── */}
      {analyticsError && !analytics && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertCircle size={16} className="shrink-0" />
            <span>Could not load your placement metrics: {analyticsError}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={reloadAnalytics}>
            <RefreshCw size={12} /> Retry
          </Button>
        </Card>
      )}

      {/* ── Core KPI Statistics Grid ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* Metric 1: Readiness Score */}
        <StatCard
          label="Readiness Index"
          value={
            analyticsLoading && !analytics
              ? '…'
              : readiness?.score !== null && readiness?.score !== undefined
                ? `${formatScore(readiness.score)}%`
                : 'Building'
          }
          sub={
            readiness?.score !== null && readiness?.score !== undefined
              ? readinessMeta.label
              : 'Need 2+ modules'
          }
          icon={<Target size={17} />}
          color={readinessMeta.color}
        />

        {/* Metric 2: Interviews */}
        <StatCard
          label="Interviews Done"
          value={
            analyticsLoading && !analytics
              ? '…'
              : formatCount(overview?.interviewsCompleted ?? 0)
          }
          sub={
            overview?.averageInterviewScore !== null && overview?.averageInterviewScore !== undefined
              ? `Avg ${formatScore(overview.averageInterviewScore)}/100`
              : 'No scored sessions'
          }
          icon={<Mic size={17} />}
          color="#7c5cfc"
        />

        {/* Metric 3: MCQ Practice */}
        <StatCard
          label="MCQs Answered"
          value={
            analyticsLoading && !analytics
              ? '…'
              : formatCount(overview?.practiceQuestionsAnswered ?? 0)
          }
          sub={
            overview?.practiceAccuracy !== null && overview?.practiceAccuracy !== undefined
              ? `${formatPercent(overview.practiceAccuracy)} accuracy`
              : 'No answers yet'
          }
          icon={<BookOpenCheck size={17} />}
          color="#3b82f6"
        />

        {/* Metric 4: DSA Solved */}
        <StatCard
          label="DSA Problems"
          value={
            analyticsLoading && !analytics
              ? '…'
              : formatCount(overview?.dsaProblemsSolved ?? 0)
          }
          sub={
            overview?.dsaSuccessRate !== null && overview?.dsaSuccessRate !== undefined
              ? `${formatPercent(overview.dsaSuccessRate)} success`
              : 'No problems solved'
          }
          icon={<Code2 size={17} />}
          color="#10b981"
        />

        {/* Metric 5: Resume Score */}
        <StatCard
          label="Resume ATS"
          value={storedResume ? `${storedResume.analysis.overallScore}/100` : '—'}
          sub={
            storedResume
              ? storedResume.jobTitle || 'Latest analysis'
              : 'Not analyzed yet'
          }
          icon={<FileText size={17} />}
          color="#f59e0b"
        />

        {/* Metric 6: Campus Drives */}
        <StatCard
          label="Campus Drives"
          value={formatCount(upcomingJobs.length)}
          sub={
            overview?.applicationsTotal !== null && overview?.applicationsTotal !== undefined && overview.applicationsTotal > 0
              ? `${overview.applicationsTotal} applied`
              : 'Open for you'
          }
          icon={<Building2 size={17} />}
          color="#ec4899"
        />
      </div>

      {/* ── Main Dashboard Layout (3 Columns) ────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Column 1: Placement Readiness Breakdown ─────────────── */}
        <Card className="flex flex-col p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Readiness Evaluation
              </p>
              <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                Performance Architecture
              </h2>
            </div>
            <Badge variant={readinessMeta.variant}>{readinessMeta.label}</Badge>
          </div>

          <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Composite Index</span>
              <span className="text-lg font-black text-[var(--text-primary)]">
                {readiness?.score !== null && readiness?.score !== undefined
                  ? `${formatScore(readiness.score)} / 100`
                  : 'Pending'}
              </span>
            </div>
            <ProgressBar
              value={readiness?.score ?? 0}
              size="md"
              color={readinessMeta.color}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
              {readiness?.available
                ? readiness.formula
                : readiness?.reason ?? 'Need data from at least 2 modules to calculate a composite score.'}
            </p>
          </div>

          {/* 3 Component Pillars */}
          <div className="space-y-3.5 flex-1">
            {/* Pillar 1: Interviews */}
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 transition-all-smooth hover:border-[var(--accent-from)]/40">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-[var(--text-primary)]">
                  <Mic size={13} className="text-[#7c5cfc]" /> Technical Interviews
                </span>
                <span className="text-[11px] font-bold text-[var(--text-muted)]">40% Weight</span>
              </div>
              <div className="my-1.5 flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">
                  {interviewPillar?.included
                    ? `${formatScore(interviewPillar.value)}/100 avg`
                    : 'No evaluated answers'}
                </span>
                <button
                  onClick={() => onNavigate('interview-setup')}
                  className="text-[11px] font-bold text-[var(--accent-from)] hover:underline"
                >
                  Start →
                </button>
              </div>
              <ProgressBar value={interviewPillar?.value ?? 0} size="sm" color="#7c5cfc" />
            </div>

            {/* Pillar 2: Practice MCQs */}
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 transition-all-smooth hover:border-[var(--accent-from)]/40">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-[var(--text-primary)]">
                  <BookOpenCheck size={13} className="text-[#3b82f6]" /> MCQ Practice Hub
                </span>
                <span className="text-[11px] font-bold text-[var(--text-muted)]">30% Weight</span>
              </div>
              <div className="my-1.5 flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">
                  {practicePillar?.included
                    ? `${formatPercent(practicePillar.value)} accuracy`
                    : 'No questions answered'}
                </span>
                <button
                  onClick={() => onNavigate('problem-solving')}
                  className="text-[11px] font-bold text-[var(--accent-from)] hover:underline"
                >
                  Practise →
                </button>
              </div>
              <ProgressBar value={practicePillar?.value ?? 0} size="sm" color="#3b82f6" />
            </div>

            {/* Pillar 3: DSA Coding */}
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 transition-all-smooth hover:border-[var(--accent-from)]/40">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-[var(--text-primary)]">
                  <Code2 size={13} className="text-[#10b981]" /> DSA & Algorithms
                </span>
                <span className="text-[11px] font-bold text-[var(--text-muted)]">30% Weight</span>
              </div>
              <div className="my-1.5 flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">
                  {dsaPillar?.included
                    ? `${formatPercent(dsaPillar.value)} solve rate`
                    : 'No submissions yet'}
                </span>
                <button
                  onClick={() => onNavigate('coding-interview')}
                  className="text-[11px] font-bold text-[var(--accent-from)] hover:underline"
                >
                  Solve →
                </button>
              </div>
              <ProgressBar value={dsaPillar?.value ?? 0} size="sm" color="#10b981" />
            </div>
          </div>

          <button
            onClick={() => onNavigate('analytics')}
            className="mt-4 flex w-full items-center justify-center gap-1 text-xs font-semibold text-[var(--accent-from)] hover:underline"
          >
            View Detailed Readiness Analytics <ChevronRight size={13} />
          </button>
        </Card>

        {/* ── Column 2: Competency Map & Skills ───────────────────── */}
        <Card className="flex flex-col p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Skill Mastery
              </p>
              <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                Domain Competency
              </h2>
            </div>
            {scoredDomains.length > 0 && <Badge variant="info">{scoredDomains.length} Evaluated</Badge>}
          </div>

          {scoredDomains.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-from)]">
                <Brain size={20} />
              </div>
              <p className="text-sm font-bold text-[var(--text-primary)]">No skills evaluated yet</p>
              <p className="mt-1 max-w-xs text-xs text-[var(--text-muted)]">
                Complete a mock interview session or practice questions to start building your domain competency map.
              </p>
              <Button size="sm" variant="secondary" className="mt-4" onClick={() => onNavigate('interview-setup')}>
                Take Diagnostic Interview
              </Button>
            </div>
          ) : (
            <div className="flex-1 space-y-4">
              <div className="space-y-2.5">
                {scoredDomains.slice(0, 4).map((group) => (
                  <div key={group.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--text-primary)] truncate">{group.label}</span>
                      <span className="font-bold text-[var(--text-secondary)]">
                        {group.averageScore.toFixed(1)}/100
                      </span>
                    </div>
                    <ProgressBar
                      value={group.averageScore}
                      size="sm"
                      color={group.averageScore >= 70 ? '#10b981' : group.averageScore >= 50 ? '#3b82f6' : '#f59e0b'}
                    />
                  </div>
                ))}
              </div>

              {/* Strengths & Growth Areas */}
              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-3">
                {strengths.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={12} /> Key Strengths
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {strengths.map((s) => (
                        <span
                          key={s.key}
                          className="rounded-[var(--radius-sm)] border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                        >
                          {s.label} ({s.averageScore.toFixed(0)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {weakDomains.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      <Lightbulb size={12} /> Priority Focus Areas
                    </p>
                    <div className="space-y-1.5">
                      {weakDomains.map((w) => (
                        <div
                          key={w.key}
                          className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-xs"
                        >
                          <span className="font-medium text-[var(--text-primary)]">{w.label}</span>
                          <button
                            onClick={() => onNavigate('interview-setup')}
                            className="font-bold text-[var(--accent-from)] hover:underline"
                          >
                            Practise →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => onNavigate('roadmap')}
            className="mt-4 flex w-full items-center justify-center gap-1 text-xs font-semibold text-[var(--accent-from)] hover:underline"
          >
            Review Full Learning Roadmap <ChevronRight size={13} />
          </button>
        </Card>

        {/* ── Column 3: Recommended Jobs & Campus Drives ──────────── */}
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

      {/* ── Lower Section: Unified Recent Activity & Quick Launch ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left (2 Columns): Unified Activity Timeline */}
        <div className="lg:col-span-2">
          <Card className="flex h-full flex-col p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Audit & History
                </p>
                <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                  Recent Activity Stream
                </h2>
              </div>
              <div className="flex items-center gap-1">
                {(['all', 'interview', 'practice', 'dsa'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActivityFilter(filter)}
                    className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-semibold transition-all-smooth ${
                      activityFilter === filter
                        ? 'bg-[var(--accent-from)] text-white'
                        : 'text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {filter === 'all'
                      ? 'All'
                      : filter === 'interview'
                        ? 'Interviews'
                        : filter === 'practice'
                          ? 'MCQs'
                          : 'DSA'}
                  </button>
                ))}
              </div>
            </div>

            {recentActivities.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                <Calendar size={24} className="mb-2 text-[var(--text-muted)]" />
                <p className="text-sm font-bold text-[var(--text-primary)]">No activity recorded yet</p>
                <p className="mt-1 max-w-xs text-xs text-[var(--text-muted)]">
                  Your interview sessions, MCQ quizzes, DSA code submissions, and campus drive applications will appear here chronologically.
                </p>
                <Button size="sm" variant="secondary" className="mt-4" onClick={() => onNavigate('interview-setup')}>
                  Start Your First Session
                </Button>
              </div>
            ) : (
              <div className="flex-1 space-y-2.5">
                {recentActivities.map((item) => {
                  const target = resolveActivityDestination(item)
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(target.page, target.param)}
                      className="group flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition-all-smooth hover:border-[var(--accent-from)] hover:shadow-[var(--shadow-sm)]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border)] group-hover:border-[var(--accent-from)]/40">
                          {activityIcon(item.kind)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-from)]">
                            {item.title}
                          </p>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">{item.detail}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                          {formatRelativeTime(item.at)}
                        </span>
                        <ChevronRight size={13} className="text-[var(--text-muted)] group-hover:text-[var(--accent-from)]" />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
              <span className="text-[11px] text-[var(--text-muted)]">
                Synchronized with verified Supabase storage
              </span>
              <button
                onClick={() => onNavigate('analytics')}
                className="font-bold text-[var(--accent-from)] hover:underline flex items-center gap-1"
              >
                Full Analytics Dashboard <ArrowRight size={12} />
              </button>
            </div>
          </Card>
        </div>

        {/* Right (1 Column): Rapid Preparation Launchpad */}
        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--accent-from)]" />
              <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
                Preparation Tracks
              </h2>
            </div>
            <p className="mb-4 text-xs text-[var(--text-muted)]">
              Quick access to your core interview preparation workspaces.
            </p>

            <div className="space-y-2.5">
              {/* Track 1: Branch MCQs */}
              <button
                onClick={() => onNavigate('practice')}
                className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-left transition-all-smooth hover:border-[#6366f1] hover:bg-[#6366f1]/5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[#6366f1]/10 text-[#6366f1]">
                    <GraduationCap size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">Branch MCQ Practice</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Core engineering subjects</p>
                  </div>
                </div>
                <ArrowUpRight size={13} className="text-[var(--text-muted)]" />
              </button>

              {/* Track 2: Aptitude */}
              <button
                onClick={() => onNavigate('practice', 'aptitude')}
                className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-left transition-all-smooth hover:border-[#f59e0b] hover:bg-[#f59e0b]/5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[#f59e0b]/10 text-[#f59e0b]">
                    <Target size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">Aptitude & Reasoning</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Campus test question sets</p>
                  </div>
                </div>
                <ArrowUpRight size={13} className="text-[var(--text-muted)]" />
              </button>

              {/* Track 3: DSA Coding */}
              <button
                onClick={() => onNavigate('coding-interview')}
                className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-left transition-all-smooth hover:border-[#10b981] hover:bg-[#10b981]/5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[#10b981]/10 text-[#10b981]">
                    <Code2 size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">DSA Coding Arena</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Live sandbox execution</p>
                  </div>
                </div>
                <ArrowUpRight size={13} className="text-[var(--text-muted)]" />
              </button>

              {/* Track 4: Mock Interview */}
              <button
                onClick={() => onNavigate('interview-setup')}
                className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-left transition-all-smooth hover:border-[#7c5cfc] hover:bg-[#7c5cfc]/5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[#7c5cfc]/10 text-[#7c5cfc]">
                    <Mic size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">AI Mock Interview</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Role-specific evaluation</p>
                  </div>
                </div>
                <ArrowUpRight size={13} className="text-[var(--text-muted)]" />
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

