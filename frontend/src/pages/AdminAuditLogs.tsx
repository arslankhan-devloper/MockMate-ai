import { useState, useEffect } from 'react'
import {
  ScrollText,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  User,
  Globe,
} from 'lucide-react'
import { Card, Button, Badge } from '../components/ui'
import { listAdminAuditLogs, type AdminAuditLog } from '../lib/adminApi'
import { useAuth } from '../lib/auth'

export default function AdminAuditLogs() {
  const { session } = useAuth()
  const token = session?.access_token

  const [logs, setLogs] = useState<AdminAuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [actionFilter, setActionFilter] = useState('')
  const [targetTypeFilter, setTargetTypeFilter] = useState('')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  const loadLogs = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await listAdminAuditLogs(token, {
        limit: 100,
        action: actionFilter || undefined,
        targetType: targetTypeFilter || undefined,
      })
      setLogs(res.logs)
      setTotal(res.total)
    } catch (err: unknown) {
      console.error('[AdminAuditLogs] Failed to fetch audit logs:', err)
      setError('Failed to retrieve immutable audit logs from the security backend.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [token, actionFilter, targetTypeFilter])

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').toUpperCase()
  }

  const getActionBadgeColor = (action: string) => {
    if (action.includes('approved') || action.includes('created')) return 'success'
    if (action.includes('rejected') || action.includes('suspended') || action.includes('closed')) return 'error'
    if (action.includes('updated') || action.includes('reassigned')) return 'info'
    return 'default'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-[var(--text-primary)]">System Audit Trail</h1>
            <Badge variant="default">Immutable Log</Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Append-only security log recording administrative decisions, approvals, suspensions, and data updates.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadLogs} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh Logs
        </Button>
      </div>

      {/* Filter Controls */}
      <Card className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
          >
            <option value="">All Administrative Actions</option>
            <option value="officer_approved">Officer Approved</option>
            <option value="officer_rejected">Officer Rejected</option>
            <option value="officer_suspended">Officer Suspended</option>
            <option value="officer_reactivated">Officer Reactivated</option>
            <option value="officer_college_reassigned">Officer College Reassigned</option>
            <option value="college_created">College Created</option>
            <option value="college_updated">College Updated</option>
            <option value="drive_created_by_admin">Drive Created</option>
            <option value="drive_updated_by_admin">Drive Updated</option>
            <option value="drive_closed_by_admin">Drive Closed</option>
            <option value="application_status_updated_by_admin">Application Status Updated</option>
            <option value="student_college_assigned">Student College Assigned</option>
          </select>

          <select
            value={targetTypeFilter}
            onChange={e => setTargetTypeFilter(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
          >
            <option value="">All Target Types</option>
            <option value="officer">Officer</option>
            <option value="college">College</option>
            <option value="placement_drive">Placement Drive</option>
            <option value="application">Application</option>
            <option value="student">Student</option>
          </select>
        </div>

        <span className="text-xs text-[var(--text-muted)]">
          Showing <strong>{logs.length}</strong> of <strong>{total}</strong> audit entries
        </span>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Audit Log Table */}
      {loading && logs.length === 0 ? (
        <div className="py-20 text-center">
          <RefreshCw size={24} className="animate-spin text-[var(--accent-from)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">Loading security log stream...</p>
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <ScrollText size={36} className="text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">No Audit Records Found</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            No audit records match the applied filters.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {logs.map(log => {
            const isExpanded = expandedLogId === log.id
            return (
              <Card
                key={log.id}
                className="p-4 transition-all hover:border-[var(--accent-from)]/40 cursor-pointer"
                onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 text-[var(--text-secondary)]">
                      <ShieldCheck size={16} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={getActionBadgeColor(log.action)} className="text-[10px] font-black">
                          {formatAction(log.action)}
                        </Badge>
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                          Target: {log.target_type} {log.target_id ? `(${log.target_id.slice(0, 8)}...)` : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] flex-wrap">
                        <span className="flex items-center gap-1">
                          <User size={11} />
                          Actor: {log.actor_role} ({log.actor_id ? log.actor_id.slice(0, 8) : 'System'})
                        </span>
                        {log.ip_address && (
                          <span className="flex items-center gap-1 font-mono">
                            <Globe size={11} />
                            IP: {log.ip_address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
                    <span className="text-xs text-[var(--text-muted)] font-mono">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                    <button className="text-[var(--text-muted)]">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Metadata */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-[var(--border)]">
                    <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                      Event Metadata (JSON):
                    </p>
                    <pre className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] overflow-x-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
