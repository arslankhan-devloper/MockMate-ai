import { useMemo } from 'react'
import {
  AlertCircle, ArrowUpRight, ChevronRight, ExternalLink, Loader2, RefreshCw, Sparkles,
} from 'lucide-react'
import { Button, Card } from './ui'
import { useExternalJobs } from '../hooks/useExternalJobs'
import { isHttpUrl, type CampusJob } from '../data/campusJobs'
import type { StoredResume } from '../lib/resumeStore'
import { recommendJobs, type RecommendationJob } from '../lib/jobRecommendations'

type RecommendedJobsPage = 'resume' | 'profile-setup' | 'job-portal'

const actionBaseClass = 'inline-flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-sm)] px-2.5 text-[11px] font-semibold transition-all-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-from)]/40'
const secondaryActionClass = `${actionBaseClass} border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)]`
const primaryActionClass = `${actionBaseClass} gradient-bg text-white shadow-[var(--shadow-sm)] hover:opacity-90`

interface RecommendedJobsProps {
  jobs: CampusJob[]
  collegeId: string
  studentBranch: string
  profileLoading: boolean
  jobsLoading: boolean
  jobsError: string | null
  onReloadJobs: () => void
  storedResume: StoredResume | null
  onNavigate: (page: RecommendedJobsPage) => void
}

