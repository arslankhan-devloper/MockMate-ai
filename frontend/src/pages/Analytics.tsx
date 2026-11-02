import { useState } from 'react'
import {
  AlertCircle, Activity, BarChart3, Brain, Briefcase, CheckCircle2, ChevronRight,
  Code2, FileText, GraduationCap, Loader2, Map, Mic, RefreshCw, Target,
  MessageSquare, ClipboardList, Timer,
} from 'lucide-react'
import { Card, Badge, TabBar, Button, ProgressBar } from '../components/ui'
import {
  BarBreakdown,
  DashboardSkeleton,
  InfoTip,
  InlineEmpty,
  KpiCard,
  ModuleEmpty,
  SectionCard,
  StatusPill,
  TrendChart,
  tokenTone,
} from '../components/analytics/widgets'
import { useAnalyticsDashboard } from '../hooks/useAnalyticsDashboard'
import type {
  AnalyticsDashboard,
  DsaAnalytics,
  PlacementAnalytics,
  PracticeAnalytics,
  ReadinessScore,
  RoadmapAnalytics,
} from '../lib/analyticsDashboard'
import {
  dashboardIsEmpty,
  emptyModules,
  formatCount,
  formatDuration,
  formatPercent,
  formatScore,
  humanizeToken,
  rangeLabel,
  scopeLabel,
} from '../lib/analyticsFormat'
import type {
  InterviewAnalytics,
  InterviewAnalyticsGroup,
  InterviewAnalyticsRange,
  InterviewAnalyticsTrendBucket,
} from '../lib/interviews'
import { completionRate, pickScoreHighlights } from '../lib/analytics'

type Page = 'roadmap' | 'interview-setup' | 'report'

interface AnalyticsProps {
  onNavigate: (p: Page, param?: string) => void
}

const RANGE_TABS: { tab: string; range: InterviewAnalyticsRange }[] = [
  { tab: '1W', range: '1w' },
  { tab: '1M', range: '1m' },
  { tab: '3M', range: '3m' },
  { tab: 'All', range: 'all' },
]

const MODULE_TABS = [
  'Overview',
  'Interviews',
  'DSA & Coding',
  'Practice Hub',
  'Resume',
  'Roadmap',
  'Placement',
] as const

type ModuleTab = (typeof MODULE_TABS)[number]

function formatSessionDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function humanizeType(value: string | null): string {
  if (!value) return 'Interview'
  return humanizeToken(value)
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Completed'
  if (status === 'abandoned') return 'Abandoned'
  if (status === 'in_progress') return 'In progress'
  return humanizeToken(status)
}

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'completed') return 'success'
  if (status === 'abandoned') return 'error'
  return 'warning'
}

/** Scale a count series to 0–100 bars, largest first. */
function toBars<T extends { key: string; label: string }>(
  items: readonly T[],
  value: (item: T) => number,
  caption: (item: T) => string,
): { key: string; label: string; value: number; caption: string; share: number }[] {
  const peak = Math.max(1, ...items.map(value))
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    value: value(item),
    caption: caption(item),
    share: (value(item) / peak) * 100,
  }))
}

// ── Readiness ───────────────────────────────────────────────────

