import { useState, type FormEvent } from 'react'
import {
  Building2, CheckCircle2, Sparkles, FileText, Search, SearchX,
  SlidersHorizontal, MapPin, GraduationCap, X, Trash2,
  CalendarDays, CalendarClock, Check, Send, IndianRupee, Landmark, ExternalLink,
  Loader2, AlertTriangle, Globe2, Briefcase, ArrowLeft, ArrowRight,
} from 'lucide-react'
import { Card, Badge, Button, LinkButton, Input, SelectField } from '../components/ui'
import {
  engineeringBranches, formatDate, formatTime, daysUntil, isJobOpen,
  type ApplicationStatus, type CampusApplicationWithJob, type CampusJob,
} from '../data/campusJobs'
import {
  externalCountryCode, externalCountryOptions, externalEmploymentOptions,
  externalFilterValue, externalSeniorityOptions,
  formatExternalFetchedAt, formatExternalPosted,
} from '../data/externalJobs'
import type { MutationResult } from '../hooks/useCampusJobs'
import { useExternalJobs } from '../hooks/useExternalJobs'

type Page = 'roadmap' | 'resume'

interface JobPortalProps {
  onNavigate: (p: Page) => void
  campusJobs: CampusJob[]
  applications: CampusApplicationWithJob[]
  studentId: string
  studentName: string
  collegeId: string
  collegeName: string
  onApply: (jobId: string) => Promise<MutationResult>
  onWithdraw: (applicationId: string) => Promise<MutationResult>
  jobsLoading: boolean
  jobsError: string | null
  appsLoading: boolean
  appsError: string | null
  onReload: () => void
}

const appStatusVariant = (s: ApplicationStatus): 'success' | 'warning' | 'error' | 'info' =>
  s === 'Applied' ? 'info' : s === 'Under Review' ? 'warning' : s === 'Shortlisted' ? 'success' : 'error'

const MAX_EXTERNAL_SKILLS = 5

function externalJobSkills(category: string | null): string[] {
  if (!category) return []
  return [
    ...new Set(
      category
        .split(/\s*[·,;|]\s*/)
        .map(skill => skill.trim())
        .filter(Boolean),
    ),
  ]
}

