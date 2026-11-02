import { useState, useEffect } from 'react'
import {
  GraduationCap,
  Search,
  Mail,
  Eye,
  RefreshCw,
  AlertTriangle,
  X,
  Award,
  Briefcase,
} from 'lucide-react'
import { Card, Button, Input, Badge } from '../components/ui'
import {
  listAdminStudents,
  getAdminStudentDetails,
  updateAdminStudentCollege,
  listAdminColleges,
  type AdminStudent,
  type AdminStudentDetails,
  type AdminCollege,
} from '../lib/adminApi'
import { useAuth } from '../lib/auth'

export default function AdminStudents() {
  const { session } = useAuth()
  const token = session?.access_token

  const [students, setStudents] = useState<AdminStudent[]>([])
  const [colleges, setColleges] = useState<AdminCollege[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [selectedCollegeFilter, setSelectedCollegeFilter] = useState('')
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('')

  // Student Details Modal
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [studentDetails, setStudentDetails] = useState<AdminStudentDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // College Update in Modal
  const [reassignCollegeId, setReassignCollegeId] = useState('')
  const [reassignLoading, setReassignLoading] = useState(false)

  const loadData = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [studentsData, collegesData] = await Promise.all([
        listAdminStudents(token),
        listAdminColleges(token),
      ])
      setStudents(studentsData)
      setColleges(collegesData)
    } catch (err: unknown) {
      console.error('[AdminStudents] Load failed:', err)
      setError('Failed to load students directory from backend.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [token])

  // Load individual student details
  const openDetails = async (id: string) => {
    if (!token) return
    setSelectedStudentId(id)
    setDetailsLoading(true)
    setDetailsError(null)
    try {
      const details = await getAdminStudentDetails(token, id)
      setStudentDetails(details)
      setReassignCollegeId(details.profile.college_id || '')
    } catch (err: unknown) {
      console.error('[AdminStudents] Load details failed:', err)
      setDetailsError('Failed to load student placement history.')
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleUpdateCollege = async () => {
    if (!token || !selectedStudentId) return
    setReassignLoading(true)
    try {
      await updateAdminStudentCollege(token, selectedStudentId, reassignCollegeId || null)
      await openDetails(selectedStudentId)
      await loadData()
    } catch (err: unknown) {
      console.error('[AdminStudents] College reassignment failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to update student college')
    } finally {
      setReassignLoading(false)
    }
  }

  // Derive distinct branches from loaded students
  const branches = Array.from(new Set(students.map(s => s.branch).filter(Boolean))) as string[]

  // Filter students
  const filtered = students.filter(s => {
    const matchesSearch =
      (s.full_name && s.full_name.toLowerCase().includes(search.toLowerCase())) ||
      (s.email && s.email.toLowerCase().includes(search.toLowerCase())) ||
      (s.collegeName && s.collegeName.toLowerCase().includes(search.toLowerCase()))
    const matchesCollege = selectedCollegeFilter ? s.college_id === selectedCollegeFilter : true
    const matchesBranch = selectedBranchFilter ? s.branch === selectedBranchFilter : true
    return matchesSearch && matchesCollege && matchesBranch
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">Student Management</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Explore registered candidates, inspect placement application records, and manage institutional membership.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          placeholder="Search by name, email or college..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          leftIcon={<Search size={14} />}
        />

        <select
          value={selectedCollegeFilter}
          onChange={e => setSelectedCollegeFilter(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-from)] cursor-pointer"
        >
          <option value="">All Colleges</option>
          {colleges.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={selectedBranchFilter}
          onChange={e => setSelectedBranchFilter(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-from)] cursor-pointer"
        >
          <option value="">All Branches</option>
          {branches.map(b => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Student List */}
      {loading && students.length === 0 ? (
        <div className="py-20 text-center">
          <RefreshCw size={24} className="animate-spin text-[var(--accent-from)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">Loading students...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <GraduationCap size={36} className="text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">No Students Found</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            No students match your filter criteria.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(student => (
            <Card key={student.id} className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0">
                    {student.full_name?.charAt(0).toUpperCase() || 'S'}
                  </div>
                  <Badge variant="default">
                    {student.applicationCount ?? 0} Applications
                  </Badge>
                </div>

                <h3 className="text-base font-bold text-[var(--text-primary)] mb-1 truncate" title={student.full_name || student.email}>
                  {student.full_name || 'Anonymous Student'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mb-3 flex items-center gap-1.5 truncate">
                  <Mail size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                  {student.email}
                </p>

                <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-1.5 text-xs text-[var(--text-secondary)] mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">College:</span>
                    <span className="font-semibold text-[var(--text-primary)] truncate max-w-[170px]" title={student.collegeName}>
                      {student.collegeName || 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Branch:</span>
                    <span className="font-medium text-[var(--text-primary)]">{student.branch || 'Not Set'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Graduation:</span>
                    <span className="font-medium text-[var(--text-primary)]">{student.grad_year || 'Not Set'}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Joined {new Date(student.created_at).toLocaleDateString()}</span>
                <Button size="sm" variant="ghost" onClick={() => openDetails(student.id)} className="p-1.5 h-auto text-[var(--accent-from)]">
                  <Eye size={13} /> View Profile
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Student Details Modal */}
      {selectedStudentId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => {
                setSelectedStudentId(null)
                setStudentDetails(null)
              }}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            {detailsLoading || !studentDetails ? (
              <div className="py-16 text-center">
                <RefreshCw size={24} className="animate-spin text-[var(--accent-from)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-secondary)]">Loading candidate profile & placement history...</p>
              </div>
            ) : detailsError ? (
              <div className="p-4 text-center text-red-500 text-sm">{detailsError}</div>
            ) : (
              <div className="space-y-6">
                {/* Profile Header */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-extrabold text-xl">
                    {studentDetails.profile.full_name?.charAt(0).toUpperCase() || 'S'}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">
                      {studentDetails.profile.full_name || 'Unnamed Student'}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] flex items-center gap-2 mt-0.5">
                      <span>{studentDetails.profile.email}</span>
                      {studentDetails.profile.phone && <span>• {studentDetails.profile.phone}</span>}
                    </p>
                  </div>
                </div>

                {/* College Management */}
                <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2.5">
                    Institution Assignment
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={reassignCollegeId}
                      onChange={e => setReassignCollegeId(e.target.value)}
                      className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                    >
                      <option value="">-- No College (Unassigned) --</option>
                      {colleges.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={handleUpdateCollege}
                      loading={reassignLoading}
                      disabled={reassignLoading || reassignCollegeId === (studentDetails.profile.college_id || '')}
                    >
                      Update Assignment
                    </Button>
                  </div>
                </div>

                {/* Placement Applications History */}
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <Briefcase size={16} className="text-[var(--accent-from)]" />
                    Campus Placement Applications ({studentDetails.applications.length})
                  </h3>

                  {studentDetails.applications.length === 0 ? (
                    <div className="p-4 text-center rounded-lg border border-dashed text-xs text-[var(--text-muted)]">
                      Candidate has not submitted any campus placement applications yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {studentDetails.applications.map(app => (
                        <div
                          key={app.id}
                          className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-bold text-[var(--text-primary)]">
                              {app.campus_jobs?.company || 'Drive Position'} — {app.campus_jobs?.title}
                            </p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              {app.campus_jobs?.job_type} • Package: {app.campus_jobs?.package || 'N/A'} • Applied {new Date(app.applied_at).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge
                            variant={
                              app.status === 'Shortlisted'
                                ? 'success'
                                : app.status === 'Under Review'
                                ? 'warning'
                                : app.status === 'Rejected'
                                ? 'error'
                                : 'default'
                            }
                          >
                            {app.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Mock Interviews Summary */}
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <Award size={16} className="text-purple-500" />
                    AI Mock Interview Assessments ({studentDetails.interviews.length})
                  </h3>

                  {studentDetails.interviews.length === 0 ? (
                    <div className="p-4 text-center rounded-lg border border-dashed text-xs text-[var(--text-muted)]">
                      Candidate has not completed any AI mock interviews yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {studentDetails.interviews.map(inv => (
                        <div
                          key={inv.id}
                          className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-bold text-[var(--text-primary)] capitalize">
                              {inv.interview_type} Interview Session
                            </p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              Status: {inv.status} • {new Date(inv.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="font-mono font-bold text-sm text-[var(--accent-from)]">
                            {inv.overall_score !== null ? `${inv.overall_score}%` : 'N/A'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
