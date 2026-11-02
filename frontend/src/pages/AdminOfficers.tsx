import { useState, useEffect } from 'react'
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Mail,
  Phone,
  ShieldCheck,
  Ban,
  RotateCcw,
  RefreshCw,
  X,
} from 'lucide-react'
import { Card, Button, Input, Badge } from '../components/ui'
import {
  listAdminOfficers,
  approveAdminOfficer,
  rejectAdminOfficer,
  suspendAdminOfficer,
  reactivateAdminOfficer,
  assignAdminOfficerCollege,
  listAdminColleges,
  type AdminOfficer,
  type AdminCollege,
} from '../lib/adminApi'
import { useAuth } from '../lib/auth'

export default function AdminOfficers() {
  const { session } = useAuth()
  const token = session?.access_token

  const [officers, setOfficers] = useState<AdminOfficer[]>([])
  const [colleges, setColleges] = useState<AdminCollege[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'suspended' | 'rejected' | 'all'>('pending')
  const [search, setSearch] = useState('')

  // Action Modals State
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Approve Modal
  const [approvingOfficer, setApprovingOfficer] = useState<AdminOfficer | null>(null)
  const [selectedCollegeId, setSelectedCollegeId] = useState('')

  // Reject Modal
  const [rejectingOfficer, setRejectingOfficer] = useState<AdminOfficer | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Suspend Modal
  const [suspendingOfficer, setSuspendingOfficer] = useState<AdminOfficer | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  // Reassign College Modal
  const [reassigningOfficer, setReassigningOfficer] = useState<AdminOfficer | null>(null)
  const [targetCollegeId, setTargetCollegeId] = useState('')

  const loadData = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [officersData, collegesData] = await Promise.all([
        listAdminOfficers(token),
        listAdminColleges(token),
      ])
      setOfficers(officersData)
      setColleges(collegesData)
    } catch (err: unknown) {
      console.error('[AdminOfficers] Load failed:', err)
      setError('Failed to load placement officers from backend.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [token])

  // Handle Approve
  const handleApprove = async () => {
    if (!token || !approvingOfficer) return
    setActionLoading(true)
    setActionError(null)
    try {
      await approveAdminOfficer(token, approvingOfficer.id, {
        collegeId: selectedCollegeId || approvingOfficer.college_id || undefined,
      })
      setApprovingOfficer(null)
      await loadData()
    } catch (err: unknown) {
      console.error('[AdminOfficers] Approval failed:', err)
      setActionError(err instanceof Error ? err.message : 'Failed to approve officer')
    } finally {
      setActionLoading(false)
    }
  }

  // Handle Reject
  const handleReject = async () => {
    if (!token || !rejectingOfficer) return
    setActionLoading(true)
    setActionError(null)
    try {
      await rejectAdminOfficer(token, rejectingOfficer.id, rejectReason.trim() || 'Application rejected by Super Admin')
      setRejectingOfficer(null)
      setRejectReason('')
      await loadData()
    } catch (err: unknown) {
      console.error('[AdminOfficers] Rejection failed:', err)
      setActionError(err instanceof Error ? err.message : 'Failed to reject officer')
    } finally {
      setActionLoading(false)
    }
  }

  // Handle Suspend
  const handleSuspend = async () => {
    if (!token || !suspendingOfficer) return
    setActionLoading(true)
    setActionError(null)
    try {
      await suspendAdminOfficer(token, suspendingOfficer.id, suspendReason.trim() || 'Account suspended by administrator')
      setSuspendingOfficer(null)
      setSuspendReason('')
      await loadData()
    } catch (err: unknown) {
      console.error('[AdminOfficers] Suspension failed:', err)
      setActionError(err instanceof Error ? err.message : 'Failed to suspend officer')
    } finally {
      setActionLoading(false)
    }
  }

  // Handle Reactivate
  const handleReactivate = async (officerId: string) => {
    if (!token) return
    setLoading(true)
    try {
      await reactivateAdminOfficer(token, officerId)
      await loadData()
    } catch (err: unknown) {
      console.error('[AdminOfficers] Reactivation failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to reactivate officer')
    } finally {
      setLoading(false)
    }
  }

  // Handle Reassign College
  const handleReassign = async () => {
    if (!token || !reassigningOfficer || !targetCollegeId) return
    setActionLoading(true)
    setActionError(null)
    try {
      await assignAdminOfficerCollege(token, reassigningOfficer.id, targetCollegeId)
      setReassigningOfficer(null)
      setTargetCollegeId('')
      await loadData()
    } catch (err: unknown) {
      console.error('[AdminOfficers] Reassignment failed:', err)
      setActionError(err instanceof Error ? err.message : 'Failed to reassign college')
    } finally {
      setActionLoading(false)
    }
  }

  // Filter officers
  const filtered = officers.filter(o => {
    const matchesTab = activeTab === 'all' ? true : o.approval_status === activeTab
    const matchesSearch =
      (o.full_name && o.full_name.toLowerCase().includes(search.toLowerCase())) ||
      (o.email && o.email.toLowerCase().includes(search.toLowerCase())) ||
      (o.collegeName && o.collegeName.toLowerCase().includes(search.toLowerCase())) ||
      (o.designation && o.designation.toLowerCase().includes(search.toLowerCase()))
    return matchesTab && matchesSearch
  })

  const pendingCount = officers.filter(o => o.approval_status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">
            Placement Officer Management
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Review registration applications, assign colleges, and manage institutional coordinator credentials.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Tabs and Search Bar */}
      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'pending' as const, label: 'Pending Approvals', badge: pendingCount },
            { id: 'approved' as const, label: 'Approved' },
            { id: 'suspended' as const, label: 'Suspended' },
            { id: 'rejected' as const, label: 'Rejected' },
            { id: 'all' as const, label: 'All Records' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[var(--accent-from)] text-white'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]'
              }`}
            >
              <span>{tab.label}</span>
              {Boolean(tab.badge && tab.badge > 0) && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    activeTab === tab.id ? 'bg-white text-purple-700' : 'bg-amber-500 text-white'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="w-full md:w-72">
          <Input
            placeholder="Search officers or colleges..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftIcon={<Search size={14} />}
          />
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Officers List */}
      {loading && officers.length === 0 ? (
        <div className="py-20 text-center">
          <RefreshCw size={24} className="animate-spin text-[var(--accent-from)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">Loading placement officers...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Users size={36} className="text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">No Placement Officers Found</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            {activeTab === 'pending'
              ? 'There are no officer registration requests awaiting review.'
              : 'No officer records match the selected filter.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(officer => {
            const isPending = officer.approval_status === 'pending'
            const isApproved = officer.approval_status === 'approved'
            const isSuspended = officer.approval_status === 'suspended'
            const isRejected = officer.approval_status === 'rejected'

            return (
              <Card key={officer.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Officer Info */}
                <div className="flex items-start gap-4 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0 ${
                      isApproved
                        ? 'bg-emerald-500'
                        : isPending
                        ? 'bg-amber-500'
                        : isSuspended
                        ? 'bg-rose-500'
                        : 'bg-red-500'
                    }`}
                  >
                    {officer.full_name?.charAt(0).toUpperCase() || 'O'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-base font-bold text-[var(--text-primary)] truncate">
                        {officer.full_name || 'Unnamed Officer'}
                      </h3>
                      <Badge
                        variant={
                          isApproved ? 'success' : isPending ? 'warning' : isSuspended ? 'default' : 'error'
                        }
                      >
                        {officer.approval_status.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] flex-wrap">
                      <span className="flex items-center gap-1">
                        <Mail size={13} className="text-[var(--text-muted)]" />
                        {officer.email}
                      </span>
                      {officer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={13} className="text-[var(--text-muted)]" />
                          {officer.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-semibold text-[var(--text-primary)]">
                        <Building2 size={13} className="text-[var(--accent-from)]" />
                        {officer.collegeName || 'Unassigned College'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] mt-1.5 flex-wrap">
                      {officer.designation && <span>Designation: {officer.designation}</span>}
                      {officer.department && <span>• Dept: {officer.department}</span>}
                      <span>• Registered: {new Date(officer.created_at).toLocaleDateString()}</span>
                    </div>

                    {officer.rejection_reason && (
                      <div className="mt-2 text-xs text-red-500 bg-red-500/10 px-2.5 py-1 rounded-md border border-red-500/20">
                        <strong>Reason:</strong> {officer.rejection_reason}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                  {isPending && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setApprovingOfficer(officer)
                          setSelectedCollegeId(officer.college_id || '')
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                      >
                        <CheckCircle2 size={14} /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setRejectingOfficer(officer)
                          setRejectReason('')
                        }}
                      >
                        <XCircle size={14} /> Reject
                      </Button>
                    </>
                  )}

                  {isApproved && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setReassigningOfficer(officer)
                          setTargetCollegeId(officer.college_id || '')
                        }}
                      >
                        Change College
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setSuspendingOfficer(officer)
                          setSuspendReason('')
                        }}
                      >
                        <Ban size={14} /> Suspend
                      </Button>
                    </>
                  )}

                  {isSuspended && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleReactivate(officer.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <RotateCcw size={14} /> Reactivate
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setReassigningOfficer(officer)
                          setTargetCollegeId(officer.college_id || '')
                        }}
                      >
                        Change College
                      </Button>
                    </>
                  )}

                  {isRejected && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setApprovingOfficer(officer)
                        setSelectedCollegeId(officer.college_id || '')
                      }}
                    >
                      Re-evaluate & Approve
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Approve Officer Modal */}
      {approvingOfficer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 relative">
            <button
              onClick={() => setApprovingOfficer(null)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
              <ShieldCheck size={22} />
            </div>

            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">
              Approve Placement Officer
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Confirm authorization and institution assignment for <strong>{approvingOfficer.full_name}</strong> ({approvingOfficer.email}).
            </p>

            {actionError && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {actionError}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  Assigned Institution
                </label>
                <select
                  value={selectedCollegeId}
                  onChange={e => setSelectedCollegeId(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-from)] cursor-pointer"
                >
                  <option value="">-- Select Partner College --</option>
                  {colleges.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 text-amber-600 text-xs leading-relaxed">
                Approved placement officers will gain access to campus job postings and candidate lists for this college only.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setApprovingOfficer(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleApprove}
                  loading={actionLoading}
                  disabled={actionLoading || !selectedCollegeId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Confirm Approval
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Reject Officer Modal */}
      {rejectingOfficer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 relative">
            <button
              onClick={() => setRejectingOfficer(null)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center mb-3">
              <XCircle size={22} />
            </div>

            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">
              Reject Officer Application
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Specify the reason for rejecting <strong>{rejectingOfficer.full_name}</strong>. This reason will be recorded in audit logs and shown to the applicant.
            </p>

            {actionError && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {actionError}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  Rejection Reason
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Official institutional credentials could not be verified."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 text-sm text-[var(--text-primary)] outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setRejectingOfficer(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleReject}
                  loading={actionLoading}
                  disabled={actionLoading}
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Suspend Officer Modal */}
      {suspendingOfficer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 relative">
            <button
              onClick={() => setSuspendingOfficer(null)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
              <Ban size={22} />
            </div>

            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">
              Suspend Officer Account
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Suspending <strong>{suspendingOfficer.full_name}</strong> will instantly revoke their access to placement management APIs.
            </p>

            {actionError && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {actionError}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  Suspension Reason
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Account suspended pending institutional review."
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 text-sm text-[var(--text-primary)] outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setSuspendingOfficer(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleSuspend}
                  loading={actionLoading}
                  disabled={actionLoading}
                >
                  Confirm Suspension
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Reassign College Modal */}
      {reassigningOfficer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 relative">
            <button
              onClick={() => setReassigningOfficer(null)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">
              Reassign Officer Institution
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Select the new college for <strong>{reassigningOfficer.full_name}</strong>. Their data scope will instantly update.
            </p>

            {actionError && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {actionError}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  New College
                </label>
                <select
                  value={targetCollegeId}
                  onChange={e => setTargetCollegeId(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-from)] cursor-pointer"
                >
                  <option value="">-- Select College --</option>
                  {colleges.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setReassigningOfficer(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleReassign}
                  loading={actionLoading}
                  disabled={actionLoading || !targetCollegeId}
                >
                  Save Assignment
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