function ReadinessCard({ readiness }: { readiness: ReadinessScore }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            Placement readiness
            <InfoTip text="A transparent weighted mean of the modules that have real recorded results. It is not an AI prediction." />
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Weighted mean of the modules with recorded results
          </p>
        </div>
        {readiness.available ? (
          <Badge variant={readiness.coverage === 100 ? 'success' : 'info'}>
            {readiness.coverage}% coverage
          </Badge>
        ) : (
          <Badge variant="warning">Not enough data</Badge>
        )}
      </div>

      {readiness.available && readiness.score !== null ? (
        <>
          <div className="flex items-end gap-2 mb-3">
            <p className="text-4xl font-extrabold text-[var(--text-primary)] leading-none tabular-nums">
              {formatScore(readiness.score)}
            </p>
            <span className="text-xs font-semibold text-[var(--text-muted)] mb-1">/ 100</span>
          </div>
          <ProgressBar value={readiness.score} size="md" />
        </>
      ) : (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">{readiness.reason}</p>
      )}

      <ul className="mt-4 space-y-2">
        {readiness.components.map((component) => (
          <li key={component.key} className="flex items-center gap-2 text-xs">
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                component.included ? 'bg-emerald-500' : 'bg-[var(--border)]'
              }`}
            />
            <span className="flex-1 min-w-0 truncate text-[var(--text-secondary)]">
              {component.label}
              <span className="text-[var(--text-muted)]"> · weight {component.weight}</span>
            </span>
            <span
              className={`font-bold tabular-nums shrink-0 ${
                component.included ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
              }`}
            >
              {component.included ? formatScore(component.value) : 'no data'}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 pt-3 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] leading-relaxed">
        {readiness.formula}
      </p>
      {readiness.reason && readiness.available && (
        <p className="mt-1.5 text-[10px] text-[var(--text-muted)] italic">{readiness.reason}</p>
      )}
    </Card>
  )
}

// ── Overview ────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, typeof Mic> = {
  interview: Mic,
  practice: ClipboardList,
  dsa: Code2,
  coding: Code2,
  application: Briefcase,
}

function OverviewTab({
  data,
  onNavigate,
  onSelectModule,
}: {
  data: AnalyticsDashboard
  onNavigate: AnalyticsProps['onNavigate']
  onSelectModule: (tab: ModuleTab) => void
}) {
  const { overview } = data
  const gaps = emptyModules(data)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            label="Interviews completed"
            value={formatCount(overview.interviewsCompleted)}
            sub={`${data.interviews.totals.sessions} session${data.interviews.totals.sessions === 1 ? '' : 's'} in range`}
            hint="Mock interview sessions with status completed, recorded in the selected range."
            icon={<Mic size={14} />}
          />
          <KpiCard
            label="Avg interview score"
            value={formatScore(overview.averageInterviewScore)}
            sub={
              overview.averageInterviewScore !== null
                ? `${data.interviews.totals.evaluatedAnswers} scored answers`
                : 'No scored answers yet'
            }
            hint="Mean of per-answer scores from persisted evaluations. Unscored answers are excluded, never counted as zero."
            icon={<Brain size={14} />}
            accent="#3b82f6"
            muted={overview.averageInterviewScore === null}
          />
          <KpiCard
            label="DSA solved"
            value={formatCount(overview.dsaProblemsSolved)}
            sub={
              overview.dsaProblemsAttempted !== null
                ? `of ${overview.dsaProblemsAttempted} attempted`
                : 'Module unavailable'
            }
            hint="Unique problems with at least one accepted submission. Repeat submissions of a solved problem are not counted twice."
            icon={<Code2 size={14} />}
            accent="#10b981"
            muted={overview.dsaProblemsSolved === null}
          />
          <KpiCard
            label="Coding runs"
            value={formatCount(overview.codingAttempts)}
            sub={
              overview.codingSuccessRate !== null
                ? `${formatPercent(overview.codingSuccessRate)} compiled and ran`
                : 'Module unavailable'
            }
            hint="Code execution attempts recorded during interviews. This measures whether the code compiled and ran, not whether it was correct."
            icon={<Timer size={14} />}
            accent="#8b5cf6"
            muted={overview.codingAttempts === null}
          />
          <KpiCard
            label="Practice tests"
            value={formatCount(overview.practiceTestsAttempted)}
            sub={
              overview.practiceTestsCompleted !== null
                ? `${overview.practiceTestsCompleted} completed`
                : 'Module unavailable'
            }
            hint="Practice Hub sessions started in range. Unfinished sessions are counted separately and never as completed tests."
            icon={<ClipboardList size={14} />}
            accent="#f59e0b"
            muted={overview.practiceTestsAttempted === null}
          />
          <KpiCard
            label="Practice accuracy"
            value={formatPercent(overview.practiceAccuracy)}
            sub={
              overview.practiceQuestionsAnswered !== null
                ? `${overview.practiceQuestionsAnswered} answers recorded`
                : 'Module unavailable'
            }
            hint="Correct share of recorded practice answers. Computed from stored answer rows, not from session counters."
            icon={<Target size={14} />}
            accent="#10b981"
            muted={overview.practiceAccuracy === null}
          />
          <KpiCard
            label="Roadmap topics"
            value={formatCount(overview.roadmapTopicsCompleted)}
            sub="Completed topics recorded"
            hint="Topics marked complete on your learning roadmap. In-progress and pending counts are not stored, so they are not shown."
            icon={<Map size={14} />}
            accent="#0ea5e9"
            muted={overview.roadmapTopicsCompleted === null}
          />
          <KpiCard
            label="Applications"
            value={formatCount(overview.applicationsTotal)}
            sub={
              overview.applicationsByStatus
                ?.filter((entry) => entry.count > 0)
                .map((entry) => `${entry.status} ${entry.count}`)
                .join(' · ') || 'No applications yet'
            }
            hint="Job applications recorded in the selected range."
            icon={<Briefcase size={14} />}
            accent="#ef4444"
            muted={overview.applicationsTotal === null}
          />
        </div>

        <ReadinessCard readiness={data.readiness} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Recent activity"
          description={
            data.scope === 'college'
              ? 'College scope shows aggregates only; individual student activity is never listed.'
              : 'Newest first, across every module you have data for.'
          }
        >
          {data.recentActivity.length === 0 ? (
            <InlineEmpty
              text={
                data.scope === 'college'
                  ? 'Individual activity is not shown for a college-scoped dashboard.'
                  : 'No recorded activity in this period yet.'
              }
            />
          ) : (
            <ul className="space-y-2">
              {data.recentActivity.map((item) => {
                const Icon = ACTIVITY_ICONS[item.kind] ?? Activity
                return (
                  <li key={item.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-[var(--accent-from)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] truncate">{item.detail}</p>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
                      {formatSessionDate(item.at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Modules" description="Jump to a module, or see what is still empty.">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['Interviews', 'Interviews'],
                ['DSA & Coding', 'DSA & Coding'],
                ['Practice Hub', 'Practice Hub'],
                ['Resume', 'Resume'],
                ['Roadmap', 'Roadmap'],
                ['Placement', 'Placement'],
              ] as [ModuleTab, string][]
            ).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => onSelectModule(tab)}
                className="text-left px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent-from)] transition-all-smooth cursor-pointer"
              >
                <p className="text-xs font-semibold text-[var(--text-primary)]">{label}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {gaps.includes(label) ? 'No data yet' : 'Ready'}
                </p>
              </button>
            ))}
          </div>
          {data.scope === 'student' && (
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" onClick={() => onNavigate('interview-setup')}>
                <Mic size={13} /> Start interview
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('roadmap')}>
                <Map size={13} /> Roadmap
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onNavigate('report')}>
                <FileText size={13} /> All reports
              </Button>
            </div>
          )}
        </SectionCard>
      </div>

      {data.notes.length > 0 && (
        <div className="space-y-1">
          {data.notes.map((note) => (
            <p key={note} className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Interviews ──────────────────────────────────────────────────

function Breakdown({ title, groups, emptyHint }: {
  title: string
  groups: InterviewAnalyticsGroup[]
  emptyHint: string
}) {
  return (
    <SectionCard title={title}>
      {groups.length === 0 ? (
        <InlineEmpty text={emptyHint} />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{group.label}</p>
                <span className="text-xs font-bold text-[var(--text-secondary)] flex-shrink-0 tabular-nums">
                  {group.averageScore !== null ? `${group.averageScore.toFixed(1)}/100` : 'Not scored'}
                </span>
              </div>
              <ProgressBar value={group.averageScore ?? 0} size="sm" />
              <p className="text-[10px] text-[var(--text-muted)]">
                {group.sessions} session{group.sessions === 1 ? '' : 's'} · {group.evaluatedAnswers} evaluated
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function ScoreTrendChart({ buckets }: { buckets: InterviewAnalyticsTrendBucket[] }) {
  const width = 640
  const height = 180
  const padX = 34
  const padY = 22
  const innerWidth = width - padX * 2
  const innerHeight = height - padY * 2
  const x = (index: number) =>
    padX + (buckets.length <= 1 ? innerWidth / 2 : (index * innerWidth) / (buckets.length - 1))
  const y = (score: number) =>
    padY + innerHeight - (Math.min(100, Math.max(0, score)) / 100) * innerHeight
  const points = buckets.map((bucket, index) => `${x(index)},${y(bucket.averageScore)}`)
  const area = `${padX},${padY + innerHeight} ${points.join(' ')} ${padX + innerWidth},${padY + innerHeight}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Average interview score trend across ${buckets.length} periods`}
      className="w-full h-auto"
    >
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line
            x1={padX}
            x2={width - padX}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text x={4} y={y(tick) + 4} fontSize="9" fill="var(--text-muted)">
            {tick}
          </text>
        </g>
      ))}
      <polygon points={area} fill="var(--accent-soft)" opacity="0.7" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--accent-from)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {buckets.map((bucket, index) => (
        <g key={bucket.periodStart}>
          <circle
            cx={x(index)}
            cy={y(bucket.averageScore)}
            r="3.5"
            fill="var(--surface-raised)"
            stroke="var(--accent-from)"
            strokeWidth="2"
          >
            <title>
              {bucket.label}: {bucket.averageScore.toFixed(1)}/100 from{' '}
              {bucket.evaluatedAnswers} evaluated answer{bucket.evaluatedAnswers === 1 ? '' : 's'}
            </title>
          </circle>
          <text
            x={x(index)}
            y={height - 4}
            fontSize="9"
            textAnchor="middle"
            fill="var(--text-muted)"
          >
            {bucket.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function InterviewsTab({
  interviews,
  scope,
  onNavigate,
}: {
  interviews: InterviewAnalytics
  scope: 'student' | 'college'
  onNavigate: AnalyticsProps['onNavigate']
}) {
  const totals = interviews.totals
  const completion = completionRate(totals)
  const topicHighlights = pickScoreHighlights(interviews.byTopic)
  const domainHighlights = pickScoreHighlights(interviews.byDomain)
  const highlights = topicHighlights ?? domainHighlights
  const performanceLabel = topicHighlights ? 'topic' : 'domain'
  const trend = interviews.trend
  const isCollegeScope = scope === 'college'

  if (!interviews.availability.sessions) {
    return (
      <ModuleEmpty
        title="Interview analytics unavailable"
        reason="Interview sessions are not readable in this environment yet. Metrics appear automatically once the session tables are present."
      />
    )
  }

  if (totals.sessions === 0) {
    return (
      <ModuleEmpty
        title={isCollegeScope ? 'No college sessions in this range' : 'No interviews in this range'}
        reason={
          isCollegeScope
            ? 'Performance metrics come from persisted sessions. No sessions were recorded for your college in the selected range.'
            : 'Performance metrics come from your persisted sessions. Complete a mock interview to populate this module.'
        }
        hint={isCollegeScope ? undefined : 'Try a wider date range, or start a new session.'}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Sessions"
          value={formatCount(totals.sessions)}
          sub={`${totals.completed} completed · ${totals.inProgress} in progress`}
          icon={<Mic size={14} />}
        />
        <KpiCard
          label="Completion rate"
          value={completion !== null ? `${completion}%` : '—'}
          sub={`${totals.abandoned} abandoned`}
          hint="Completed sessions as a share of all sessions in the selected range."
          icon={<CheckCircle2 size={14} />}
          accent="#10b981"
          muted={completion === null}
        />
        <KpiCard
          label="Average score"
          value={formatScore(totals.averageScore)}
          sub={
            totals.averageScore !== null
              ? `From ${totals.evaluatedAnswers} evaluated answers`
              : 'No scored answers yet'
          }
          hint="Only answers with a real persisted evaluation are averaged. Unanswered or unevaluated answers are excluded."
          icon={<Brain size={14} />}
          accent="#3b82f6"
          muted={totals.averageScore === null}
        />
        <KpiCard
          label="Questions answered"
          value={totals.answeredQuestions != null ? formatCount(totals.answeredQuestions) : '—'}
          sub={
            totals.answeredQuestions != null
              ? `${totals.unansweredQuestions ?? 0} skipped`
              : 'Not tracked in this environment'
          }
          icon={<MessageSquare size={14} />}
          accent="#f59e0b"
          muted={totals.answeredQuestions == null}
        />
      </div>

      {!interviews.availability.topics && highlights && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <Target size={15} className="text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Strongest {performanceLabel}
              </p>
              <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                {highlights.strongest.label}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {highlights.strongest.averageScore?.toFixed(1)}/100 across{' '}
                {highlights.strongest.evaluatedAnswers} evaluated answer
                {highlights.strongest.evaluatedAnswers === 1 ? '' : 's'}
              </p>
            </div>
          </Card>
          <Card className="p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={15} className="text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Focus next: weakest {performanceLabel}
              </p>
              <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                {highlights.weakest.label}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {highlights.weakest.averageScore?.toFixed(1)}/100 across{' '}
                {highlights.weakest.evaluatedAnswers} evaluated answer
                {highlights.weakest.evaluatedAnswers === 1 ? '' : 's'}
              </p>
            </div>
          </Card>
        </div>
      )}

      {interviews.availability.topics && (
        <SectionCard
          title="Topic strengths and weaknesses"
          description="Derived only from topics that carry at least one scored answer."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(
              [
                ['Strengths', 'strength', interviews.strengths],
                ['Weaknesses', 'weakness', interviews.weaknesses],
              ] as ['Strengths' | 'Weaknesses', 'strength' | 'weakness', InterviewAnalyticsGroup[]][]
            ).map(([title, icon, groups]) => (
              <div key={title}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  {title}
                </p>
                {groups.length === 0 ? (
                  <InlineEmpty text="Not enough evaluated answers per topic yet." />
                ) : (
                  <div className="space-y-2">
                    {groups.map((group) => (
                      <div key={group.key} className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                            icon === 'strength' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate flex-1">
                          {group.label}
                        </p>
                        <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                          {group.averageScore?.toFixed(1)}/100
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {group.evaluatedAnswers} answers
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {interviews.availability.topics && (
          <Breakdown
            title="Performance by topic"
            groups={interviews.byTopic}
            emptyHint="Topic performance appears once evaluated questions include a topic."
          />
        )}
        <Breakdown
          title="Performance by domain"
          groups={interviews.byDomain}
          emptyHint="Domain breakdown appears once sessions are recorded."
        />
        <Breakdown
          title="Performance by difficulty"
          groups={interviews.byDifficulty}
          emptyHint="Difficulty breakdown appears once sessions are recorded."
        />
      </div>

      {trend && trend.buckets.length >= 2 && (
        <SectionCard
          title="Score trend"
          description="Monthly average of scored answers"
          action={<Badge variant="info">Monthly</Badge>}
        >
          <ScoreTrendChart buckets={trend.buckets} />
          <div className="mt-4 space-y-3">
            {trend.buckets.map((bucket) => (
              <div key={bucket.periodStart} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{bucket.label}</p>
                  <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                    {bucket.averageScore.toFixed(1)}/100
                  </span>
                </div>
                <ProgressBar value={bucket.averageScore} size="sm" />
                <p className="text-[10px] text-[var(--text-muted)]">
                  {bucket.evaluatedAnswers} evaluated answer
                  {bucket.evaluatedAnswers === 1 ? '' : 's'}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {!isCollegeScope && (
        <SectionCard
          title="Recent interviews"
          description="Open any session to read its full report."
          action={
            <button
              onClick={() => onNavigate('report')}
              className="text-xs text-[var(--accent-from)] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            >
              All reports <ChevronRight size={13} />
            </button>
          }
        >
          {interviews.recentSessions.length === 0 ? (
            <InlineEmpty text="No sessions in this period." />
          ) : (
            <div className="space-y-2.5">
              {interviews.recentSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => onNavigate('report', session.id)}
                  className="w-full text-left p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-from)] transition-all-smooth cursor-pointer flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                    {session.status === 'completed' ? (
                      <CheckCircle2 size={14} className="text-[var(--accent-from)]" />
                    ) : (
                      <Activity size={14} className="text-[var(--accent-from)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {humanizeType(session.interviewType)}
                      {session.difficulty ? ` · ${session.difficulty}` : ''}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-2">
                      {formatSessionDate(session.startedAt)}
                      <Badge variant={statusVariant(session.status)}>
                        {statusLabel(session.status)}
                      </Badge>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className={`text-sm font-extrabold tabular-nums ${
                        session.averageScore !== null
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {session.averageScore !== null ? session.averageScore.toFixed(1) : '—'}
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
        </SectionCard>
      )}
    </div>
  )
}

