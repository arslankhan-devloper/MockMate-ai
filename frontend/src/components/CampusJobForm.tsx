import { useState } from 'react'
import {
  X, Eye, Send, Save, Building2, CalendarDays, CalendarClock, Clock,
  MapPin, IndianRupee, GraduationCap, ShieldCheck, Check, Briefcase, Users, Link, Loader2, AlertTriangle
} from 'lucide-react'
import { Card, Button, Badge, Input, SelectField } from './ui'
import {
  engineeringBranches, emptyCampusJobDraft, validateCampusJob, draftToJob, draftToPayload,
  formatDate, formatTime, DEFAULT_LINK_LABEL,
  type CampusJob, type CampusJobDraft, type CampusJobInput, type JobType,
} from '../data/campusJobs'
import type { MutationResult } from '../hooks/useCampusJobs'

interface CampusJobFormProps {
  collegeName: string
  mode: 'create' | 'edit'
  /** Existing values when editing a job. */
  initial?: CampusJobDraft
  /** Whether the publish action is available (false for an already published job). */
  allowPublish: boolean
  onClose: () => void
  onSubmit: (payload: CampusJobInput, action: 'save' | 'publish') => Promise<MutationResult>
}

const textareaClass =
  'w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent-from)] focus:ring-2 focus:ring-[var(--accent-from)]/20 transition-all-smooth resize-y'

