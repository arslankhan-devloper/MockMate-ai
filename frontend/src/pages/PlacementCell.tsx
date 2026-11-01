import {
  Building2, Briefcase, Info, Users, SearchX, ArrowRight, Loader2, AlertTriangle,
} from 'lucide-react'
import { Card, Badge, StatCard, Button } from '../components/ui'
import { type CampusApplicationWithJob, type CampusJob } from '../data/campusJobs'

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

export default function PlacementCell({
  jobs, applications, loading, error, collegeName,
  profileIncomplete, onOpenProfile, onOpenJobPosting,
}: PlacementCellProps) {
  // `jobs` already contains only this officer's college (enforced by the API and
  // RLS), so counts and listings are scoped without a client-side filter.
  const publishedCount = jobs.filter(j => j.status === 'published').length
  const draftCount = jobs.filter(j => j.status === 'draft').length
  const closedCount = jobs.filter(j => j.status === 'closed').length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Placement Cell</h1>
            <Badge variant="info">{collegeName}</Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Placement-officer dashboard for managing your college's campus job postings.</p>
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
          Campus drives are stored in your college's account and scoped by the server to your assigned college. In-Campus jobs are shown only to your college's students; Off-Campus jobs are visible to students of every college.
        </p>
      </div>

      {error && (
        <Card className="p-4 flex items-start gap-3 border-red-500/20">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</p>
        </Card>
      )}

      {/* Overview metrics — derived from this college's own job postings */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Postings" value={`${jobs.length}`} sub="For your college" icon={<Briefcase size={16} />} />
        <StatCard label="Published" value={`${publishedCount}`} sub="Visible to students" icon={<Briefcase size={16} />} color="#10b981" />
        <StatCard label="Drafts" value={`${draftCount}`} sub="Not yet published" icon={<Briefcase size={16} />} color="#f59e0b" />
        <StatCard label="Closed" value={`${closedCount}`} sub="No longer accepting" icon={<Briefcase size={16} />} color="#3b82f6" />
      </div>

      {/* Campus job postings summary — management is on the Job Posting page */}
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

      {/* Student readiness — no roster is stored */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-[var(--accent-from)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Student Readiness</p>
          </div>
          <Badge variant="info">No data</Badge>
        </div>
        <div className="flex flex-col items-center text-center gap-3 py-8">
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
            <SearchX size={22} className="text-[var(--accent-from)]" />
          </div>
          <h3 className="font-extrabold text-[var(--text-primary)]">No student readiness data</h3>
          <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed">
            Readiness scores and training-gap analysis are not calculated yet. MockMate does not store a student roster, so nothing is shown here.
          </p>
        </div>
      </Card>
    </div>
  )
}
