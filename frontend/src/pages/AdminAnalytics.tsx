import { useState, useEffect } from 'react'
import {
  Users,
  GraduationCap,
  Briefcase,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { Card, Button, Badge, ProgressBar } from '../components/ui'
import { getAdminDashboard, type AdminDashboardData } from '../lib/adminApi'
import { useAuth } from '../lib/auth'

export default function AdminAnalytics() {
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
      console.error('[AdminAnalytics] Load failed:', err)
      setError('Failed to compute institutional analytics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [token])

  if (loading && !data) {
    return (
      <div className="py-24 text-center">
        <RefreshCw size={24} className="animate-spin text-[var(--accent-from)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-secondary)]">Aggregating institutional telemetry...</p>
      </div>
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
  const shortlistedCount = appStatus['Shortlisted'] ?? 0
  const shortlistedRate = Math.round((shortlistedCount / totalApps) * 100)

  const totalOfficers = metrics.totalOfficers || 1
  const officerApprovalRate = Math.round((metrics.approvedOfficers / totalOfficers) * 100)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-[var(--text-primary)]">
              Institutional Placement Analytics
            </h1>
            <Badge variant="info">Live Real Data</Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Cross-institution metrics on candidate throughput, recruitment conversion, and officer staffing.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Recalculate
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Ratios & Key Conversion Rates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Shortlist Conversion Rate
          </span>
          <div className="flex items-baseline gap-2 mt-2 mb-1">
            <span className="text-3xl font-black text-emerald-500">{shortlistedRate}%</span>
            <span className="text-xs text-[var(--text-muted)]">
              ({shortlistedCount} of {metrics.totalApplications} apps)
            </span>
          </div>
          <ProgressBar value={shortlistedRate} color="#10b981" size="sm" />
          <p className="text-[11px] text-[var(--text-secondary)] mt-2">
            Proportion of student applications moved to Shortlisted status across all drives.
          </p>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Officer Verification Rate
          </span>
          <div className="flex items-baseline gap-2 mt-2 mb-1">
            <span className="text-3xl font-black text-purple-500">{officerApprovalRate}%</span>
            <span className="text-xs text-[var(--text-muted)]">
              ({metrics.approvedOfficers} of {metrics.totalOfficers} officers)
            </span>
          </div>
          <ProgressBar value={officerApprovalRate} color="#a855f7" size="sm" />
          <p className="text-[11px] text-[var(--text-secondary)] mt-2">
            Placement coordinators verified and granted institution access.
          </p>
        </Card>

        <Card className="p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Drive Capacity Utilization
          </span>
          <div className="flex items-baseline gap-2 mt-2 mb-1">
            <span className="text-3xl font-black text-blue-500">
              {metrics.totalDrives > 0 ? Math.round((metrics.activeDrives / metrics.totalDrives) * 100) : 0}%
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              ({metrics.activeDrives} active drives)
            </span>
          </div>
          <ProgressBar
            value={metrics.totalDrives > 0 ? Math.round((metrics.activeDrives / metrics.totalDrives) * 100) : 0}
            color="#3b82f6"
            size="sm"
          />
          <p className="text-[11px] text-[var(--text-secondary)] mt-2">
            Active published drives currently accepting applications.
          </p>
        </Card>
      </div>

      {/* Deep-dive Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Application Outcome Funnel */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Application Outcome Funnel
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Step-by-step candidate progression through placement evaluation
              </p>
            </div>
            <Badge variant="default">{metrics.totalApplications} Applications</Badge>
          </div>

          <div className="space-y-4">
            {[
              {
                stage: '1. Applications Submitted',
                count: metrics.totalApplications,
                color: '#6366f1',
                pct: 100,
              },
              {
                stage: '2. In Active Review',
                count: appStatus['Under Review'] ?? 0,
                color: '#f59e0b',
                pct: Math.round(((appStatus['Under Review'] ?? 0) / totalApps) * 100),
              },
              {
                stage: '3. Shortlisted for Interviews',
                count: appStatus['Shortlisted'] ?? 0,
                color: '#10b981',
                pct: shortlistedRate,
              },
              {
                stage: '4. Rejected / Closed',
                count: appStatus['Rejected'] ?? 0,
                color: '#ef4444',
                pct: Math.round(((appStatus['Rejected'] ?? 0) / totalApps) * 100),
              },
            ].map(({ stage, count, color, pct }) => (
              <div key={stage} className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-[var(--text-primary)]">{stage}</span>
                  <span className="font-mono font-bold" style={{ color }}>
                    {count} ({pct}%)
                  </span>
                </div>
                <ProgressBar value={pct} color={color} size="sm" />
              </div>
            ))}
          </div>
        </Card>

        {/* Institutional Coverage & Staffing */}
        <Card className="p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Institutional Coverage & Staffing
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Affiliation ratio of students and officers across partner institutions
                </p>
              </div>
              <Badge variant="info">{metrics.totalColleges} Institutions</Badge>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--text-muted)] font-semibold">Average Students Per College</p>
                  <p className="text-2xl font-black text-[var(--text-primary)] mt-1">
                    {metrics.totalColleges > 0 ? Math.round(metrics.totalStudents / metrics.totalColleges) : 0}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                  <GraduationCap size={20} />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--text-muted)] font-semibold">Average Officers Per College</p>
                  <p className="text-2xl font-black text-[var(--text-primary)] mt-1">
                    {metrics.totalColleges > 0 ? (metrics.totalOfficers / metrics.totalColleges).toFixed(1) : '0'}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold">
                  <Users size={20} />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--text-muted)] font-semibold">Average Drives Per College</p>
                  <p className="text-2xl font-black text-[var(--text-primary)] mt-1">
                    {metrics.totalColleges > 0 ? (metrics.totalDrives / metrics.totalColleges).toFixed(1) : '0'}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                  <Briefcase size={20} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
            All ratios are computed directly from database row counts without synthetic estimations.
          </div>
        </Card>
      </div>
    </div>
  )
}