export default function CampusJobForm({
  collegeName, mode, initial, allowPublish, onClose, onSubmit,
}: CampusJobFormProps) {
  const [draft, setDraft] = useState<CampusJobDraft>(() => initial ?? emptyCampusJobDraft())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Any branch on an existing job that is not in the standard list is still
  // selectable, so editing never silently drops it.
  const branchOptions = [...engineeringBranches]
  for (const b of draft.branches) {
    if (!branchOptions.includes(b)) branchOptions.push(b)
  }

  const set = <K extends keyof CampusJobDraft>(key: K, value: CampusJobDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }))

  const toggleBranch = (branch: string) =>
    setDraft(prev => ({
      ...prev,
      branches: prev.branches.includes(branch)
        ? prev.branches.filter(b => b !== branch)
        : [...prev.branches, branch],
    }))

  const submit = async (action: 'save' | 'publish') => {
    const errs = validateCampusJob(draft, action === 'publish' ? 'publish' : 'draft')
    setErrors(errs)
    setSubmitError(null)
    if (Object.keys(errs).length > 0) {
      setPreview(false)
      return
    }
    setSaving(true)
    const result = await onSubmit(draftToPayload(draft), action)
    setSaving(false)
    if (result.ok) {
      onClose()
    } else {
      setSubmitError(result.error ?? 'Something went wrong. Please try again.')
    }
  }

  const previewJob = draftToJob(draft, allowPublish ? 'published' : 'draft', '')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <Card className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center flex-shrink-0">
                <Briefcase size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-[var(--text-primary)]">{mode === 'edit' ? 'Edit Campus Job' : 'Post Campus Job'}</p>
                <p className="text-[11px] text-[var(--text-muted)]">Create a placement drive listing for students</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close form"
              className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)] transition-all-smooth flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex justify-end mb-4">
            <Badge variant="info">Officer-only</Badge>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] mb-4">
            <Building2 size={14} className="text-[var(--accent-from)] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Posting for</p>
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{collegeName}</p>
            </div>
            <Badge variant="info" className="ml-auto flex-shrink-0">Assigned college</Badge>
          </div>

          {preview ? (
            <PreviewPanel job={previewJob} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Company name"
                  value={draft.company}
                  onChange={e => set('company', e.target.value)}
                  placeholder="e.g. NovaTech Solutions"
                  leftIcon={<Building2 size={14} />}
                  error={errors.company}
                />
                <Input
                  label="Job title"
                  value={draft.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Software Engineer Trainee"
                  error={errors.title}
                />
                <SelectField
                  label="Job type"
                  options={['In-Campus', 'Off-Campus']}
                  value={draft.jobType}
                  onChange={v => set('jobType', v as JobType)}
                />
                <Input
                  label="Job location"
                  value={draft.location}
                  onChange={e => set('location', e.target.value)}
                  placeholder="e.g. Pune"
                  leftIcon={<MapPin size={14} />}
                  error={errors.location}
                />
                <Input
                  label="Package / salary"
                  value={draft.package}
                  onChange={e => set('package', e.target.value)}
                  placeholder="e.g. ₹6.5 LPA"
                  leftIcon={<IndianRupee size={14} />}
                  error={errors.package}
                />
                <Input
                  label="Minimum CGPA"
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={draft.minCgpa}
                  onChange={e => set('minCgpa', e.target.value)}
                  placeholder="e.g. 6.5"
                  error={errors.minCgpa}
                />
                <Input
                  label="Allowed backlogs"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.allowedBacklogs}
                  onChange={e => set('allowedBacklogs', e.target.value)}
                  placeholder="e.g. 0"
                  error={errors.allowedBacklogs}
                />
                <Input
                  label="Application deadline"
                  type="date"
                  value={draft.applicationDeadline}
                  onChange={e => set('applicationDeadline', e.target.value)}
                  leftIcon={<CalendarDays size={14} />}
                  error={errors.applicationDeadline}
                />
              </div>

              {/* Drive schedule */}
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarClock size={14} className="text-[var(--accent-from)]" />
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Placement drive schedule</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Drive date"
                    type="date"
                    value={draft.driveDate}
                    onChange={e => set('driveDate', e.target.value)}
                    error={errors.driveDate}
                  />
                  <Input
                    label="Drive time"
                    type="time"
                    value={draft.driveTime}
                    onChange={e => set('driveTime', e.target.value)}
                    leftIcon={<Clock size={14} />}
                    error={errors.driveTime}
                  />
                  <Input
                    label="Venue"
                    value={draft.driveVenue}
                    onChange={e => set('driveVenue', e.target.value)}
                    placeholder="e.g. Main Auditorium"
                    leftIcon={<MapPin size={14} />}
                    error={errors.driveVenue}
                  />
                </div>
              </div>

              {/* External application link (optional) */}
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-3">
                  <Link size={14} className="text-[var(--accent-from)]" />
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">External application (optional)</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Application link (URL)"
                    value={draft.applicationLink}
                    onChange={e => set('applicationLink', e.target.value)}
                    placeholder="https://company.com/careers/role"
                    leftIcon={<Link size={14} />}
                    error={errors.applicationLink}
                  />
                  <Input
                    label="Link label (optional)"
                    value={draft.linkLabel}
                    onChange={e => set('linkLabel', e.target.value)}
                    placeholder={DEFAULT_LINK_LABEL}
                  />
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed">
                  Add the official company careers page, job description, or application form. If left empty, students apply inside MockMate. A provided link must start with http:// or https:// and opens on the company's own website.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)]">Job description</label>
                <textarea
                  className={`${textareaClass} mt-1.5`}
                  rows={3}
                  value={draft.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Describe the role, responsibilities and what the candidate will work on."
                />
                {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)]">Eligibility criteria</label>
                <textarea
                  className={`${textareaClass} mt-1.5`}
                  rows={2}
                  value={draft.eligibility}
                  onChange={e => set('eligibility', e.target.value)}
                  placeholder="e.g. Final-year B.E./B.Tech students with no active backlogs."
                />
                {errors.eligibility && <p className="text-xs text-red-500 mt-1">{errors.eligibility}</p>}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap size={14} className="text-[var(--accent-from)]" />
                  <label className="text-sm font-medium text-[var(--text-secondary)]">Eligible engineering branches</label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {branchOptions.map(b => {
                    const on = draft.branches.includes(b)
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => toggleBranch(b)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all-smooth cursor-pointer ${on ? 'gradient-bg text-white border-transparent' : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent-from)]'}`}
                      >
                        {on && <Check size={12} />}
                        {b}
                      </button>
                    )
                  })}
                </div>
                {errors.branches && <p className="text-xs text-red-500 mt-1.5">{errors.branches}</p>}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] mt-5">
            <ShieldCheck size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {mode === 'edit'
                ? 'Changes are saved to your college\u2019s job board. Published jobs stay visible to eligible students.'
                : 'Drafts are saved to your account. Publishing makes the listing visible to eligible students. In-Campus jobs are visible only to students of your college; Off-Campus jobs are visible to students of any college.'}
            </p>
          </div>

          {submitError && (
            <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-red-500/5 border border-red-500/20 mt-3">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{submitError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 flex-wrap mt-5">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="secondary" size="sm" onClick={() => setPreview(p => !p)} disabled={saving}>
              <Eye size={13} /> {preview ? 'Back to Edit' : 'Preview'}
            </Button>
            {!preview && (
              <Button variant="secondary" size="sm" onClick={() => { void submit('save') }} disabled={saving}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {mode === 'edit' ? 'Save Changes' : 'Save as Draft'}
              </Button>
            )}
            {!preview && allowPublish && (
              <Button size="sm" onClick={() => { void submit('publish') }} disabled={saving}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Publish Job
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function PreviewPanel({ job }: { job: CampusJob }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Eye size={14} className="text-[var(--accent-from)]" />
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Student preview (not yet published)</p>
      </div>

      <div className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-dashed border-[var(--accent-from)]">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
            {(job.company || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">{job.title || 'Untitled role'}</p>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
              <Building2 size={11} /> {job.company || 'Company name'}
            </p>
          </div>
          <Badge variant="info">{job.jobType}</Badge>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
          <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><MapPin size={12} className="text-[var(--text-muted)]" /> {job.location || '—'}</span>
          <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><IndianRupee size={12} className="text-[var(--text-muted)]" /> {job.package || '—'}</span>
          <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><GraduationCap size={12} className="text-[var(--text-muted)]" /> CGPA {job.minCgpa} · {job.allowedBacklogs} backlog(s)</span>
        </div>

        {job.description && <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">{job.description}</p>}

        <div className="flex flex-wrap gap-1.5 mb-3">
          {job.branches.length > 0
            ? job.branches.map(b => <Badge key={b} variant="default">{b}</Badge>)
            : <span className="text-[11px] text-[var(--text-muted)]">No branches selected yet</span>}
        </div>

        {job.applicationLink && (
          <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] border border-[var(--border)] mb-3 text-[11px]">
            <p className="font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5 flex items-center gap-1"><Link size={10} /> External application</p>
            <p className="text-[var(--text-primary)] font-semibold">{job.linkLabel || DEFAULT_LINK_LABEL}</p>
            <p className="text-[var(--text-muted)] break-all">{job.applicationLink}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
            <p className="font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Application deadline</p>
            <p className="text-[var(--text-primary)] font-semibold">{formatDate(job.applicationDeadline)}</p>
          </div>
          <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
            <p className="font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Placement drive</p>
            <p className="text-[var(--text-primary)] font-semibold">{formatDate(job.driveDate)} · {formatTime(job.driveTime)}</p>
            <p className="text-[var(--text-muted)] flex items-center gap-1 mt-0.5"><MapPin size={10} /> {job.driveVenue || '—'}</p>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
        <Users size={12} /> This is how students will see the listing once published.
      </p>
    </div>
  )
}
