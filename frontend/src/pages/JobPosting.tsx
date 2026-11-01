import { useState } from 'react'
import {
  Building2, Briefcase, Plus, Eye, Send, Ban, Users, X, Pencil,
  CalendarDays, CalendarClock, MapPin, IndianRupee, GraduationCap, CheckCircle2,
  ExternalLink, Loader2, AlertTriangle,
} from 'lucide-react'
import { Card, Badge, Button, LinkButton, StatCard } from '../components/ui'
import CampusJobForm from '../components/CampusJobForm'
import {
  formatDate, formatTime, isJobOpen, jobToDraft,
  type ApplicationStatus, type CampusApplicationWithJob, type CampusJob,
  type CampusJobInput, type CampusJobStatus,
} from '../data/campusJobs'
import type { MutationResult } from '../hooks/useCampusJobs'

const statusVariant = (s: CampusJobStatus): 'success' | 'warning' | 'error' =>
  s === 'published' ? 'success' : s === 'draft' ? 'warning' : 'error'
const statusLabel: Record<CampusJobStatus, string> = {
  published: 'Published',
  draft: 'Draft',
  closed: 'Closed',
}

const appStatusVariant = (s: ApplicationStatus): 'default' | 'success' | 'warning' | 'error' | 'info' =>
  s === 'Applied' ? 'info' : s === 'Under Review' ? 'warning' : s === 'Shortlisted' ? 'success' : 'error'

// Mirrors the server-side status workflow in applications.controller.ts.
const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  Applied: ['Under Review', 'Shortlisted', 'Rejected'],
  'Under Review': ['Shortlisted', 'Rejected'],
  Shortlisted: ['Under Review', 'Rejected'],
  Rejected: ['Under Review', 'Shortlisted'],
}

interface JobPostingProps {
  jobs: CampusJob[]
  applications: CampusApplicationWithJob[]
  loading: boolean
  error: string | null
  collegeName: string
  onCreate: (payload: CampusJobInput, publish: boolean) => Promise<MutationResult>
  onUpdate: (jobId: string, payload: CampusJobInput) => Promise<MutationResult>
  onPublish: (jobId: string) => Promise<MutationResult>
  onClose: (jobId: string) => Promise<MutationResult>
  onUpdateApplicationStatus: (applicationId: string, status: ApplicationStatus) => Promise<MutationResult>
  onReload: () => void
}

type FormState = { mode: 'create' } | { mode: 'edit'; job: CampusJob }