// ── DSA & Coding ────────────────────────────────────────────────

function DsaSection({ dsa }: { dsa: DsaAnalytics | null }) {
  if (!dsa) {
    return (
      <ModuleEmpty
        title="DSA analytics unavailable"
        reason="The problem-solving tables are not readable in this environment. DSA metrics appear once those tables exist."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Problems attempted"
          value={formatCount(dsa.problemsAttempted)}
          sub="Unique problems"
          hint="Distinct problems with at least one submission, however many times each was tried."
          icon={<Code2 size={14} />}
        />
        <KpiCard
          label="Problems solved"
          value={formatCount(dsa.problemsSolved)}
          sub={dsa.solveRate !== null ? `${formatPercent(dsa.solveRate)} solve rate` : 'No attempts yet'}
          hint="Unique problems with at least one accepted submission. Duplicate accepted submissions of the same problem count once."
          icon={<CheckCircle2 size={14} />}
          accent="#10b981"
          muted={dsa.problemsAttempted === 0}
        />
        <KpiCard
          label="Submissions"
          value={formatCount(dsa.submissions)}
          sub={`${dsa.acceptedSubmissions} accepted · ${dsa.failedSubmissions} failed`}
          icon={<Activity size={14} />}
          accent="#f59e0b"
        />
        <KpiCard
          label="Submission success"
          value={formatPercent(dsa.successRate)}
          sub="Accepted share of all submissions"
          hint="Accepted submissions divided by all submissions. This is different from the unique solve rate."
          icon={<Target size={14} />}
          accent="#3b82f6"
          muted={dsa.successRate === null}
        />
      </div>

      {dsa.byLanguage.length > 0 && (
        <SectionCard title="Language activity" description="Submissions per language you have used.">
          <BarBreakdown
            data={toBars(dsa.byLanguage, (item) => item.count, (item) => String(item.count))}
            empty="No submissions recorded yet."
          />
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="By topic"
          description="Solved counts are unique problems, not submissions."
        >
          {dsa.byTopic.length === 0 ? (
            <InlineEmpty text="Topic breakdown appears once submissions exist." />
          ) : (
            <div className="space-y-3">
              {dsa.byTopic.map((row) => (
                <div key={row.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {row.label}
                    </p>
                    <span className="text-[11px] text-[var(--text-secondary)] tabular-nums shrink-0">
                      {row.solved}/{row.attempts} solved
                    </span>
                  </div>
                  <ProgressBar value={row.accuracy ?? 0} size="sm" />
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {row.accepted} accepted of {row.attempts} submissions
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="By difficulty">
          {dsa.byDifficulty.length === 0 ? (
            <InlineEmpty text="Difficulty breakdown appears once submissions exist." />
          ) : (
            <div className="space-y-3">
              {dsa.byDifficulty.map((row) => (
                <div key={row.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {row.label}
                    </p>
                    <span className="text-[11px] text-[var(--text-secondary)] tabular-nums shrink-0">
                      {row.solved}/{row.attempts} solved
                    </span>
                  </div>
                  <ProgressBar value={row.accuracy ?? 0} size="sm" />
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {row.accepted} accepted of {row.attempts} submissions
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Submission trend"
        description={dsa.trendGranularity === 'day' ? 'Daily' : 'Monthly'}
      >
        <TrendChart
          points={dsa.trend.map((bucket) => ({
            label: bucket.label,
            primary: bucket.submissions,
            secondary: bucket.accepted,
          }))}
          primaryLabel="Submissions"
          secondaryLabel="Accepted"
          empty="No submissions in this period."
        />
      </SectionCard>

      <SectionCard title="Recent submissions">
        {dsa.recentSubmissions.length === 0 ? (
          <InlineEmpty text="No submissions recorded yet." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {dsa.recentSubmissions.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {row.title}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {humanizeToken(row.topic)} · {humanizeToken(row.difficulty)} ·{' '}
                    {humanizeToken(row.language)}
                  </p>
                </div>
                <StatusPill tone={tokenTone(row.verdict)}>{humanizeToken(row.verdict)}</StatusPill>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
                  {formatSessionDate(row.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

function CodingSection({ dash }: { dash: AnalyticsDashboard }) {
  const coding = dash.coding
  if (!coding) {
    return (
      <ModuleEmpty
        title="Interview coding analytics unavailable"
        reason="Code execution attempts are not readable in this environment. Statistics appear once the coding attempt table exists."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Coding runs"
          value={formatCount(coding.attempts)}
          sub="Recorded execution attempts"
          icon={<Code2 size={14} />}
        />
        <KpiCard
          label="Compiled and ran"
          value={formatCount(coding.successes)}
          sub={`${coding.failures} failed to run`}
          icon={<CheckCircle2 size={14} />}
          accent="#10b981"
        />
        <KpiCard
          label="Success rate"
          value={formatPercent(coding.successRate)}
          sub="Share of runs that executed"
          hint="Whether the code compiled and ran. This is an execution statistic, not a correctness score."
          icon={<Target size={14} />}
          accent="#3b82f6"
          muted={coding.successRate === null}
        />
        <KpiCard
          label="Average runtime"
          value={formatDuration(coding.averageSeconds)}
          sub="Across runs with a recorded duration"
          icon={<Timer size={14} />}
          accent="#8b5cf6"
          muted={coding.averageSeconds === null}
        />
      </div>

      {coding.byLanguage.length > 0 && (
        <SectionCard title="Language activity">
          <BarBreakdown
            data={toBars(coding.byLanguage, (item) => item.count, (item) => String(item.count))}
            empty="No runs recorded yet."
          />
        </SectionCard>
      )}

      <SectionCard
        title="Execution trend"
        description={coding.trendGranularity === 'day' ? 'Daily' : 'Monthly'}
      >
        <TrendChart
          points={coding.trend.map((bucket) => ({
            label: bucket.label,
            primary: bucket.attempts,
            secondary: bucket.successes,
          }))}
          primaryLabel="Attempts"
          secondaryLabel="Ran"
          empty="No runs in this period."
        />
      </SectionCard>

      <SectionCard title="Recent runs">
        {coding.recentAttempts.length === 0 ? (
          <InlineEmpty text="No runs recorded yet." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {coding.recentAttempts.map((attempt) => (
              <li key={attempt.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    Question {attempt.questionIndex + 1}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {humanizeToken(attempt.language)}
                  </p>
                </div>
                <StatusPill tone={tokenTone(attempt.status)}>
                  {attempt.status === 'success' ? 'Ran' : 'Failed'}
                </StatusPill>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
                  {formatSessionDate(attempt.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

// ── Practice Hub ────────────────────────────────────────────────

function PracticeTab({ practice }: { practice: PracticeAnalytics | null }) {
  if (!practice) {
    return (
      <ModuleEmpty
        title="Practice Hub analytics unavailable"
        reason="Practice sessions are not readable in this environment. Metrics appear once the practice tables exist."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Sessions"
          value={formatCount(practice.sessionsAttempted)}
          sub={`${practice.sessionsCompleted} completed · ${practice.sessionsInProgress} in progress`}
          hint="Sessions started in range. Unfinished sessions are counted separately and never as completed tests."
          icon={<ClipboardList size={14} />}
        />
        <KpiCard
          label="Accuracy"
          value={formatPercent(practice.accuracy)}
          sub={
            practice.questionsAnswered > 0
              ? `${practice.correctAnswers} correct · ${practice.incorrectAnswers} wrong`
              : 'No answers recorded'
          }
          hint="Correct share of recorded answers, computed from stored answer rows."
          icon={<Target size={14} />}
          accent="#10b981"
          muted={practice.accuracy === null}
        />
        <KpiCard
          label="Answers recorded"
          value={formatCount(practice.questionsAnswered)}
          sub={`${practice.sessionsAbandoned} abandoned session${practice.sessionsAbandoned === 1 ? '' : 's'}`}
          icon={<MessageSquare size={14} />}
          accent="#f59e0b"
        />
        <KpiCard
          label="Session mode"
          value={
            practice.byMode.length > 0
              ? String(practice.byMode.reduce((sum, group) => sum + group.answered, 0))
              : '—'
          }
          sub={
            practice.byMode
              .map((group) => `${group.label} ${group.answered}`)
              .join(' · ') || 'No mode data'
          }
          hint="Answers split by timed and practice mode."
          icon={<Timer size={14} />}
          accent="#8b5cf6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Accuracy by category">
          <BarBreakdown
            data={toBars(
              practice.byCategory,
              (item) => item.answered,
              (item) => `${formatPercent(item.accuracy)} · ${item.correct}/${item.answered}`,
            )}
            empty="Category breakdown appears once answers are recorded."
          />
        </SectionCard>
        <SectionCard title="Accuracy by difficulty">
          <BarBreakdown
            data={toBars(
              practice.byDifficulty,
              (item) => item.answered,
              (item) => `${formatPercent(item.accuracy)} · ${item.correct}/${item.answered}`,
            )}
            empty="Difficulty breakdown appears once answers are recorded."
          />
        </SectionCard>
        <SectionCard title="Accuracy by mode">
          <BarBreakdown
            data={toBars(
              practice.byMode,
              (item) => item.answered,
              (item) => `${formatPercent(item.accuracy)} · ${item.correct}/${item.answered}`,
            )}
            empty="No timed or practice answers recorded yet."
          />
        </SectionCard>
        <SectionCard title="Accuracy by test type">
          <BarBreakdown
            data={toBars(
              practice.byKind,
              (item) => item.answered,
              (item) => `${formatPercent(item.accuracy)} · ${item.correct}/${item.answered}`,
            )}
            empty="No aptitude or branch MCQ answers recorded yet."
          />
        </SectionCard>
      </div>

      {practice.byTopic.length > 0 && (
        <SectionCard title="Topic performance" description="Top topics by answers recorded.">
          <div className="space-y-2.5">
            {practice.byTopic.slice(0, 10).map((group) => (
              <div key={group.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {group.label}
                  </p>
                  <span className="text-[11px] text-[var(--text-secondary)] tabular-nums shrink-0">
                    {formatPercent(group.accuracy)}
                  </span>
                </div>
                <ProgressBar value={group.accuracy ?? 0} size="sm" />
                <p className="text-[10px] text-[var(--text-muted)]">
                  {group.correct}/{group.answered} correct
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Answer trend"
        description={practice.trendGranularity === 'day' ? 'Daily' : 'Monthly'}
      >
        <TrendChart
          points={practice.trend.map((bucket) => ({
            label: bucket.label,
            primary: bucket.answered,
            secondary: bucket.correct,
          }))}
          primaryLabel="Answers"
          secondaryLabel="Correct"
          empty="No answers in this period."
        />
      </SectionCard>

      <SectionCard title="Recent sessions">
        {practice.recentSessions.length === 0 ? (
          <InlineEmpty text="No practice sessions recorded yet." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {practice.recentSessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {session.kind === 'aptitude' ? 'Aptitude' : 'Branch MCQ'}
                    {session.topic ? ` · ${humanizeToken(session.topic)}` : ''}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {humanizeToken(session.mode)} · {humanizeToken(session.difficulty)} ·{' '}
                    {session.correct}/{session.answered} correct
                  </p>
                </div>
                <StatusPill tone={tokenTone(session.status)}>
                  {humanizeToken(session.status)}
                </StatusPill>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
                  {formatSessionDate(session.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

// ── Resume ──────────────────────────────────────────────────────

function ResumeTab({ onNavigate }: { onNavigate: AnalyticsProps['onNavigate'] }) {
  return (
    <div className="space-y-4">
      <ModuleEmpty
        title="Resume scores are not stored on the server"
        reason="Resume analysis runs in this browser and the report is saved to this device's local storage only. There is no server-side ATS history, so this dashboard cannot show a latest score, a previous-versus-latest comparison, or an improvement trend."
        hint="Open Resume Analysis to run or review the analysis saved on this device."
      />
      <SectionCard title="What is and is not recorded">
        <ul className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
          <li className="flex gap-2">
            <span className="text-amber-500 font-bold shrink-0">Not recorded</span>
            <span>
              ATS score, keyword coverage, skill gaps and improvement history are not written to any
              database table, so they are never aggregated here.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-500 font-bold shrink-0">Recorded</span>
            <span>
              The most recent analysis for your account is kept in this browser only. Clearing site data
              removes it.
            </span>
          </li>
        </ul>
        <div className="mt-4">
          <Button size="sm" variant="secondary" onClick={() => onNavigate('report')}>
            <FileText size={13} /> Interview reports instead
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}

// ── Roadmap ─────────────────────────────────────────────────────

function RoadmapTab({ roadmap }: { roadmap: RoadmapAnalytics | null }) {
  if (!roadmap) {
    return (
      <ModuleEmpty
        title="Roadmap analytics unavailable"
        reason="Roadmap progress is not readable in this environment. Completion counts appear once the progress table exists."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Topics completed"
          value={formatCount(roadmap.topicsCompleted)}
          sub={`${roadmap.topicsCompletedInRange} in selected range`}
          hint="Topics you marked complete on your roadmap. Counts come from stored completion rows."
          icon={<Map size={14} />}
          accent="#0ea5e9"
        />
        <KpiCard
          label="Planned tasks"
          value={formatCount(roadmap.topicsPlanned)}
          sub={roadmap.topicsPlanned !== null ? 'In your latest saved plan' : 'No saved plan'}
          hint="Task count of your most recent saved AI roadmap plan. A plan stores task titles, not catalog topic ids, so it is not comparable to completions."
          icon={<ClipboardList size={14} />}
          muted={roadmap.topicsPlanned === null}
        />
        <KpiCard
          label="In progress"
          value="—"
          sub="Not stored by the app"
          hint="The roadmap only records completion. There is no in-progress state to read."
          icon={<Activity size={14} />}
          muted
        />
        <KpiCard
          label="Pending"
          value="—"
          sub="Cannot be derived honestly"
          hint="Pending requires matching plan tasks to catalog topic ids, which is not stored server-side."
          icon={<Timer size={14} />}
          muted
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Completed by domain">
          <BarBreakdown
            data={toBars(roadmap.byDomain, (item) => item.completed, (item) => String(item.completed))}
            empty="No completed topics yet."
          />
        </SectionCard>
        <SectionCard title="Recently completed">
          {roadmap.recentlyCompleted.length === 0 ? (
            <InlineEmpty text="No completed topics yet." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {roadmap.recentlyCompleted.map((topic) => (
                <li
                  key={`${topic.domainId}:${topic.topicId}`}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {humanizeToken(topic.topicId)}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">{topic.domainLabel}</p>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
                    {formatSessionDate(topic.completedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="px-1">
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed flex gap-1.5">
          <InfoTip text="Only completion rows are persisted, so in-progress and pending counts cannot be reported without guessing." />
          The roadmap only persists completed topics. In-progress and pending counts are shown as
          unavailable rather than estimated
          {roadmap.planGeneratedAt
            ? `. Latest plan generated ${formatSessionDate(roadmap.planGeneratedAt)}.`
            : '.'}
        </p>
      </div>
    </div>
  )
}

// ── Placement ───────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Applied: '#3b82f6',
  'Under Review': '#f59e0b',
  Shortlisted: '#10b981',
  Rejected: '#ef4444',
}

function PlacementTab({
  applications,
  scope,
}: {
  applications: PlacementAnalytics | null
  scope: 'student' | 'college'
}) {
  if (!applications) {
    return (
      <ModuleEmpty
        title="Placement analytics unavailable"
        reason="Job applications are not readable in this environment. Status counts appear once the applications table exists."
      />
    )
  }

  if (applications.total === 0) {
    return (
      <ModuleEmpty
        title={
          scope === 'college' ? 'No college applications in this range' : 'No applications in this range'
        }
        reason={
          scope === 'college'
            ? 'No student applications were recorded for your college in the selected range.'
            : 'Apply to a campus job to start building your placement activity here.'
        }
        hint="Try a wider date range."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {applications.byStatus.map((entry) => (
          <KpiCard
            key={entry.status}
            label={entry.status}
            value={formatCount(entry.count)}
            sub={
              applications.total > 0
                ? `${Math.round((entry.count / applications.total) * 100)}% of ${applications.total}`
                : undefined
            }
            accent={STATUS_COLORS[entry.status]}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Status distribution"
          description={scope === 'college' ? 'Across your college' : 'Across your applications'}
        >
          <BarBreakdown
            data={applications.byStatus
              .filter((entry) => entry.count > 0)
              .map((entry) => ({
                key: entry.status,
                label: entry.status,
                value: entry.count,
                caption: String(entry.count),
                share: (entry.count / Math.max(1, applications.total)) * 100,
                color: STATUS_COLORS[entry.status],
              }))}
            empty="No applications recorded yet."
          />
        </SectionCard>

        <SectionCard
          title="Application activity"
          description={applications.trendGranularity === 'day' ? 'Daily' : 'Monthly'}
        >
          <TrendChart
            points={applications.trend.map((bucket) => ({
              label: bucket.label,
              primary: bucket.applications,
            }))}
            primaryLabel="Applications"
            empty="No applications in this period."
          />
        </SectionCard>
      </div>

      {scope === 'college' && (
        <Card className="p-4 flex items-start gap-3">
          <Target size={15} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            College-wide view: only aggregate application counts are shown. No individual student's
            application, transcript or answer is ever displayed.
          </p>
        </Card>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────

export default function Analytics({ onNavigate }: AnalyticsProps) {
  const [rangeTab, setRangeTab] = useState('All')
  const [moduleTab, setModuleTab] = useState<ModuleTab>('Overview')
  const range = RANGE_TABS.find((entry) => entry.tab === rangeTab)?.range ?? 'all'

  const { data, loading, refreshing, error, reload } = useAnalyticsDashboard(range)

  const scope = data?.scope ?? 'student'
  const isEmpty = dashboardIsEmpty(data)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <BarChart3 size={22} className="text-[var(--accent-from)]" />
            Analytics
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {scope === 'college'
              ? 'Aggregated interview and placement performance across students in your college.'
              : 'Your interview, DSA, practice, roadmap and placement performance in one place.'}{' '}
            <span className="text-[var(--text-muted)]">· {rangeLabel(range)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <GraduationCap size={12} /> {scopeLabel(scope)}
          </span>
          <Button variant="secondary" size="sm" loading={refreshing} onClick={reload}>
            {!refreshing && <RefreshCw size={13} />} Refresh
          </Button>
          <TabBar tabs={RANGE_TABS.map((entry) => entry.tab)} active={rangeTab} onChange={setRangeTab} />
        </div>
      </div>

      {error && !data ? (
        <Card className="p-10 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] flex items-center justify-center">
            <AlertCircle size={26} className="text-[var(--accent-from)]" />
          </div>
          <div>
            <h3 className="font-extrabold text-[var(--text-primary)] mb-1">Could not load analytics</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed">{error}</p>
          </div>
          <Button variant="secondary" onClick={reload}>
            <RefreshCw size={14} /> Retry
          </Button>
        </Card>
      ) : loading && !data ? (
        <DashboardSkeleton />
      ) : !data ? (
        <Card className="p-10 flex flex-col items-center text-center gap-4">
          <Loader2 size={26} className="text-[var(--accent-from)] animate-spin" />
          <p className="text-sm text-[var(--text-muted)]">Loading your analytics…</p>
        </Card>
      ) : (
        <>
          {error && (
            <Card className="p-3 flex items-center gap-2 border-amber-500/30">
              <AlertCircle size={14} className="text-amber-500 shrink-0" />
              <p className="text-xs text-[var(--text-muted)] flex-1">{error}</p>
              <button
                onClick={reload}
                className="text-xs font-semibold text-[var(--accent-from)] hover:underline cursor-pointer"
              >
                Retry
              </button>
            </Card>
          )}

          <div className="overflow-x-auto -mx-1 px-1">
            <TabBar
              tabs={[...MODULE_TABS]}
              active={moduleTab}
              onChange={(tab) => setModuleTab(tab as ModuleTab)}
            />
          </div>

          {isEmpty && moduleTab === 'Overview' ? (
            <ModuleEmpty
              title={scope === 'college' ? 'No college activity yet' : 'No analytics data yet'}
              reason={
                scope === 'college'
                  ? 'This dashboard is built from persisted records. No interview sessions or job applications have been recorded for your college in this period.'
                  : 'This dashboard is built from persisted records. Nothing has been recorded in this period yet, so there is nothing to chart.'
              }
              hint={scope === 'student' ? 'Try a wider date range, or start an interview.' : undefined}
            />
          ) : moduleTab === 'Overview' ? (
            <OverviewTab data={data} onNavigate={onNavigate} onSelectModule={setModuleTab} />
          ) : moduleTab === 'Interviews' ? (
            <InterviewsTab interviews={data.interviews} scope={scope} onNavigate={onNavigate} />
          ) : moduleTab === 'DSA & Coding' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Problem Solving (DSA)
                </h2>
                <DsaSection dsa={data.dsa} />
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Interview Coding Round
                </h2>
                <CodingSection dash={data} />
              </div>
            </div>
          ) : moduleTab === 'Practice Hub' ? (
            <PracticeTab practice={data.practice} />
          ) : moduleTab === 'Resume' ? (
            <ResumeTab onNavigate={onNavigate} />
          ) : moduleTab === 'Roadmap' ? (
            <RoadmapTab roadmap={data.roadmap} />
          ) : (
            <PlacementTab applications={data.applications} scope={scope} />
          )}

          {data.notes.length > 0 && moduleTab === 'Overview' && (
            <div className="flex items-start gap-2 px-1">
              <InfoTip text={data.notes.join(' ')} />
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                {data.notes[0]}
                {data.notes.length > 1 ? ` (+${data.notes.length - 1} more)` : ''}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
