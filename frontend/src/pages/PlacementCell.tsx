import { useState, useEffect } from 'react'
import {
  Building2, Briefcase, Info, Users, ArrowRight, Loader2, AlertTriangle,
  CheckCircle2, XCircle, Search, RefreshCw, GraduationCap, ShieldCheck,
} from 'lucide-react'
import { Card, Badge, StatCard, Button, Input } from '../components/ui'
import { type CampusApplicationWithJob, type CampusJob } from '../data/campusJobs'
import { useAuth } from '../lib/auth'
import { API_BASE_URL } from '../lib/api'
import { PRESENTATION_TOKEN, DEMO_STUDENTS } from '../lib/presentationMode'

interface PlacementCellProps {
  jobs: CampusJob[]
  applications: CampusApplicationWithJob[]
  loading: boolean
  error: string | null
  collegeName: string
  profileIncomplete: boolean
  onOpenProfile: () => void
  onOpenJobPosting: () => void
}

interface CollegeStudent {
  id: string
  email: string
  full_name: string | null
  branch: string | null
  grad_year: string | null
  roll_number: string | null
  college_verification_status: 'pending' | 'verified' | 'rejected'
  college_verification_reason: string | null
  verified_at: string | null
  created_at: string
}

export default function PlacementCell({
  jobs, applications, loading, error, collegeName,
  profileIncomplete, onOpenProfile, onOpenJobPosting,
}: PlacementCellProps) {
  const { session } = useAuth()
  const token = session?.access_token

  const [students, setStudents] = useState<CollegeStudent[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState<string | null>(null)
  const [studentFilter, setStudentFilter] = useState<'pending' | 'verified' | 'rejected' | 'all'>('pending')
  const [studentSearch, setStudentSearch] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  // `jobs` already contains only this officer's college (enforced by the API and
  // RLS), so counts and listings are scoped without a client-side filter.
  const publishedCount = jobs.filter(j => j.status === 'published').length

  const loadStudents = async () => {
    if (!token) return
    setStudentsLoading(true)
    setStudentsError(null)

    if (token === PRESENTATION_TOKEN) {
      setStudents(
        DEMO_STUDENTS.map(s => ({
          id: s.id,
          email: s.email,
          full_name: s.full_name,
          branch: s.branch,
          grad_year: s.grad_year,
          roll_number: s.roll_number ?? null,
          college_verification_status: s.college_verification_status || 'pending',
          college_verification_reason: s.college_verification_reason ?? null,
          verified_at: s.verified_at ?? null,
          created_at: s.created_at,
        })),
      )
      setStudentsLoading(false)
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/students`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to load college students')
      }
      const data = await res.json()
      setStudents(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      console.error('[PlacementCell] loadStudents error:', err)
      setStudentsError(err instanceof Error ? err.message : 'Could not load students directory')
    } finally {
      setStudentsLoading(false)
    }
  }

  useEffect(() => {
    loadStudents()
  }, [token])

  const handleVerify = async (studentId: string) => {
    if (!token) return
    setActionLoadingId(studentId)

    if (token === PRESENTATION_TOKEN) {
      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? { ...s, college_verification_status: 'verified', verified_at: new Date().toISOString() }
            : s,
        ),
      )
      setActionLoadingId(null)
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/students/${encodeURIComponent(studentId)}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to verify student')
      }
      await loadStudents()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to verify student enrollment')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleReject = async (studentId: string) => {
    if (!token) return
    const reason = prompt('Please specify a rejection reason (e.g. Roll number not found):')
    if (reason === null) return
    setActionLoadingId(studentId)

    if (token === PRESENTATION_TOKEN) {
      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? {
                ...s,
                college_verification_status: 'rejected',
                college_verification_reason: reason.trim() || 'Roll number not matched',
              }
            : s,
        ),
      )
      setActionLoadingId(null)
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/students/${encodeURIComponent(studentId)}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to reject verification')
      }
      await loadStudents()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reject student')
    } finally {
      setActionLoadingId(null)
    }
  }

  const pendingCount = students.filter(s => (s.college_verification_status || 'pending') === 'pending').length
  const verifiedCount = students.filter(s => s.college_verification_status === 'verified').length

  const filteredStudents = students.filter(s => {
    const status = s.college_verification_status || 'pending'
    const matchesStatus = studentFilter === 'all' ? true : status === studentFilter
    const q = studentSearch.trim().toLowerCase()
    const matchesSearch = q === '' ||
      (s.full_name && s.full_name.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
      (s.branch && s.branch.toLowerCase().includes(q))
    return matchesStatus && matchesSearch
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Placement Cell</h1>
            <Badge variant="info">{collegeName}</Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Placement-officer dashboard for managing your college's campus job postings and student verifications.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={onOpenJobPosting}>
            <Briefcase size={15} /> Manage Job Postings
          </Button>
        </div>
      </div>

      {profileIncomplete && (
        <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <Info size={15} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Your officer profile isn't complete</p>
              <p className="text-xs text-[var(--text-muted)]">Add your details to finish your profile. Your changes are saved to your account.</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={onOpenProfile}>Complete Profile</Button>
        </Card>
      )}

      <div className="flex items-start gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)]">
        <Building2 size={15} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Campus drives and student verification are strictly isolated to your assigned college ({collegeName}). In-Campus jobs are visible and accessible only to verified students of your institution.
        </p>
      </div>

      {error && (
        <Card className="p-4 flex items-start gap-3 border-red-500/20">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</p>
        </Card>
      )}

      {/* Overview metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Postings" value={`${jobs.length}`} sub="For your college" icon={<Briefcase size={16} />} />
        <StatCard label="Published Drives" value={`${publishedCount}`} sub="Visible to students" icon={<Briefcase size={16} />} color="#10b981" />
        <StatCard label="Pending Verifications" value={`${pendingCount}`} sub="Awaiting verification" icon={<Users size={16} />} color="#f59e0b" />
        <StatCard label="Verified Students" value={`${verifiedCount}`} sub="Eligible for campus drives" icon={<ShieldCheck size={16} />} color="#3b82f6" />
      </div>

      {/* Student Enrollment Verification Card */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <GraduationCap size={18} className="text-[var(--accent-from)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Student College Verification</h2>
              <p className="text-xs text-[var(--text-secondary)]">Verify enrolled students so they can access and apply to In-Campus drives.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Badge variant="warning">{pendingCount} Pending</Badge>
            )}
            <Button variant="secondary" size="sm" onClick={loadStudents} disabled={studentsLoading}>
              <RefreshCw size={13} className={studentsLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters and search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            {(['pending', 'verified', 'rejected', 'all'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStudentFilter(tab)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors capitalize ${
                  studentFilter === tab
                    ? 'bg-[var(--accent-from)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab === 'all' ? 'All Students' : tab}
              </button>
            ))}
          </div>
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search name, roll no, branch..."
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              leftIcon={<Search size={14} />}
            />
          </div>
        </div>

        {studentsError && (
          <div className="p-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg">
            {studentsError}
          </div>
        )}

        {studentsLoading && students.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-secondary)] flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-[var(--accent-from)]" /> Loading student verification list...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-10 text-center">
            <Users size={32} className="text-[var(--text-muted)] mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">No students found</p>
            <p className="text-xs text-[var(--text-secondary)]">No student records match the selected filter ({studentFilter}).</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface)] border-b border-[var(--border)] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Branch / Year</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredStudents.map(student => {
                  const status = student.college_verification_status || 'pending'
                  const isActionLoading = actionLoadingId === student.id
                  return (
                    <tr key={student.id} className="hover:bg-[var(--surface)]/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[var(--text-primary)]">{student.full_name || 'Unnamed Candidate'}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{student.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-[var(--text-primary)] bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--border)]">
                          {student.roll_number || 'Not Provided'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        <div>{student.branch || 'Not Set'}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">Grad: {student.grad_year || 'Not Set'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            status === 'verified'
                              ? 'info'
                              : status === 'rejected'
                              ? 'error'
                              : 'warning'
                          }
                        >
                          {status === 'verified'
                            ? 'Verified'
                            : status === 'rejected'
                            ? 'Rejected'
                            : 'Pending'}
                        </Badge>
                        {status === 'rejected' && student.college_verification_reason && (
                          <div className="text-[10px] text-red-500 mt-0.5 max-w-xs truncate" title={student.college_verification_reason}>
                            {student.college_verification_reason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        {status !== 'verified' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleVerify(student.id)}
                            disabled={isActionLoading}
                            className="py-1 px-2.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                          >
                            <CheckCircle2 size={13} /> Verify
                          </Button>
                        )}
                        {status !== 'rejected' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleReject(student.id)}
                            disabled={isActionLoading}
                            className="py-1 px-2.5 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                          >
                            <XCircle size={13} /> Reject
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Campus job postings summary */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Briefcase size={15} className="text-[var(--accent-from)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Campus Job Postings</p>
          </div>
          {applications.length > 0 && <Badge variant="info">{applications.length} application(s)</Badge>}
        </div>

        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
            <Loader2 size={15} className="animate-spin text-[var(--accent-from)]" /> Loading your postings…
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 py-8">
            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
              <Briefcase size={22} className="text-[var(--accent-from)]" />
            </div>
            <h3 className="font-extrabold text-[var(--text-primary)]">No campus jobs posted yet</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">Post an In-Campus or Off-Campus drive for {collegeName} from the Job Posting page to make it visible to your students in the Job Portal.</p>
            <Button size="sm" onClick={onOpenJobPosting}><Briefcase size={13} /> Go to Job Posting</Button>
          </div>
        ) : (
          <div className="flex items-center justify-end">
            <Button variant="secondary" size="sm" onClick={onOpenJobPosting}>
              <Briefcase size={13} /> Manage Job Postings <ArrowRight size={12} />
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
