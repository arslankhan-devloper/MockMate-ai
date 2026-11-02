import { useState, useEffect } from 'react'
import {
  GraduationCap,
  Building2,
  Users,
  Briefcase,
  FileCheck2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'
import { Card, Button, Badge, ProgressBar } from '../components/ui'
import { getAdminDashboard, type AdminDashboardData } from '../lib/adminApi'
import { useAuth } from '../lib/auth'
import type { AdminPage } from '../components/AdminLayout'

interface AdminDashboardProps {
  onNavigate: (p: AdminPage) => void
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { session } = useAuth()
  const token = session?.access_token

  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await getAdminDashboard(token)
      setData(res)
    } catch (err: unknown) {
      console.error('[AdminDashboard] Failed to fetch metrics:', err)
      setError('Unable to load administrative metrics from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [token])

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <RefreshCw size={24} className="animate-spin text-[var(--accent-from)]" />
        <p className="text-sm text-[var(--text-secondary)]">Loading administrative telemetry...</p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card className="p-8 text-center border-red-500/20 max-w-xl mx-auto">
        <AlertTriangle size={32} className="text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Telemetry Error</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-6">{error}</p>
        <Button onClick={loadData}>
          <RefreshCw size={14} /> Retry
        </Button>
      </Card>
    )
  }

  const metrics = data?.metrics ?? {
    totalStudents: 0,
    totalColleges: 0,
    totalOfficers: 0,
    pendingOfficers: 0,
    approvedOfficers: 0,
    suspendedOfficers: 0,
    rejectedOfficers: 0,
    totalDrives: 0,
    activeDrives: 0,
    totalApplications: 0,
  }

  const appStatus = data?.applicationsByStatus ?? {}
  const totalApps = metrics.totalApplications || 1

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)]">
              Admin Overview
            </h1>
            <Badge variant="success">System Live</Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            High-privilege oversight across all partner institutions, placement officers, and student drives.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh Metrics
        </Button>
      </div>

      {/* Pending Approvals Alert Banner */}
      {metrics.pendingOfficers > 0 && (
        <Card className="p-5 border-amber-500/30 bg-amber-500/5 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0 text-amber-500 font-bold">
                <Clock size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {metrics.pendingOfficers} Placement Officer Application{metrics.pendingOfficers > 1 ? 's' : ''} Awaiting Review
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Unverified officers cannot access placement management, drives, or student records until approved.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => onNavigate('admin-officers')}
              className="bg-amber-500 hover:bg-amber-600 text-white border-none shadow-md flex-shrink-0"
            >
              Review Applications <ArrowRight size={14} />
            </Button>
          </div>
        </Card>
      )}

      {/* Core KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Colleges
            </span>
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Building2 size={18} />
            </div>
          </div>
          <p className="text-3xl font-black text-[var(--text-primary)] mb-1">
            {metrics.totalColleges}
          </p>
          <button
            onClick={() => onNavigate('admin-colleges')}
            className="text-xs font-semibold text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
          >
            Manage Institutions <ArrowRight size={12} />
          </button>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Placement Officers
            </span>
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Users size={18} />
            </div>
          </div>
          <p className="text-3xl font-black text-[var(--text-primary)] mb-1">
            {metrics.totalOfficers}
          </p>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="text-emerald-500 font-semibold">{metrics.approvedOfficers} approved</span>
            <span>•</span>
            <span className="text-amber-500 font-semibold">{metrics.pendingOfficers} pending</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Registered Students
            </span>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <GraduationCap size={18} />
            </div>
          </div>
          <p className="text-3xl font-black text-[var(--text-primary)] mb-1">
            {metrics.totalStudents}
          </p>
          <button
            onClick={() => onNavigate('admin-students')}
            className="text-xs font-semibold text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer"
          >
            Directory & Progress <ArrowRight size={12} />
          </button>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Active Drives
            </span>
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Briefcase size={18} />
            </div>
          </div>
          <p className="text-3xl font-black text-[var(--text-primary)] mb-1">
            {metrics.activeDrives}
            <span className="text-xs font-normal text-[var(--text-muted)] ml-1.5">
              / {metrics.totalDrives} total
            </span>
          </p>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <FileCheck2 size={13} className="text-indigo-500" />
            <span>{metrics.totalApplications} student applications</span>
          </div>
        </Card>
      </div>

      {/* Analytics & Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Application Status Distribution */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Placement Application Statuses
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Real status breakdown across all institutional placement drives
              </p>
            </div>
            <Badge variant="info">{metrics.totalApplications} Total</Badge>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Applied', count: appStatus['Applied'] ?? 0, color: '#3b82f6' },
              { label: 'Under Review', count: appStatus['Under Review'] ?? 0, color: '#eab308' },
              { label: 'Shortlisted', count: appStatus['Shortlisted'] ?? 0, color: '#10b981' },
              { label: 'Rejected', count: appStatus['Rejected'] ?? 0, color: '#ef4444' },
            ].map(({ label, count, color }) => {
              const pct = Math.round((count / totalApps) * 100)
              return (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                      {label}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <ProgressBar value={pct} color={color} size="sm" />
                </div>
              )
            })}
          </div>
        </Card>

        {/* Officer Status Breakdown & Quick Access */}
        <Card className="p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Placement Officer Cohort
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Verification status of departmental placement coordinators
                </p>
              </div>
              <Badge variant="default">{metrics.totalOfficers} Total</Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-center">
                <span className="text-xs text-[var(--text-muted)] font-medium">Approved</span>
                <p className="text-xl font-bold text-emerald-500 mt-1">{metrics.approvedOfficers}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-center">
                <span className="text-xs text-[var(--text-muted)] font-medium">Pending</span>
                <p className="text-xl font-bold text-amber-500 mt-1">{metrics.pendingOfficers}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-center">
                <span className="text-xs text-[var(--text-muted)] font-medium">Suspended</span>
                <p className="text-xl font-bold text-rose-500 mt-1">{metrics.suspendedOfficers}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-center">
                <span className="text-xs text-[var(--text-muted)] font-medium">Rejected</span>
                <p className="text-xl font-bold text-red-500 mt-1">{metrics.rejectedOfficers}</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">
              Officers are isolated strictly to their assigned colleges.
            </span>
            <Button size="sm" variant="secondary" onClick={() => onNavigate('admin-officers')}>
              Officer Management <ArrowRight size={13} />
            </Button>
          </div>
        </Card>
      </div>

      {/* Recent Audit Activity */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Recent Administrative Activity
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Live audit events recorded by the backend security subsystem
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onNavigate('admin-audit-logs')}>
            Full Audit Logs <ArrowRight size={13} />
          </Button>
        </div>

        {(!data?.recentActivity || data.recentActivity.length === 0) ? (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            No administrative events recorded in the current window.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {data.recentActivity.slice(0, 6).map(log => (
              <div key={log.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0 text-[var(--accent-from)]">
                    <ShieldCheck size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {log.action.replace(/_/g, ' ').toUpperCase()}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      Target: {log.target_type} {log.target_id ? `(${log.target_id.slice(0, 8)}...)` : ''}
                      {log.metadata && Object.keys(log.metadata).length > 0
                        ? ` • ${JSON.stringify(log.metadata).slice(0, 45)}...`
                        : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