export default function JobPortal({
  onNavigate, campusJobs, applications, studentId, studentName, collegeId, collegeName,
  onApply, onWithdraw, jobsLoading, jobsError, appsLoading, appsError, onReload,
}: JobPortalProps) {
  const [campusQuery, setCampusQuery] = useState('')
  const [campusJobType, setCampusJobType] = useState('All Job Types')
  const [campusBranch, setCampusBranch] = useState('All Branches')
  const [campusDeadline, setCampusDeadline] = useState('All Deadlines')
  const [campusSelected, setCampusSelected] = useState<CampusJob | null>(null)
  const [justApplied, setJustApplied] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const external = useExternalJobs()
  const [externalQuery, setExternalQuery] = useState('')
  const [externalCountry, setExternalCountry] = useState('India')
  const [externalEmploymentType, setExternalEmploymentType] = useState('All Employment Types')
  const [externalSeniority, setExternalSeniority] = useState('All Seniority Levels')

  // The API returns published jobs for students; still apply the In-Campus
  // college rule and hide jobs whose deadline has passed.
  const openCampus = campusJobs.filter(j =>
    isJobOpen(j) && (j.jobType === 'Off-Campus' || j.collegeId === collegeId),
  )
  const otherCollegeOnly = openCampus.length === 0 && campusJobs.some(j => isJobOpen(j) && j.jobType === 'In-Campus')
  const cq = campusQuery.trim().toLowerCase()
  const campusFiltered = openCampus.filter(j => {
    const matchQuery = !cq ||
      j.title.toLowerCase().includes(cq) ||
      j.company.toLowerCase().includes(cq) ||
      j.location.toLowerCase().includes(cq) ||
      j.branches.some(b => b.toLowerCase().includes(cq))
    const matchType = campusJobType === 'All Job Types' || j.jobType === campusJobType
    const matchBranch = campusBranch === 'All Branches' || j.branches.includes(campusBranch)
    const d = daysUntil(j.applicationDeadline)
    const matchDeadline = campusDeadline === 'All Deadlines' ||
      (campusDeadline === 'Next 7 days' && d >= 0 && d <= 7) ||
      (campusDeadline === 'Next 30 days' && d >= 0 && d <= 30)
    return matchQuery && matchType && matchBranch && matchDeadline
  })

  const resetCampusFilters = () => {
    setCampusQuery('')
    setCampusJobType('All Job Types')
    setCampusBranch('All Branches')
    setCampusDeadline('All Deadlines')
  }

  const appliedForJob = (jobId: string) => applications.find(a => a.jobId === jobId)
  const hasApplied = (jobId: string) => Boolean(appliedForJob(jobId))

  const handleCampusApply = async (job: CampusJob) => {
    if (hasApplied(job.id) || applyingId) return
    setActionError(null)
    setApplyingId(job.id)
    const result = await onApply(job.id)
    setApplyingId(null)
    if (result.ok) {
      setJustApplied(job.id)
    } else {
      setActionError(result.error ?? 'Could not submit your application.')
    }
  }

  const handleWithdraw = async (applicationId: string) => {
    if (withdrawingId) return
    setActionError(null)
    setWithdrawingId(applicationId)
    const result = await onWithdraw(applicationId)
    setWithdrawingId(null)
    if (!result.ok) setActionError(result.error ?? 'Could not withdraw the application.')
  }

  const submitExternalSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    external.search({
      query: externalQuery,
      country: externalCountryCode(externalCountry),
      employmentType: externalFilterValue(externalEmploymentType, 'All Employment Types'),
      seniority: externalFilterValue(externalSeniority, 'All Seniority Levels'),
    })
  }

  const resetExternalFilters = () => {
    setExternalQuery('')
    setExternalCountry('India')
    setExternalEmploymentType('All Employment Types')
    setExternalSeniority('All Seniority Levels')
    external.search({ query: '', country: 'in', employmentType: '', seniority: '' })
  }

  const refreshAll = () => {
    onReload()
    external.reload()
  }

  const externalPage = external.filters.page
  const externalMaxPage = external.data?.maxPage ?? 5
  const externalTotal = external.data?.total ?? null
  const externalApproxTotal = external.data?.totalIsEstimate ? externalTotal : null
  const externalHasNext = externalPage < externalMaxPage && external.jobs.length > 0
  const externalLiveProviders = external.providers.filter(provider => provider.status === 'ok')
  const externalFailedProviders = external.providers.filter(provider => provider.status !== 'ok')
  const externalSomeProvidersSucceeded = externalLiveProviders.length > 0
  const externalPartial = externalFailedProviders.length > 0 && external.jobs.length > 0
  const externalProviderError =
    external.jobs.length === 0 && externalFailedProviders.length > 0 ? externalFailedProviders : null
  const allFailedRateLimited =
    externalProviderError !== null &&
    externalProviderError.every(provider => provider.status === 'rate_limited')

  const campusApp = campusSelected ? appliedForJob(campusSelected.id) : undefined

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Job Portal</h1>
          <p className="text-sm text-[var(--text-secondary)]">Campus placement drives published by your placement cell.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={refreshAll}
          disabled={jobsLoading || appsLoading || external.loading}
        >
          {(jobsLoading || appsLoading || external.loading) ? <Loader2 size={13} className="animate-spin" /> : null} Refresh
        </Button>
      </div>

      {(jobsError || appsError || actionError) && (
        <Card className="p-4 flex items-start gap-3 border-red-500/20">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{actionError ?? jobsError ?? appsError}</p>
        </Card>
      )}

      {/* My applications */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center">
            <FileText size={17} className="text-[var(--accent-from)]" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">My Applications</h2>
            <p className="text-xs text-[var(--text-secondary)]">Internal applications you've submitted, with their current status.</p>
          </div>
        </div>

        {appsLoading && applications.length === 0 ? (
          <Card className="p-6 flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={15} className="animate-spin text-[var(--accent-from)]" /> Loading your applications…
          </Card>
        ) : applications.length === 0 ? (
          <Card className="p-6 flex flex-col items-center text-center gap-2 py-10">
            <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
              <FileText size={20} className="text-[var(--accent-from)]" />
            </div>
            <h3 className="font-extrabold text-[var(--text-primary)]">No applications yet</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">Apply to an internal campus drive below and it will appear here with its status.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {applications.map(app => (
              <Card key={app.id} className="p-5 flex items-start gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {(app.job?.company || '?')[0]}
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{app.job?.title ?? 'Job no longer available'}</p>
                    <Badge variant={appStatusVariant(app.status)}>{app.status}</Badge>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                    <Building2 size={11} /> {app.job ? `${app.job.company} · ${app.job.location}` : 'This drive is no longer listed.'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Applied {new Date(app.appliedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={withdrawingId === app.id}
                  onClick={() => { void handleWithdraw(app.id) }}
                >
                  {withdrawingId === app.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Withdraw
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Campus placement drives */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center">
              <Landmark size={17} className="text-[var(--accent-from)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-extrabold text-[var(--text-primary)]">Campus Placement Drives</h2>
                <Badge variant="info">{collegeName}</Badge>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">In-Campus drives are shown only for your college ({collegeName}); Off-Campus drives are shown to all colleges.</p>
            </div>
          </div>
          <Badge variant="info">Posted by your Placement Cell</Badge>
        </div>

        <Card className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input
              value={campusQuery}
              onChange={e => setCampusQuery(e.target.value)}
              placeholder="Search campus jobs"
              leftIcon={<Search size={15} />}
            />
            <SelectField options={['All Job Types', 'In-Campus', 'Off-Campus']} value={campusJobType} onChange={setCampusJobType} />
            <SelectField options={['All Branches', ...engineeringBranches]} value={campusBranch} onChange={setCampusBranch} />
            <SelectField options={['All Deadlines', 'Next 7 days', 'Next 30 days']} value={campusDeadline} onChange={setCampusDeadline} />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
            <span className="text-xs text-[var(--text-muted)]">{campusFiltered.length} of {openCampus.length} open campus {openCampus.length === 1 ? 'drive' : 'drives'}</span>
            <Button variant="secondary" size="sm" onClick={resetCampusFilters}>
              <SlidersHorizontal size={13} /> Reset Filters
            </Button>
          </div>
        </Card>

        {justApplied && (
          <Card className="p-4 flex items-start gap-3">
            <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-[var(--text-primary)]">Application submitted</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Your application is recorded with status <strong className="text-[var(--text-primary)]">Applied</strong>. Track it in <strong className="text-[var(--text-primary)]">My Applications</strong> above.
              </p>
            </div>
            <button onClick={() => setJustApplied(null)} aria-label="Dismiss confirmation" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all-smooth">
              <X size={15} />
            </button>
          </Card>
        )}

        {jobsLoading && campusJobs.length === 0 ? (
          <Card className="p-6 flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={15} className="animate-spin text-[var(--accent-from)]" /> Loading campus drives…
          </Card>
        ) : campusJobs.length === 0 ? (
          <Card className="p-6 flex flex-col items-center text-center gap-3 py-14">
            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
              <Landmark size={22} className="text-[var(--accent-from)]" />
            </div>
            <h3 className="font-extrabold text-[var(--text-primary)]">No campus jobs published yet</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">Your placement cell hasn't published any campus drives. Once a job is posted, it will appear here for eligible students.</p>
          </Card>
        ) : openCampus.length === 0 ? (
          <Card className="p-6 flex flex-col items-center text-center gap-3 py-14">
            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
              <CalendarDays size={22} className="text-[var(--accent-from)]" />
            </div>
            <h3 className="font-extrabold text-[var(--text-primary)]">No campus drives are open for {collegeName}</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">
              {otherCollegeOnly
                ? `Open drives exist, but In-Campus drives from other colleges aren't shown here. Off-Campus drives from any college would appear for you.`
                : 'All posted drives are closed or past their application deadline. Check back once the placement cell publishes a new drive.'}
            </p>
          </Card>
        ) : campusFiltered.length === 0 ? (
          <Card className="p-6 flex flex-col items-center text-center gap-3 py-14">
            <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
              <SearchX size={22} className="text-[var(--accent-from)]" />
            </div>
            <h3 className="font-extrabold text-[var(--text-primary)]">No campus jobs match your filters</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">No open campus drives match your search, job type, branch, or deadline filter. Try widening your selection.</p>
            <Button variant="secondary" size="sm" onClick={resetCampusFilters}>
              <SlidersHorizontal size={13} /> Clear Filters
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {campusFiltered.map(j => {
              const applied = appliedForJob(j.id)
              const left = daysUntil(j.applicationDeadline)
              const applying = applyingId === j.id
              return (
                <Card key={j.id} className="p-6 flex flex-col">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center text-sm font-bold text-white flex-shrink-0">{j.company[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{j.title}</p>
                      <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5"><Building2 size={11} /> {j.company}</p>
                    </div>
                    <Badge variant={j.jobType === 'In-Campus' ? 'success' : 'info'}>{j.jobType}</Badge>
                    {j.applicationLink && <Badge variant="default"><ExternalLink size={10} /> External Application</Badge>}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
                    <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><MapPin size={12} className="text-[var(--text-muted)]" /> {j.location}</span>
                    <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><IndianRupee size={12} className="text-[var(--text-muted)]" /> {j.package}</span>
                    <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><CalendarDays size={12} className="text-[var(--text-muted)]" /> Apply by {formatDate(j.applicationDeadline)}</span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap size={12} className="text-[var(--accent-from)]" />
                      <span className="text-xs font-semibold text-[var(--text-primary)]">Eligibility</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mb-2">Minimum CGPA {j.minCgpa} · {j.allowedBacklogs} backlog(s) allowed</p>
                    <div className="flex flex-wrap gap-1.5">
                      {j.branches.map(b => <Badge key={b} variant="default">{b}</Badge>)}
                    </div>
                  </div>

                  <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Placement drive</p>
                    <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5"><CalendarClock size={12} className="text-[var(--text-muted)]" /> {formatDate(j.driveDate)} · {formatTime(j.driveTime)}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5 mt-1"><MapPin size={12} className="text-[var(--text-muted)]" /> {j.driveVenue}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mt-auto">
                    <Button size="sm" onClick={() => setCampusSelected(j)}>
                      <FileText size={13} /> View Details
                    </Button>
                    {applied && <Badge variant="success"><Check size={11} /> {applied.status}</Badge>}
                    {j.applicationLink ? (
                      <LinkButton size="sm" href={j.applicationLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={13} /> Apply on Company Website
                      </LinkButton>
                    ) : !applied && (
                      <Button size="sm" variant="secondary" disabled={applying} onClick={() => { void handleCampusApply(j) }}>
                        {applying ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Apply
                      </Button>
                    )}
                    <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                      {left <= 0 ? 'Closing today' : left === 1 ? '1 day left' : `${left} days left`}
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center">
              <Globe2 size={17} className="text-[var(--accent-from)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-extrabold text-[var(--text-primary)]">External Job Openings</h2>
                {externalLiveProviders.length > 0 && <Badge variant="success">Live listings</Badge>}
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Listings are aggregated from external job platforms and kept separate from your college&apos;s placement
                drives. Applications open on the original listing website.
              </p>
            </div>
          </div>
          <Badge variant="default">External · Not employer-posted</Badge>
        </div>

        {external.loading && !external.loaded ? (
          <Card className="p-6 flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={15} className="animate-spin text-[var(--accent-from)]" /> Loading external jobs…
          </Card>
        ) : externalProviderError ? (
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-[var(--accent-from)]" />
              </div>
              <div>
                <h3 className="font-extrabold text-[var(--text-primary)]">
                  {allFailedRateLimited
                    ? 'External listings are temporarily rate-limited'
                    : 'External listings are temporarily unavailable'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                  Some external listings could not be loaded. Please try again shortly.
                </p>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-2">
                  {externalSomeProvidersSucceeded
                    ? 'No matching listings were returned by the available external listings.'
                    : 'MockMate never creates placeholder jobs.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" size="sm" onClick={external.reload} disabled={external.loading}>
                {external.loading ? <Loader2 size={13} className="animate-spin" /> : null} Retry
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <Card className="p-5">
              <form onSubmit={submitExternalSearch}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <Input
                    value={externalQuery}
                    onChange={e => setExternalQuery(e.target.value)}
                    placeholder="Search external jobs"
                    maxLength={120}
                    leftIcon={<Search size={15} />}
                  />
                  <SelectField
                    options={externalCountryOptions.map(option => option.label)}
                    value={externalCountry}
                    onChange={setExternalCountry}
                  />
                  <SelectField
                    options={externalEmploymentOptions}
                    value={externalEmploymentType}
                    onChange={setExternalEmploymentType}
                  />
                  <SelectField
                    options={externalSeniorityOptions}
                    value={externalSeniority}
                    onChange={setExternalSeniority}
                  />
                  <Button type="submit" size="md" disabled={external.loading}>
                    {external.loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search Jobs
                  </Button>
                </div>
              </form>
              <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
                <span className="text-xs text-[var(--text-muted)]">
                  {external.loading
                    ? 'Updating external jobs…'
                    : `${external.jobs.length} external ${external.jobs.length === 1 ? 'role' : 'roles'} loaded${externalApproxTotal !== null ? ` · ~${externalApproxTotal} matches` : ''}${external.data ? ` · updated ${formatExternalFetchedAt(external.data.fetchedAt)}` : ''}`}
                </span>
                <div className="flex items-center gap-2">
                  {external.data?.cached && <Badge variant="default">Cached</Badge>}
                  <Button variant="secondary" size="sm" onClick={resetExternalFilters}>
                    <SlidersHorizontal size={13} /> Reset
                  </Button>
                </div>
              </div>
            </Card>

            {external.error && (
              <Card className="p-4 flex items-start gap-3 border-red-500/20">
                <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{external.error}</p>
              </Card>
            )}

            {externalPartial && (
              <Card className="p-4 flex items-start gap-3 border-amber-500/20">
                <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    Some external listings could not be loaded
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Showing the listings that are available right now. Please try again shortly for the rest.
                  </p>
                </div>
              </Card>
            )}

            {external.jobs.length === 0 && !external.loading && !external.error ? (
              <Card className="p-6 flex flex-col items-center text-center gap-3 py-12">
                <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
                  <SearchX size={22} className="text-[var(--accent-from)]" />
                </div>
                <h3 className="font-extrabold text-[var(--text-primary)]">No external jobs match your search</h3>
                <p className="text-sm text-[var(--text-muted)] max-w-sm">
                  Try a broader keyword, a different country, employment type, or seniority level.
                </p>
                <Button variant="secondary" size="sm" onClick={resetExternalFilters}>
                  <SlidersHorizontal size={13} /> Clear Filters
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {external.jobs.map(job => {
                  const skills = externalJobSkills(job.category)
                  const visibleSkills = skills.slice(0, MAX_EXTERNAL_SKILLS)
                  const extraSkillCount = skills.length - visibleSkills.length

                  return (
                    <Card key={job.id} className="p-5 flex flex-col">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                          {job.company[0] || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)]">{job.title}</p>
                          <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <Building2 size={11} /> {job.company}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {job.remote && <Badge variant="success"><Globe2 size={10} /> Remote</Badge>}
                          <Badge variant="info">External</Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
                        <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
                          <MapPin size={12} className="text-[var(--text-muted)]" /> {job.location}
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
                          <CalendarDays size={12} className="text-[var(--text-muted)]" /> {formatExternalPosted(job.postedAt)}
                        </span>
                        {job.employmentType && (
                          <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
                            <Briefcase size={12} className="text-[var(--text-muted)]" /> {job.employmentType}
                          </span>
                        )}
                        {job.seniority && (
                          <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
                            <GraduationCap size={12} className="text-[var(--text-muted)]" /> {job.seniority}
                          </span>
                        )}
                        {job.salary && (
                          <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1.5">
                            {job.salary}
                          </span>
                        )}
                      </div>

                      {visibleSkills.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3" aria-label="Skills and keywords">
                          {visibleSkills.map(skill => (
                            <span
                              key={skill}
                              title={skill}
                              className="inline-flex max-w-[10rem] items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]"
                            >
                              <span className="truncate">{skill}</span>
                            </span>
                          ))}
                          {extraSkillCount > 0 && (
                            <span className="rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                              +{extraSkillCount} more
                            </span>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-3 break-words mb-4">
                        {job.description || 'No description provided.'}
                      </p>

                      <div className="flex items-center gap-2 flex-wrap mt-auto">
                        <LinkButton size="sm" href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={13} /> View &amp; Apply
                        </LinkButton>
                        <span className="text-[10px] text-[var(--text-muted)] ml-auto">Opens original listing</span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}

            {external.jobs.length > 0 && (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => external.setPage(externalPage - 1)}
                  disabled={external.loading || externalPage <= 1}
                >
                  <ArrowLeft size={13} /> Previous
                </Button>
                <span className="text-xs text-[var(--text-muted)]">Page {externalPage} of {externalMaxPage}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => external.setPage(externalPage + 1)}
                  disabled={external.loading || !externalHasNext}
                >
                  Next <ArrowRight size={13} />
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <Card className="p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
            <FileText size={16} className="text-[var(--accent-from)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Improve your applications</p>
            <p className="text-xs text-[var(--text-muted)]">Run a resume analysis to get suggestions before you apply.</p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => onNavigate('resume')}>
          <Sparkles size={13} /> Analyze Resume
        </Button>
      </Card>

      {/* Campus job detail modal */}
      {campusSelected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          onClick={() => setCampusSelected(null)}
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <Card className="p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center text-base font-bold text-white flex-shrink-0">{campusSelected.company[0]}</div>
                  <div className="min-w-0">
                    <p className="font-extrabold text-[var(--text-primary)] truncate">{campusSelected.title}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{campusSelected.company} · {campusSelected.location}</p>
                  </div>
                </div>
                <button onClick={() => setCampusSelected(null)} aria-label="Close details" className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)] transition-all-smooth flex-shrink-0">
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-4">
                <Badge variant={campusSelected.jobType === 'In-Campus' ? 'success' : 'info'}>{campusSelected.jobType}</Badge>
                <Badge variant="info"><MapPin size={10} /> {campusSelected.location}</Badge>
                <Badge variant="info"><IndianRupee size={10} /> {campusSelected.package}</Badge>
                {campusApp && <Badge variant={appStatusVariant(campusApp.status)}><Check size={10} /> {campusApp.status}</Badge>}
              </div>

              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Role overview</p>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{campusSelected.description}</p>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <GraduationCap size={13} className="text-[var(--accent-from)]" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Eligibility criteria</p>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{campusSelected.eligibility}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Min CGPA</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{campusSelected.minCgpa}</p>
                </div>
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Backlogs allowed</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{campusSelected.allowedBacklogs}</p>
                </div>
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Package</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{campusSelected.package}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Eligible branches</p>
                <div className="flex flex-wrap gap-1.5">
                  {campusSelected.branches.map(b => <Badge key={b} variant="default">{b}</Badge>)}
                </div>
              </div>

              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Placement drive details</p>
                <div className="space-y-1.5">
                  <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><CalendarDays size={13} className="text-[var(--accent-from)]" /> Applications close {formatDate(campusSelected.applicationDeadline)}</p>
                  <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><CalendarClock size={13} className="text-[var(--accent-from)]" /> Drive on {formatDate(campusSelected.driveDate)} at {formatTime(campusSelected.driveTime)}</p>
                  <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><MapPin size={13} className="text-[var(--accent-from)]" /> Venue: {campusSelected.driveVenue}</p>
                </div>
              </div>

              {campusApp && (
                <div className="p-3 rounded-[var(--radius-md)] bg-emerald-500/5 border border-emerald-500/20 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">Application status: {campusApp.status}</p>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    Applied on {new Date(campusApp.appliedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} as {studentName || 'Student'}.
                  </p>
                </div>
              )}

              {campusSelected.applicationLink ? (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1"><ExternalLink size={11} /> External application</p>
                  <p className="text-xs font-semibold text-[var(--text-primary)] mb-0.5">{campusSelected.linkLabel || 'Apply on Company Website'}</p>
                  <p className="text-[11px] text-[var(--text-muted)] break-all mb-3">{campusSelected.applicationLink}</p>
                  <LinkButton className="w-full" href={campusSelected.applicationLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={14} /> Apply on Company Website
                  </LinkButton>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-2">
                    You'll be redirected to the company's own website in a new tab. MockMate does not submit, track, or confirm any application made there.
                  </p>
                </div>
              ) : !campusApp && (
                <Button
                  className="w-full"
                  disabled={applyingId === campusSelected.id}
                  onClick={() => { void handleCampusApply(campusSelected) }}
                >
                  {applyingId === campusSelected.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Apply to this job
                </Button>
              )}

              {studentId && (
                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-3">
                  Submitted as {studentName || 'you'} for {collegeName}.
                </p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
