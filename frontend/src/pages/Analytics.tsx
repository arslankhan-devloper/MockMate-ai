import { useState } from 'react'
import {
  BarChart3, Mic, CheckCircle2, Brain, MessageSquare, TrendingUp, Activity,
  Target, AlertCircle, RefreshCw, Loader2, ChevronRight, Briefcase,
} from 'lucide-react'
import { Card, Badge, TabBar, Button, StatCard, ProgressBar } from '../components/ui'
import { useInterviewAnalytics } from '../hooks/useInterviewAnalytics'
import type {
  InterviewAnalyticsApplications,
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

function statusVariant(status: string): 'success' | 'warning' | 'info' {
  if (status === 'completed') return 'success'
  if (status === 'abandoned') return 'warning'
  return 'info'
}

function humanizeType(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'Interview'
  return trimmed.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// A breakdown list with a bar per group. Groups are ordered by session count by
// the server; a group with no valid score shows "Not scored" rather than 0.
function Breakdown({ title, groups, emptyHint }: {
  title: string
  groups: InterviewAnalyticsGroup[]
  emptyHint: string
}) {
  return (
    <Card className="p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4">{title}</p>
      {groups.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{emptyHint}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{group.label}</p>
                <span className="text-xs font-bold text-[var(--text-secondary)] flex-shrink-0">
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
    </Card>
  )
}

// Lightweight SVG line chart. It uses only server-provided monthly averages and
// exposes each point through a <title> tooltip, so no charting dependency (and
// no fabricated points) is needed.
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
      aria-label={`Monthly average interview score trend across ${buckets.length} months`}
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

function TopicInsights({ strengths, weaknesses }: {
  strengths: InterviewAnalyticsGroup[]
  weaknesses: InterviewAnalyticsGroup[]
}) {
  const section = (
    title: string,
    icon: 'strength' | 'weakness',
    groups: InterviewAnalyticsGroup[],
  ) => (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
        {title}
      </p>
      {groups.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Not enough evaluated answers per topic yet.
        </p>
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
              <span className="text-xs font-bold text-[var(--text-secondary)]">
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
  )

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target size={15} className="text-[var(--accent-from)]" />
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Topic Strengths and Weaknesses
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {section('Strengths', 'strength', strengths)}
        {section('Weaknesses', 'weakness', weaknesses)}
      </div>
    </Card>
  )
}

const APPLICATION_COLORS: Record<string, string> = {
  Applied: '#3b82f6',
  'Under Review': '#f59e0b',
  Shortlisted: '#10b981',
  Rejected: '#ef4444',
}

function ApplicationsCard({ analytics, scope }: {
  analytics: InterviewAnalyticsApplications
  scope: 'student' | 'college'
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase size={15} className="text-[var(--accent-from)]" />
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {scope === 'college' ? 'College Job Applications' : 'Job Applications'}
        </p>
        <Badge variant="info" className="ml-auto">
          {analytics.total} in period
        </Badge>
      </div>

      {analytics.total === 0 ? (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          {scope === 'college'
            ? 'No job applications were recorded for your college in this period.'
            : 'No job applications were recorded in this period.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {analytics.byStatus.map((status) => {
            const share = analytics.total > 0 ? (status.count / analytics.total) * 100 : 0
            return (
              <div key={status.status} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">{status.status}</p>
                  <p className="text-lg font-extrabold text-[var(--text-primary)]">{status.count}</p>
                </div>
                <ProgressBar value={share} size="sm" color={APPLICATION_COLORS[status.status]} />
                <p className="text-[10px] text-[var(--text-muted)]">{Math.round(share)}% of applications</p>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export default function Analytics({ onNavigate }: AnalyticsProps) {
  const [tab, setTab] = useState('All')
  const range = RANGE_TABS.find((t) => t.tab === tab)?.range ?? 'all'

  const { data, loading, error, reload } = useInterviewAnalytics(range)
  const applicationAnalytics = data?.applications ?? null
  const completion = completionRate(data?.totals ?? null)
  const topicHighlights = pickScoreHighlights(data?.byTopic ?? [])
  const domainHighlights = pickScoreHighlights(data?.byDomain ?? [])
  const highlights = topicHighlights ?? domainHighlights
  const performanceLabel = topicHighlights ? 'topic' : 'domain'
  const totals = data?.totals ?? null
  const sessionsCount = totals?.sessions ?? 0
  const hasSessions = (data?.availability.sessions ?? false) && sessionsCount > 0
  const trend = data?.trend ?? null
  const notes = data?.notes ?? []
  const isCollegeScope = data?.scope === 'college'

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Analytics</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {isCollegeScope
              ? 'Aggregated interview performance across students in your college.'
              : 'Track your preparation progress and interview performance over time.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            loading={loading && Boolean(data)}
            onClick={reload}
          >
            {!(loading && data) && <RefreshCw size={13} />} Refresh
          </Button>
          <TabBar tabs={RANGE_TABS.map((t) => t.tab)} active={tab} onChange={setTab} />
        </div>
      </div>

      {error ? (
        <Card className="p-10 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] flex items-center justify-center">
            <AlertCircle size={26} className="text-[var(--accent-from)]" />
          </div>
          <div>
            <h3 className="font-extrabold text-[var(--text-primary)] mb-1">Could not load analytics</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed">{error}</p>
          </div>
          <Button variant="secondary" onClick={reload}><RefreshCw size={14} /> Retry</Button>
        </Card>
      ) : loading && !data ? (
        <Card className="p-10 flex flex-col items-center text-center gap-4">
          <Loader2 size={26} className="text-[var(--accent-from)] animate-spin" />
          <p className="text-sm text-[var(--text-muted)]">Loading your analytics…</p>
        </Card>
      ) : !hasSessions ? (
        <>
          <Card className="p-10 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] flex items-center justify-center">
              <BarChart3 size={26} className="text-[var(--accent-from)]" />
            </div>
            <div>
              <h3 className="font-extrabold text-[var(--text-primary)] mb-1">
                {isCollegeScope ? 'No college sessions recorded yet' : 'No interview data available yet'}
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed">
                {isCollegeScope
                  ? 'Performance metrics are built from persisted sessions. No sessions have been recorded for your college in this period.'
                  : 'Performance metrics are built from your persisted sessions. No sessions have been recorded in this period, so there is nothing to chart.'}
              </p>
            </div>
            {!isCollegeScope && (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Button onClick={() => onNavigate('interview-setup')}><Mic size={14} /> Start a Session</Button>
                <Button variant="secondary" onClick={() => onNavigate('roadmap')}>View Roadmap</Button>
              </div>
            )}
          </Card>
          {applicationAnalytics && (
            <ApplicationsCard
              analytics={applicationAnalytics}
              scope={isCollegeScope ? 'college' : 'student'}
            />
          )}
          {notes.length > 0 && (
            <div className="space-y-1">
              {notes.map((note) => (
                <p key={note} className="text-[11px] text-[var(--text-muted)] leading-relaxed">{note}</p>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Interviews Done"
              value={String(sessionsCount)}
              sub={`${totals?.completed ?? 0} completed · ${totals?.inProgress ?? 0} in progress`}
              icon={<Mic size={16} />}
            />
            <StatCard
              label="Completed"
              value={String(totals?.completed ?? 0)}
              sub={
                completion !== null
                  ? `${completion}% completion · ${totals?.abandoned ?? 0} abandoned`
                  : `${totals?.abandoned ?? 0} abandoned`
              }
              icon={<CheckCircle2 size={16} />}
              color="#10b981"
            />
            <StatCard
              label="Avg Interview Score"
              value={totals?.averageScore !== null && totals?.averageScore !== undefined ? totals.averageScore.toFixed(1) : '—'}
              sub={
                totals?.averageScore !== null && totals?.averageScore !== undefined
                  ? `From ${totals.evaluatedAnswers} evaluated answers in completed interviews`
                  : 'No scored answers yet'
              }
              icon={<Brain size={16} />}
              color="#3b82f6"
            />
            <StatCard
              label="Questions Answered"
              value={totals?.answeredQuestions != null ? String(totals.answeredQuestions) : '—'}
              sub={totals?.answeredQuestions != null ? `${totals.unansweredQuestions ?? 0} skipped` : 'Not tracked yet'}
              icon={<MessageSquare size={16} />}
              color="#f59e0b"
            />
          </div>

          {!data?.availability.topics && highlights && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Target size={16} className="text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Strongest {performanceLabel}</p>
                  <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">{highlights.strongest.label}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {highlights.strongest.averageScore?.toFixed(1)}/100 across {highlights.strongest.evaluatedAnswers} evaluated answer{highlights.strongest.evaluatedAnswers === 1 ? '' : 's'}
                  </p>
                </div>
              </Card>
              <Card className="p-5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={16} className="text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Focus next: weakest {performanceLabel}</p>
                  <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">{highlights.weakest.label}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {highlights.weakest.averageScore?.toFixed(1)}/100 across {highlights.weakest.evaluatedAnswers} evaluated answer{highlights.weakest.evaluatedAnswers === 1 ? '' : 's'}
                  </p>
                </div>
              </Card>
            </div>
          )}

          {data?.availability.topics && (
            <TopicInsights
              strengths={data?.strengths ?? []}
              weaknesses={data?.weaknesses ?? []}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data?.availability.topics && (
              <Breakdown
                title="Performance by Topic"
                groups={data?.byTopic ?? []}
                emptyHint="Topic performance appears once evaluated questions include a topic."
              />
            )}
            <Breakdown
              title="Performance by Domain"
              groups={data?.byDomain ?? []}
              emptyHint="Domain breakdown appears once sessions are recorded."
            />
            <Breakdown
              title="Performance by Difficulty"
              groups={data?.byDifficulty ?? []}
              emptyHint="Difficulty breakdown appears once sessions are recorded."
            />
          </div>

          {applicationAnalytics && (
            <ApplicationsCard
              analytics={applicationAnalytics}
              scope={isCollegeScope ? 'college' : 'student'}
            />
          )}

          {trend && trend.buckets.length >= 2 && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={15} className="text-[var(--accent-from)]" />
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Score Trend</p>
                <Badge variant="info" className="ml-auto">Monthly average</Badge>
              </div>
              <ScoreTrendChart buckets={trend.buckets} />
              <div className="mt-5 space-y-4">
                {trend.buckets.map((bucket) => (
                  <div key={bucket.periodStart} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{bucket.label}</p>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">{bucket.averageScore.toFixed(1)}/100</span>
                    </div>
                    <ProgressBar value={bucket.averageScore} size="sm" />
                    <p className="text-[10px] text-[var(--text-muted)]">{bucket.evaluatedAnswers} evaluated answer{bucket.evaluatedAnswers === 1 ? '' : 's'}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!isCollegeScope && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Recent Sessions</p>
                <button onClick={() => onNavigate('report')} className="text-xs text-[var(--accent-from)] font-semibold hover:underline flex items-center gap-1">All Reports <ChevronRight size={13} /></button>
              </div>
              {(data?.recentSessions ?? []).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No sessions in this period.</p>
              ) : (
                <div className="space-y-3">
                  {(data?.recentSessions ?? []).map((session) => (
                    <button
                      key={session.id}
                      onClick={() => onNavigate('report', session.id)}
                      className="w-full text-left p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-from)] transition-all-smooth cursor-pointer flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                        {session.status === 'completed'
                          ? <CheckCircle2 size={15} className="text-[var(--accent-from)]" />
                          : <Activity size={15} className="text-[var(--accent-from)]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {humanizeType(session.interviewType)}{session.difficulty ? ` · ${session.difficulty}` : ''}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-2">
                          {formatSessionDate(session.startedAt)}
                          <Badge variant={statusVariant(session.status)}>{statusLabel(session.status)}</Badge>
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-extrabold ${session.averageScore !== null ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                          {session.averageScore !== null ? session.averageScore.toFixed(1) : '—'}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {session.questionCount !== null ? `${session.answeredQuestions ?? 0}/${session.questionCount} answered` : 'View report'}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {isCollegeScope && (
            <Card className="p-6 flex items-start gap-3">
              <Target size={15} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                College-wide view: only aggregated totals are shown. Individual students' transcripts, answers and per-answer evaluations are never displayed.
              </p>
            </Card>
          )}

          {notes.length > 0 && (
            <div className="space-y-1">
              {notes.map((note) => (
                <p key={note} className="text-[11px] text-[var(--text-muted)] leading-relaxed">{note}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