export default function RecommendedJobs({
  jobs,
  collegeId,
  studentBranch,
  profileLoading,
  jobsLoading,
  jobsError,
  onReloadJobs,
  storedResume,
  onNavigate,
}: RecommendedJobsProps) {
  const external = useExternalJobs()

  const targetRole = storedResume?.jobTitle.trim() || null
  const skills = useMemo(
    () => [
      ...(storedResume?.analysis.technicalSkills ?? []),
      ...(storedResume?.analysis.keywords?.present ?? []),
    ],
    [storedResume],
  )

  const campusCandidates = useMemo<RecommendationJob[]>(
    () => jobs
      .filter(job => job.jobType === 'Off-Campus' || job.collegeId === collegeId)
      .map(job => ({
        id: job.id,
        source: 'campus' as const,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: false,
        description: `${job.description} ${job.eligibility}`.trim(),
        employmentType: null,
        seniority: null,
        category: null,
        branches: job.branches,
        applyUrl: job.applicationLink && isHttpUrl(job.applicationLink) ? job.applicationLink.trim() : null,
        postedAt: job.createdAt,
      })),
    [jobs, collegeId],
  )

  const externalCandidates = useMemo<RecommendationJob[]>(
    () => external.jobs.map(job => ({
      id: job.id,
      source: 'external' as const,
      title: job.title,
      company: job.company,
      location: job.location,
      remote: job.remote,
      description: job.description,
      employmentType: job.employmentType,
      seniority: job.seniority,
      category: job.category,
      applyUrl: job.applyUrl,
      postedAt: job.postedAt,
    })),
    [external.jobs],
  )

  const candidates = useMemo(
    () => [...campusCandidates, ...externalCandidates],
    [campusCandidates, externalCandidates],
  )

  const outcome = useMemo(
    () => recommendJobs(
      candidates,
      {
        targetRole,
        skills,
        branch: studentBranch || null,
        // The profile does not store these preferences yet, so they are left
        // unscored rather than assuming a candidate wants remote/on-site work
        // in a particular city. Interview scores are deliberately not used as
        // an eligibility signal.
        preferredLocation: null,
        preferredWorkMode: null,
      },
      3,
    ),
    [candidates, targetRole, skills, studentBranch],
  )

  const hasTargetRole = Boolean(targetRole)
  const hasSkills = outcome.availability.skills
  const hasBranch = Boolean(studentBranch.trim())
  const hasAnySignal = outcome.hasSignals

  const providersFailed = Boolean(
    external.data?.providers.some(provider => provider.status !== 'ok'),
  )
  const allProvidersFailed = Boolean(
    external.data?.providers.length &&
    external.data.providers.every(provider => provider.status !== 'ok') &&
    external.jobs.length === 0,
  )
  const loadError = external.error
    ?? jobsError
    ?? (allProvidersFailed ? 'Some job sources could not be reached right now.' : null)
  const initialLoading = profileLoading ||
    (external.loading && !external.loaded) ||
    (jobsLoading && jobs.length === 0)
  const hasRecommendations = outcome.recommendations.length > 0
  const partialLoadFailure = Boolean(
    (loadError && hasRecommendations) ||
    (!loadError && providersFailed && external.jobs.length > 0),
  )

  const retry = () => {
    external.reload()
    onReloadJobs()
  }

  const openJobPortal = () => onNavigate('job-portal')
  const needsResumeSignal = !hasTargetRole || !hasSkills

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)]">
            <Sparkles size={14} className="text-[var(--accent-from)]" />
          </span>
          <h2 id="recommended-jobs-heading" className="truncate text-sm font-bold text-[var(--text-primary)]">
            Recommended Jobs for You
          </h2>
        </div>
        <button
          onClick={openJobPortal}
          className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-[11px] font-semibold text-[var(--accent-from)] transition-colors hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-from)]/40"
        >
          View all jobs <ChevronRight size={12} />
        </button>
      </div>

      {partialLoadFailure && (
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed flex items-center gap-1.5">
            <AlertCircle size={13} className="text-amber-600 flex-shrink-0" />
            {loadError ?? 'Some job sources could not be loaded. Results may be incomplete.'}
          </p>
          <button onClick={retry} className="text-[11px] font-semibold text-[var(--accent-from)] hover:underline">
            Retry
          </button>
        </div>
      )}

      {initialLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-[var(--text-secondary)]">
          <Loader2 size={15} className="animate-spin text-[var(--accent-from)]" />
          Loading job recommendations…
        </div>
      ) : hasRecommendations ? (
        <>
          <div className="space-y-2.5">
            {outcome.recommendations.map(({ job }) => {
              const isExternal = job.source === 'external'
              const rawApplyUrl = job.applyUrl?.trim() ?? ''
              const listingUrl = isHttpUrl(rawApplyUrl) ? rawApplyUrl : null
              const metadata = [
                job.company,
                job.location,
                job.remote ? 'Remote' : null,
                job.employmentType,
                job.source === 'campus' ? 'Campus drive' : null,
              ].filter(Boolean).join(' · ')
              const canApply = !isExternal || Boolean(listingUrl)

              return (
                <div
                  key={`${job.source}:${job.id}`}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5"
                >
                  <p
                    title={job.title}
                    className="line-clamp-2 break-words text-[13px] font-semibold leading-snug text-[var(--text-primary)]"
                  >
                    {job.title}
                  </p>
                  <p
                    title={metadata}
                    className="mt-1 truncate text-[11px] leading-tight text-[var(--text-muted)]"
                  >
                    {metadata}
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    {listingUrl ? (
                      <a
                        href={listingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${job.title} on the original listing (opens in a new tab)`}
                        className={secondaryActionClass}
                      >
                        View Job <ExternalLink size={12} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={openJobPortal}
                        aria-label={`View ${job.title} in the Job Portal`}
                        className={secondaryActionClass}
                      >
                        View Job <ChevronRight size={12} />
                      </button>
                    )}

                    {canApply && (
                      listingUrl ? (
                        <a
                          href={listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Apply for ${job.title} on the original listing (opens in a new tab)`}
                          className={primaryActionClass}
                        >
                          Apply Now <ArrowUpRight size={12} />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={openJobPortal}
                          aria-label={`Apply for ${job.title} in the Job Portal`}
                          className={primaryActionClass}
                        >
                          Apply Now <ArrowUpRight size={12} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {needsResumeSignal || !hasBranch ? (
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                {!hasTargetRole && !hasSkills
                  ? 'Add a target role and resume skills for sharper matches.'
                  : !hasTargetRole
                    ? 'Add a target role for sharper matches.'
                    : !hasSkills
                      ? 'Analyze your resume to match jobs against your skills.'
                      : 'Complete your profile for branch-based eligibility.'}
              </p>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                {needsResumeSignal && (
                  <button
                    onClick={() => onNavigate('resume')}
                    className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] text-[10px] font-semibold text-[var(--accent-from)] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-from)]/40"
                  >
                    Update Resume <ChevronRight size={10} />
                  </button>
                )}
                {!hasBranch && (
                  <button
                    onClick={() => onNavigate('profile-setup')}
                    className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] text-[10px] font-semibold text-[var(--accent-from)] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-from)]/40"
                  >
                    Complete Profile <ChevronRight size={10} />
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : loadError ? (
        <div className="flex flex-col items-center text-center gap-2.5 py-8">
          <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
            <AlertCircle size={20} className="text-[var(--accent-from)]" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)]">Could not load job recommendations</p>
          <p className="text-xs text-[var(--text-muted)] max-w-sm leading-relaxed">{loadError}</p>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Button size="sm" variant="secondary" onClick={retry}>
              <RefreshCw size={12} /> Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={openJobPortal}>Browse Job Portal</Button>
          </div>
        </div>
      ) : !hasAnySignal ? (
        <div className="flex flex-col items-center text-center gap-2.5 py-8">
          <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
            <Sparkles size={20} className="text-[var(--accent-from)]" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)]">Tell us what roles you want</p>
          <p className="text-xs text-[var(--text-muted)] max-w-sm leading-relaxed">
            Add a target job title and analyze your resume so recommendations can use real role, skill and branch data.
          </p>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Button size="sm" variant="secondary" onClick={() => onNavigate('resume')}>
              Add Target Role
            </Button>
            {!hasBranch && (
              <Button size="sm" variant="ghost" onClick={() => onNavigate('profile-setup')}>
                Complete Profile
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={openJobPortal}>Browse Jobs</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center gap-2.5 py-8">
          <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--accent-soft)] flex items-center justify-center">
            <Sparkles size={20} className="text-[var(--accent-from)]" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)]">No matching jobs right now</p>
          <p className="text-xs text-[var(--text-muted)] max-w-sm leading-relaxed">
            None of the currently loaded listings match your saved target role, resume skills or branch.
            Try updating your resume details or browse all jobs.
          </p>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Button size="sm" variant="secondary" onClick={() => onNavigate('resume')}>
              Update Resume Details
            </Button>
            <Button size="sm" variant="ghost" onClick={openJobPortal}>View all jobs</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
