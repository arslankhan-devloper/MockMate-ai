import { type ReactNode, useId, useState } from 'react'
import { Info } from 'lucide-react'
import { Card } from '../ui'

// Reusable dashboard widgets for the Analytics page.
//
// Everything here is presentational: no data is fetched or invented. A `null`
// value renders as an explicit "no data" affordance instead of a zero, so an
// unavailable module can never be mistaken for a genuine 0% score.

// ── Tooltip ─────────────────────────────────────────────────────

export function InfoTip({ text }: { text: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={text}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-[var(--text-muted)] hover:text-[var(--accent-from)] transition-all-smooth cursor-help"
      >
        <Info size={12} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-56 px-2.5 py-2 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border)] shadow-[var(--shadow-lg)] text-[11px] leading-snug font-normal normal-case tracking-normal text-[var(--text-secondary)]"
        >
          {text}
        </span>
      )}
    </span>
  )
}

// ── KPI card ────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  hint?: string
  icon?: ReactNode
  accent?: string
  muted?: boolean
}

export function KpiCard({ label, value, sub, hint, icon, accent, muted }: KpiCardProps) {
  return (
    <Card className="p-4 h-full">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
          {label}
          {hint && <InfoTip text={hint} />}
        </p>
        {icon && (
          <div
            className="w-7 h-7 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center"
            style={{ background: accent ? `${accent}1a` : 'var(--accent-soft)', color: accent ?? 'var(--accent-from)' }}
          >
            {icon}
          </div>
        )}
      </div>
      <p
        className={`text-xl font-extrabold leading-tight ${muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{sub}</p>}
    </Card>
  )
}

// ── Section shell ───────────────────────────────────────────────

export function SectionCard({
  title,
  description,
  hint,
  action,
  children,
  className = '',
}: {
  title: string
  description?: string
  hint?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            {title}
            {hint && <InfoTip text={hint} />}
          </h2>
          {description && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </Card>
  )
}

// ── Bar breakdown ───────────────────────────────────────────────

export interface BarDatum {
  key: string
  label: string
  value: number
  caption?: string
  /** 0–100 share of the widest bar; computed by the caller. */
  share: number
  color?: string
}

export function BarBreakdown({ data, empty }: { data: BarDatum[]; empty: string }) {
  if (data.length === 0) return <InlineEmpty text={empty} />
  return (
    <ul className="space-y-2.5">
      {data.map((datum) => (
        <li key={datum.key}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-[var(--text-secondary)] truncate" title={datum.label}>
              {datum.label}
            </span>
            <span className="text-xs font-semibold text-[var(--text-primary)] shrink-0 tabular-nums">
              {datum.caption ?? datum.value}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--accent-soft)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, Math.min(100, datum.share))}%`,
                background: datum.color ?? 'linear-gradient(90deg, var(--accent-from), var(--accent-to))',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Trend chart (dependency-free SVG bars) ──────────────────────

export interface TrendPoint {
  label: string
  primary: number
  secondary?: number
}

/**
 * Compact grouped bar chart. Only real buckets are plotted — an empty period
 * produces no bar at all rather than a zero-height column that implies "nothing
 * happened that day".
 */
export function TrendChart({
  points,
  primaryLabel,
  secondaryLabel,
  empty,
}: {
  points: TrendPoint[]
  primaryLabel: string
  secondaryLabel?: string
  empty: string
}) {
  if (points.length === 0) return <InlineEmpty text={empty} />

  const peak = Math.max(
    1,
    ...points.map((point) => Math.max(point.primary, point.secondary ?? 0)),
  )
  const showSecondary = points.some((point) => (point.secondary ?? 0) > 0)

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[var(--accent-from)]" /> {primaryLabel}
        </span>
        {showSecondary && secondaryLabel && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" /> {secondaryLabel}
          </span>
        )}
      </div>
      <div className="flex items-end gap-1.5 h-32">
        {points.map((point) => (
          <div key={point.label} className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <div className="w-full flex items-end justify-center gap-0.5 h-full">
              <div
                className="w-full max-w-[14px] rounded-t-sm bg-[var(--accent-from)]"
                style={{ height: `${Math.max(3, (point.primary / peak) * 100)}%` }}
                title={`${point.label}: ${point.primary} ${primaryLabel.toLowerCase()}`}
              />
              {showSecondary && (
                <div
                  className="w-full max-w-[14px] rounded-t-sm bg-emerald-500"
                  style={{ height: `${Math.max(3, ((point.secondary ?? 0) / peak) * 100)}%` }}
                  title={`${point.label}: ${point.secondary ?? 0} ${(secondaryLabel ?? '').toLowerCase()}`}
                />
              )}
            </div>
            <span className="text-[9px] text-[var(--text-muted)] truncate w-full text-center">
              {point.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Status / empty / loading ────────────────────────────────────

export function InlineEmpty({ text }: { text: string }) {
  return (
    <p className="text-xs text-[var(--text-muted)] italic px-1 py-3 leading-snug">{text}</p>
  )
}

export function ModuleEmpty({
  title,
  reason,
  hint,
}: {
  title: string
  reason: string
  hint?: string
}) {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">{title}</p>
      <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">{reason}</p>
      {hint && <p className="text-[11px] text-[var(--text-muted)] mt-3 italic">{hint}</p>}
    </Card>
  )
}

export function SkeletonBlock({ className = 'h-4' }: { className?: string }) {
  return <div className={`rounded-[var(--radius-sm)] bg-[var(--accent-soft)] animate-pulse ${className}`} />
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading analytics">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="p-4">
            <SkeletonBlock className="h-3 w-20 mb-3" />
            <SkeletonBlock className="h-6 w-14 mb-2" />
            <SkeletonBlock className="h-2.5 w-24" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-5">
            <SkeletonBlock className="h-3 w-28 mb-4" />
            <SkeletonBlock className="h-32 w-full" />
          </Card>
        ))}
      </div>
    </div>
  )
}

export function StatusPill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    error: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    neutral: 'bg-[var(--accent-soft)] text-[var(--text-secondary)] border-[var(--border)]',
  }
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm)] border text-[10px] font-semibold whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

/** Green for accepted/shortlisted, amber for review, red for failed/rejected. */
export function tokenTone(token: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  const value = token.toLowerCase().replace(/[\s_-]+/g, '')
  if (['accepted', 'success', 'shortlisted', 'completed', 'done'].includes(value)) return 'success'
  if (['underreview', 'active', 'inprogress', 'applied'].includes(value)) return 'warning'
  if (['wronganswer', 'runtimeerror', 'compileerror', 'rejected', 'error', 'abandoned', 'failed'].includes(value)) {
    return 'error'
  }
  return 'neutral'
}