export default function JobPosting({
  jobs, applications, loading, error, collegeName,
  onCreate, onUpdate, onPublish, onClose, onUpdateApplicationStatus, onReload,
}: JobPostingProps) {
  const [form, setForm] = useState<FormState | null>(null)
  const [viewJob, setViewJob] = useState<CampusJob | null>(null)
  const [applicantsJob, setApplicantsJob] = useState<CampusJob | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyAppId, setBusyAppId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const applicationsForJob = (jobId: string) =>
    applications.filter(a => a.jobId === jobId)

  const publishedCount = jobs.filter(j => j.status === 'published').length
  const draftCount = jobs.filter(j => j.status === 'draft').length

  const runJobAction = async (jobId: string, action: () => Promise<MutationResult>) => {
    setBusyId(jobId)
    setActionError(null)
    const result = await action()
    setBusyId(null)
    if (!result.ok) setActionError(result.error ?? 'Something went wrong.')
  }

  const runStatusUpdate = async (applicationId: string, status: ApplicationStatus) => {
    setBusyAppId(applicationId)
    setActionError(null)
    const result = await onUpdateApplicationStatus(applicationId, status)
    setBusyAppId(null)
    if (!result.ok) setActionError(result.error ?? 'Could not update the application.')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Job Posting</h1>
            <Badge variant="info">{collegeName}</Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Create and manage In-Campus and Off-Campus job postings for your college.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => setForm({ mode: 'create' })}>
            <Plus size={15} /> Post New Job
          </Button>
        </div>
      </div>

      {/* Officer notice */}
      <div className="flex items-start gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)]">
        <Briefcase size={15} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Jobs you post are linked to <strong className="text-[var(--text-primary)]">{collegeName}</strong> by the server. In-Campus jobs are shown only to students of your college in the Job Portal, while Off-Campus jobs are visible to all colleges.
        </p>
      </div>

      {error && (
        <Card className="p-4 flex items-start gap-3 border-red-500/20">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</p>
            <button onClick={onReload} className="text-[11px] font-semibold text-[var(--accent-from)] mt-1.5 cursor-pointer">Retry</button>
          </div>
        </Card>
      )}
      {actionError && (
        <Card className="p-4 flex items-start gap-3 border-red-500/20">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{actionError}</p>
        </Card>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Postings" value={`${jobs.length}`} sub="Your college" icon={<Briefcase size={16} />} />
        <StatCard label="Published" value={`${publishedCount}`} sub="Visible to students" icon={<CheckCircle2 size={16} />} color="#10b981" />
        <StatCard label="Drafts" value={`${draftCount}`} sub="Not yet published" icon={<Ban size={16} />} color="#f59e0b" />
        <StatCard label="Applications" value={`${applications.length}`} sub="Across all postings" icon={<Users size={16} />} color="#3b82f6" />
      </div>

      {/* Postings list */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Briefcase size={15} className="text-[var(--accent-from)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Job Postings</p>
          </div>
          <Badge variant="info">{jobs.length} posted</Badge>
        </div>

        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
            <Loader2 size={15} className="animate-spin text-[var(--accent-from)]" /> Loading your postings…
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 py-12">
            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
              <Briefcase size={22} className="text-[var(--accent-from)]" />
            </div>
            <h3 className="font-extrabold text-[var(--text-primary)]">No jobs posted yet</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">Post an In-Campus or Off-Campus drive for {collegeName} to make it visible to your college's students in the Job Portal.</p>
            <Button size="sm" onClick={() => setForm({ mode: 'create' })}><Plus size={13} /> Post New Job</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(j => {
              const apps = applicationsForJob(j.id)
              const busy = busyId === j.id
              return (
                <div key={j.id} className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] flex items-start gap-3 flex-wrap">
                  <div className="w-10 h-10 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                    {j.company[0]}
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{j.title}</p>
                      <Badge variant={statusVariant(j.status)}>{statusLabel[j.status]}</Badge>
                      <Badge variant="info">{j.jobType}</Badge>
                      {j.applicationLink && <Badge variant="default"><ExternalLink size={10} /> External Application</Badge>}
                      {isJobOpen(j) && <Badge variant="success"><CheckCircle2 size={10} /> Open to students</Badge>}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mb-2">
                      <Building2 size={11} /> {j.company} · {j.location}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><CalendarDays size={12} className="text-[var(--text-muted)]" /> Deadline {formatDate(j.applicationDeadline)}</span>
                      <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><CalendarClock size={12} className="text-[var(--text-muted)]" /> Drive {formatDate(j.driveDate)} · {formatTime(j.driveTime)}</span>
                      <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><Users size={12} className="text-[var(--text-muted)]" /> {apps.length} application(s)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => setViewJob(j)}><Eye size={13} /> Preview</Button>
                    <Button variant="secondary" size="sm" onClick={() => setApplicantsJob(j)}>
                      <Users size={13} /> Applicants{apps.length > 0 ? ` (${apps.length})` : ''}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setForm({ mode: 'edit', job: j })}>
                      <Pencil size={13} /> Edit
                    </Button>
                    {j.status !== 'published' && (
                      <Button size="sm" disabled={busy} onClick={() => { void runJobAction(j.id, () => onPublish(j.id)) }}>
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Publish
                      </Button>
                    )}
                    {j.status === 'published' && (
                      <Button variant="danger" size="sm" disabled={busy} onClick={() => { void runJobAction(j.id, () => onClose(j.id)) }}>
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Close
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-4">
          Published In-Campus jobs appear only to your college's students in the Job Portal; Off-Campus jobs appear to every college. Drafts and closed jobs are hidden from students.
        </p>
      </Card>

      {/* Job preview (officer) */}
      {viewJob && (
        <JobPreviewModal
          job={viewJob}
          applicationCount={applicationsForJob(viewJob.id).length}
          onClose={() => setViewJob(null)}
          onEdit={() => { setForm({ mode: 'edit', job: viewJob }); setViewJob(null) }}
          onPublish={viewJob.status !== 'published' ? () => { void runJobAction(viewJob.id, () => onPublish(viewJob.id)); setViewJob(null) } : undefined}
          onCloseJob={viewJob.status === 'published' ? () => { void runJobAction(viewJob.id, () => onClose(viewJob.id)); setViewJob(null) } : undefined}
        />
      )}

      {/* Applicants modal */}
      {applicantsJob && (
        <ApplicantsModal
          job={applicantsJob}
          applications={applicationsForJob(applicantsJob.id)}
          busyAppId={busyAppId}
          onClose={() => setApplicantsJob(null)}
          onUpdateStatus={runStatusUpdate}
        />
      )}

      {/* Post / edit job form (shared component) */}
      {form && (
        <CampusJobForm
          collegeName={collegeName}
          mode={form.mode}
          initial={form.mode === 'edit' ? jobToDraft(form.job) : undefined}
          allowPublish={form.mode === 'create' || form.job.status !== 'published'}
          onClose={() => setForm(null)}
          onSubmit={
            form.mode === 'create'
              ? (payload, action) => onCreate(payload, action === 'publish')
              : async (payload, action) => {
                  const saved = await onUpdate(form.job.id, payload)
                  if (!saved.ok || action === 'save') return saved
                  return onPublish(form.job.id)
                }
          }
        />
      )}
    </div>
  )
}

function JobPreviewModal({ job, applicationCount, onClose, onEdit, onPublish, onCloseJob }: {
  job: CampusJob
  applicationCount: number
  onClose: () => void
  onEdit: () => void
  onPublish?: () => void
  onCloseJob?: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center text-base font-bold text-white flex-shrink-0">
                {job.company[0]}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-[var(--text-primary)] truncate">{job.title}</p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{job.company} · {job.location}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close preview" className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)] transition-all-smooth flex-shrink-0">
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Badge variant={statusVariant(job.status)}>{statusLabel[job.status]}</Badge>
            <Badge variant="info">{job.jobType}</Badge>
            {isJobOpen(job) && <Badge variant="success">Open to students</Badge>}
          </div>

          {job.description && (
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Role overview</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{job.description}</p>
            </div>
          )}

          {job.eligibility && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1.5">
                <GraduationCap size={13} className="text-[var(--accent-from)]" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Eligibility</p>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{job.eligibility}</p>
            </div>
          )}

          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Eligible branches</p>
            <div className="flex flex-wrap gap-1.5">
              {job.branches.length > 0
                ? job.branches.map(b => <Badge key={b} variant="default">{b}</Badge>)
                : <span className="text-[11px] text-[var(--text-muted)]">No branches selected</span>}
            </div>
          </div>

          {job.applicationLink && (
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1"><ExternalLink size={11} /> External application</p>
              <p className="text-xs font-semibold text-[var(--text-primary)] mb-0.5">{job.linkLabel || 'Apply on Company Website'}</p>
              <p className="text-[11px] text-[var(--text-muted)] break-all mb-2">{job.applicationLink}</p>
              <LinkButton size="sm" variant="secondary" href={job.applicationLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} /> View Application Link
              </LinkButton>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">CGPA / Backlogs</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{job.minCgpa} · {job.allowedBacklogs}</p>
            </div>
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Package</p>
              <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1"><IndianRupee size={13} /> {job.package.replace('₹', '')}</p>
            </div>
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Applications</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{applicationCount}</p>
            </div>
          </div>

          <div className="p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] mb-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Placement drive details</p>
            <div className="space-y-1">
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><CalendarDays size={12} className="text-[var(--text-muted)]" /> Apply by {formatDate(job.applicationDeadline)}</p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><CalendarClock size={12} className="text-[var(--text-muted)]" /> {formatDate(job.driveDate)} · {formatTime(job.driveTime)}</p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><MapPin size={12} className="text-[var(--text-muted)]" /> {job.driveVenue}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={onEdit}><Pencil size={13} /> Edit</Button>
            {onPublish && (
              <Button size="sm" onClick={onPublish}><Send size={13} /> Publish</Button>
            )}
            {onCloseJob && (
              <Button variant="danger" size="sm" onClick={onCloseJob}><Ban size={13} /> Close Listing</Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function ApplicantsModal({ job, applications, busyAppId, onClose, onUpdateStatus }: {
  job: CampusJob
  applications: CampusApplicationWithJob[]
  busyAppId: string | null
  onClose: () => void
  onUpdateStatus: (applicationId: string, status: ApplicationStatus) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="font-extrabold text-[var(--text-primary)] truncate">Applicants · {job.title}</p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">{job.company} · {job.location}</p>
            </div>
            <button onClick={onClose} aria-label="Close applicants" className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)] transition-all-smooth flex-shrink-0">
              <X size={16} />
            </button>
          </div>

          {applications.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-3 py-10">
              <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
                <Users size={22} className="text-[var(--accent-from)]" />
              </div>
              <h3 className="font-extrabold text-[var(--text-primary)]">No applications yet</h3>
              <p className="text-sm text-[var(--text-muted)] max-w-sm">Students who apply to this internal listing will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map(app => {
                const busy = busyAppId === app.id
                return (
                  <div key={app.id} className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-bold text-[var(--text-primary)]">{app.studentName?.trim() || 'Student'}</p>
                        <Badge variant={appStatusVariant(app.status)}>{app.status}</Badge>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Applied {new Date(app.appliedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {STATUS_TRANSITIONS[app.status].map(next => (
                        <Button
                          key={next}
                          variant={next === 'Rejected' ? 'danger' : 'secondary'}
                          size="sm"
                          disabled={busy}
                          onClick={() => onUpdateStatus(app.id, next)}
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : null} {next}
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-4">
            Status changes are saved to the applicant's record and are visible to the student in the Job Portal.
          </p>
        </Card>
      </div>
    </div>
  )
}
