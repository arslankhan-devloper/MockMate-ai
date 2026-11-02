import { useState, useEffect } from 'react'
import {
  Briefcase,
  Plus,
  Search,
  Users,
  AlertTriangle,
  RefreshCw,
  X,
  Lock,
} from 'lucide-react'
import { Card, Button, Input, Badge } from '../components/ui'
import {
  listAdminDrives,
  createAdminDrive,
  closeAdminDrive,
  listAdminDriveApplications,
  updateAdminApplicationStatus,
  listAdminColleges,
  type AdminDrive,
  type AdminApplication,
  type AdminCollege,
} from '../lib/adminApi'
import { useAuth } from '../lib/auth'

export default function AdminDrives() {
  const { session } = useAuth()
  const token = session?.access_token

  const [drives, setDrives] = useState<AdminDrive[]>([])
  const [colleges, setColleges] = useState<AdminCollege[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [collegeFilter, setCollegeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'closed'>('all')

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    collegeId: '',
    company: '',
    title: '',
    description: '',
    jobType: 'In-Campus' as 'In-Campus' | 'Off-Campus',
    eligibility: '',
    branchesText: '',
    minCgpa: 0,
    allowedBacklogs: 0,
    package: '',
    location: '',
    applicationDeadline: '',
    driveDate: '',
    status: 'published' as 'published' | 'draft',
    applicationLink: '',
    linkLabel: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Applications Drawer
  const [selectedDriveForApps, setSelectedDriveForApps] = useState<AdminDrive | null>(null)
  const [applications, setApplications] = useState<AdminApplication[]>([])
  const [appsLoading, setAppsLoading] = useState(false)
  const [appsError, setAppsError] = useState<string | null>(null)

  const loadData = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [drivesData, collegesData] = await Promise.all([
        listAdminDrives(token),
        listAdminColleges(token),
      ])
      setDrives(drivesData)
      setColleges(collegesData)
    } catch (err: unknown) {
      console.error('[AdminDrives] Load failed:', err)
      setError('Failed to load placement drives.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [token])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (!formData.collegeId || !formData.company.trim() || !formData.title.trim()) {
      setFormError('Please select a college and provide company and position title.')
      return
    }

    setFormLoading(true)
    setFormError(null)
    try {
      const branches = formData.branchesText
        ? formData.branchesText.split(',').map(b => b.trim()).filter(Boolean)
        : []

      await createAdminDrive(token, {
        collegeId: formData.collegeId,
        company: formData.company.trim(),
        title: formData.title.trim(),
        description: formData.description.trim(),
        jobType: formData.jobType,
        eligibility: formData.eligibility.trim(),
        branches,
        minCgpa: Number(formData.minCgpa),
        allowedBacklogs: Number(formData.allowedBacklogs),
        package: formData.package.trim(),
        location: formData.location.trim(),
        applicationDeadline: formData.applicationDeadline || null,
        driveDate: formData.driveDate || null,
        driveTime: null,
        driveVenue: null,
        applicationLink: formData.applicationLink.trim() || null,
        linkLabel: formData.linkLabel.trim() || null,
        status: formData.status,
      })

      setShowCreateModal(false)
      setFormData({
        collegeId: '',
        company: '',
        title: '',
        description: '',
        jobType: 'In-Campus',
        eligibility: '',
        branchesText: '',
        minCgpa: 0,
        allowedBacklogs: 0,
        package: '',
        location: '',
        applicationDeadline: '',
        driveDate: '',
        status: 'published',
        applicationLink: '',
        linkLabel: '',
      })
      await loadData()
    } catch (err: unknown) {
      console.error('[AdminDrives] Create failed:', err)
      setFormError(err instanceof Error ? err.message : 'Failed to create drive')
    } finally {
      setFormLoading(false)
    }
  }

  const handleCloseDrive = async (driveId: string) => {
    if (!token) return
    if (!confirm('Are you sure you want to close this placement drive? Students will no longer be able to submit applications.')) {
      return
    }
    setLoading(true)
    try {
      await closeAdminDrive(token, driveId)
      await loadData()
    } catch (err: unknown) {
      console.error('[AdminDrives] Close failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to close drive')
    } finally {
      setLoading(false)
    }
  }

  const openApplications = async (drive: AdminDrive) => {
    if (!token) return
    setSelectedDriveForApps(drive)
    setAppsLoading(true)
    setAppsError(null)
    try {
      const data = await listAdminDriveApplications(token, drive.id)
      setApplications(data)
    } catch (err: unknown) {
      console.error('[AdminDrives] Load apps failed:', err)
      setAppsError('Failed to load applications for this drive.')
    } finally {
      setAppsLoading(false)
    }
  }

  const handleStatusChange = async (appId: string, newStatus: 'Applied' | 'Under Review' | 'Shortlisted' | 'Rejected') => {
    if (!token || !selectedDriveForApps) return
    try {
      await updateAdminApplicationStatus(token, selectedDriveForApps.id, appId, newStatus)
      setApplications(prev =>
        prev.map(a => (a.id === appId ? { ...a, status: newStatus } : a)),
      )
    } catch (err: unknown) {
      console.error('[AdminDrives] Update app status failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to update application status')
    }
  }

  // Filter drives
  const filtered = drives.filter(d => {
    const matchesSearch =
      d.company.toLowerCase().includes(search.toLowerCase()) ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.collegeName && d.collegeName.toLowerCase().includes(search.toLowerCase()))
    const matchesCollege = collegeFilter ? d.college_id === collegeFilter : true
    const matchesStatus = statusFilter === 'all' ? true : d.status === statusFilter
    return matchesSearch && matchesCollege && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">Placement Drive Management</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Create, publish and oversee on-campus recruitment campaigns and applicant pipelines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} /> Create Drive
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="w-full md:w-72">
          <Input
            placeholder="Search company, title, college..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftIcon={<Search size={14} />}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <select
            value={collegeFilter}
            onChange={e => setCollegeFilter(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
          >
            <option value="">All Colleges</option>
            {colleges.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {(['all', 'published', 'draft', 'closed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors cursor-pointer ${
                  statusFilter === s
                    ? 'bg-[var(--accent-from)] text-white'
                    : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Drives Grid */}
      {loading && drives.length === 0 ? (
        <div className="py-20 text-center">
          <RefreshCw size={24} className="animate-spin text-[var(--accent-from)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">Loading placement drives...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Briefcase size={36} className="text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">No Placement Drives Found</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mb-4">
            No recruitment drives match the chosen criteria.
          </p>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} /> Create Drive
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(drive => (
            <Card key={drive.id} className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)] truncate" title={drive.company}>
                      {drive.company}
                    </h3>
                    <p className="text-xs font-semibold text-[var(--accent-from)] truncate">
                      {drive.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant={drive.status === 'published' ? 'success' : drive.status === 'draft' ? 'warning' : 'error'}>
                      {drive.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-1.5 text-xs text-[var(--text-secondary)] mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Institution:</span>
                    <span className="font-semibold text-[var(--text-primary)] truncate max-w-[160px]" title={drive.collegeName}>
                      {drive.collegeName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Type:</span>
                    <Badge variant={drive.job_type === 'In-Campus' ? 'default' : 'info'} className="text-[10px]">
                      {drive.job_type}
                    </Badge>
                  </div>
                  {drive.package && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">Package:</span>
                      <span className="font-bold text-[var(--text-primary)]">{drive.package}</span>
                    </div>
                  )}
                  {drive.location && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">Location:</span>
                      <span>{drive.location}</span>
                    </div>
                  )}
                  {drive.application_deadline && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">Deadline:</span>
                      <span>{new Date(drive.application_deadline).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs">
                <button
                  onClick={() => openApplications(drive)}
                  className="font-bold text-[var(--accent-from)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Users size={13} />
                  {drive.applicationCount ?? 0} Applications
                </button>

                {drive.status !== 'closed' && (
                  <Button size="sm" variant="ghost" onClick={() => handleCloseDrive(drive.id)} className="p-1 h-auto text-red-500 hover:bg-red-500/10">
                    <Lock size={12} /> Close Drive
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Drive Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Create Placement Drive</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-5">
              Provision a recruitment campaign assigned to a partner institution.
            </p>

            {formError && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">Host College *</label>
                  <select
                    required
                    value={formData.collegeId}
                    onChange={e => setFormData(p => ({ ...p, collegeId: e.target.value }))}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  >
                    <option value="">-- Select College --</option>
                    {colleges.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">Drive Type *</label>
                  <select
                    value={formData.jobType}
                    onChange={e => setFormData(p => ({ ...p, jobType: e.target.value as 'In-Campus' | 'Off-Campus' }))}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  >
                    <option value="In-Campus">In-Campus (Assigned College Only)</option>
                    <option value="Off-Campus">Off-Campus (Visible to All)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Company Name *"
                  placeholder="e.g. Google India"
                  required
                  value={formData.company}
                  onChange={e => setFormData(p => ({ ...p, company: e.target.value }))}
                />
                <Input
                  label="Position Title *"
                  placeholder="e.g. Graduate Software Engineer"
                  required
                  value={formData.title}
                  onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Compensation / Package"
                  placeholder="e.g. ₹18 - 24 LPA"
                  value={formData.package}
                  onChange={e => setFormData(p => ({ ...p, package: e.target.value }))}
                />
                <Input
                  label="Work Location"
                  placeholder="e.g. Bangalore / Hybrid"
                  value={formData.location}
                  onChange={e => setFormData(p => ({ ...p, location: e.target.value }))}
                />
                <Input
                  label="Application Deadline"
                  type="date"
                  value={formData.applicationDeadline}
                  onChange={e => setFormData(p => ({ ...p, applicationDeadline: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Eligible Branches (comma separated)"
                  placeholder="CSE, IT, ECE"
                  value={formData.branchesText}
                  onChange={e => setFormData(p => ({ ...p, branchesText: e.target.value }))}
                />
                <Input
                  label="Min CGPA"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={formData.minCgpa}
                  onChange={e => setFormData(p => ({ ...p, minCgpa: Number(e.target.value) }))}
                />
                <Input
                  label="Allowed Backlogs"
                  type="number"
                  min="0"
                  value={formData.allowedBacklogs}
                  onChange={e => setFormData(p => ({ ...p, allowedBacklogs: Number(e.target.value) }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Eligibility Criteria / Details</label>
                <textarea
                  rows={2}
                  placeholder="e.g. B.Tech 2026 batch graduates with 70%+ in 10th/12th."
                  value={formData.eligibility}
                  onChange={e => setFormData(p => ({ ...p, eligibility: e.target.value }))}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-2.5 text-xs text-[var(--text-primary)] outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={formLoading} disabled={formLoading}>
                  Publish Placement Drive
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Drive Applications Drawer / Modal */}
      {selectedDriveForApps && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => {
                setSelectedDriveForApps(null)
                setApplications([])
              }}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-4">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Applications for {selectedDriveForApps.company}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {selectedDriveForApps.title} • {selectedDriveForApps.collegeName}
              </p>
            </div>

            {appsLoading ? (
              <div className="py-12 text-center">
                <RefreshCw size={24} className="animate-spin text-[var(--accent-from)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-secondary)]">Loading applications...</p>
              </div>
            ) : appsError ? (
              <div className="p-4 text-center text-red-500 text-xs">{appsError}</div>
            ) : applications.length === 0 ? (
              <div className="p-8 text-center border border-dashed rounded-lg text-xs text-[var(--text-muted)]">
                No student applications have been received for this drive yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {applications.map(app => (
                  <div
                    key={app.id}
                    className="p-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">
                        {app.student_name || 'Anonymous Applicant'}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Applied {new Date(app.applied_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={app.status}
                        onChange={e => handleStatusChange(app.id, e.target.value as any)}
                        className="bg-[var(--bg)] border border-[var(--border)] rounded px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
                      >
                        <option value="Applied">Applied</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Shortlisted">Shortlisted</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
