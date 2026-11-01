import {
  asRecord,
  asIsoTimestamp,
  asScalarString,
  cleanText,
  dedupeExternalJobs,
  filterExternalJobs,
  formatSalaryRange,
  isHttpUrl,
  joinList,
  EXTERNAL_RESULTS_PER_PAGE,
} from '../shared.js'
import type {
  ExternalJob,
  ExternalJobsParams,
  ExternalProviderDefinition,
  ExternalProviderResult,
  ExternalProviderStatus,
} from '../types.js'

const JOBICY_API_URL = 'https://jobicy.com/api/v2/remote-jobs'
const JOBICY_JOBS_URL = 'https://jobicy.com/jobs'
const JOBICY_SOURCE_URL = 'https://jobicy.com'
const CACHE_TTL_MS = 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 1
const TIMEOUT_MS = 10000
const FEED_SIZE = 200
const FEED_CACHE_KEY = 'jobicy:feed'

interface JobicyCacheEntry {
  expiresAt: number
  jobs: ExternalJob[]
}

class JobicyRequestError extends Error {
  constructor(
    readonly status: Exclude<ExternalProviderStatus, 'ok'>,
    readonly retryAfterSeconds: number | null,
    message: string,
  ) {
    super(message)
  }
}

const cache = new Map<string, JobicyCacheEntry>()
const inFlight = new Map<string, Promise<ExternalJob[]>>()
let rateLimitedUntil = 0

function buildProviderResult(
  status: ExternalProviderStatus,
  message: string | null,
  jobs: ExternalJob[] = [],
  total: number | null = null,
  cached = false,
): ExternalProviderResult {
  return {
    id: 'jobicy',
    label: 'Jobicy',
    status,
    message,
    searchUrl: JOBICY_JOBS_URL,
    attribution: { label: 'Jobicy', url: JOBICY_SOURCE_URL },
    jobs,
    total,
    cached,
  }
}

function buildApiUrl(): string {
  const url = new URL(JOBICY_API_URL)
  url.searchParams.set('count', String(FEED_SIZE))
  return url.toString()
}

function parseRetryAfter(value: string | null): number {
  if (!value) return 60
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60
}

function readCache(key: string): ExternalJob[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.jobs
}

function writeCache(key: string, jobs: ExternalJob[]): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, jobs })
}

export function mapJobicyJob(raw: unknown): ExternalJob | null {
  const job = asRecord(raw)
  if (!job) return null

  const id = asScalarString(job.id)
  const title = asScalarString(job.jobTitle)
  const applyUrl = asScalarString(job.url)
  if (!id || !title || !applyUrl || !isHttpUrl(applyUrl)) return null

  return {
    id: `jobicy:${id}`,
    provider: 'jobicy',
    title,
    company: asScalarString(job.companyName) ?? 'Company not specified',
    location: asScalarString(job.jobGeo) ?? 'Anywhere',
    remote: true,
    description: cleanText(
      asScalarString(job.jobExcerpt) ?? asScalarString(job.jobDescription) ?? '',
    ),
    salary: formatSalaryRange(
      job.salaryMin,
      job.salaryMax,
      job.salaryCurrency,
      job.salaryPeriod,
    ),
    employmentType: joinList(job.jobType),
    seniority: asScalarString(job.jobLevel),
    category: joinList(job.jobIndustry),
    postedAt: asIsoTimestamp(job.pubDate),
    applyUrl,
    sourceName: 'Jobicy',
    sourceUrl: JOBICY_SOURCE_URL,
    external: true,
  }
}

async function fetchJobicyFeed(): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(buildApiUrl(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
      throw new JobicyRequestError(
        'rate_limited',
        retryAfter,
        `Jobicy rate limit reached. Try again in ${retryAfter}s.`,
      )
    }

    if (response.status === 401) {
      throw new JobicyRequestError(
        'unauthorized',
        null,
        'Jobicy rejected the request. This integration uses keyless public access.',
      )
    }

    if (!response.ok) {
      throw new JobicyRequestError(
        'unavailable',
        null,
        'Jobicy could not be reached right now. Try again shortly.',
      )
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function loadJobicyFeed(): Promise<ExternalJob[]> {
  const payload = await fetchJobicyFeed()
  const record = asRecord(payload)
  if (!record || !Array.isArray(record.jobs)) {
    throw new JobicyRequestError(
      'unavailable',
      null,
      'Jobicy returned an unexpected response. Try again shortly.',
    )
  }

  const rawJobs: unknown[] = record.jobs
  return dedupeExternalJobs(
    rawJobs
      .map(raw => mapJobicyJob(raw))
      .filter((job): job is ExternalJob => job !== null),
  )
}

async function getFeed(): Promise<{ jobs: ExternalJob[]; cached: boolean }> {
  const cached = readCache(FEED_CACHE_KEY)
  if (cached) return { jobs: cached, cached: true }

  const existing = inFlight.get(FEED_CACHE_KEY)
  if (existing) return { jobs: await existing, cached: false }

  const task = loadJobicyFeed()
    .then(jobs => {
      writeCache(FEED_CACHE_KEY, jobs)
      return jobs
    })
    .finally(() => {
      inFlight.delete(FEED_CACHE_KEY)
    })

  inFlight.set(FEED_CACHE_KEY, task)
  return { jobs: await task, cached: false }
}

async function fetchJobs(params: ExternalJobsParams): Promise<ExternalProviderResult> {
  const rateLimitRemaining = Math.ceil((rateLimitedUntil - Date.now()) / 1000)
  if (rateLimitRemaining > 0) {
    return buildProviderResult(
      'rate_limited',
      `Jobicy rate limit reached. Try again in ${rateLimitRemaining}s.`,
    )
  }

  try {
    const feed = await getFeed()
    const filtered = filterExternalJobs(feed.jobs, params)
    const start = (params.page - 1) * EXTERNAL_RESULTS_PER_PAGE
    const jobs = filtered.slice(start, start + EXTERNAL_RESULTS_PER_PAGE)
    return buildProviderResult('ok', null, jobs, filtered.length, feed.cached)
  } catch (error) {
    if (error instanceof JobicyRequestError) {
      if (error.status === 'rate_limited') {
        const seconds = error.retryAfterSeconds ?? 60
        rateLimitedUntil = Date.now() + seconds * 1000
      }
      return buildProviderResult(error.status, error.message)
    }

    return buildProviderResult(
      'unavailable',
      'Jobicy could not be reached right now. Try again shortly.',
    )
  }
}

export const jobicyProvider: ExternalProviderDefinition = {
  id: 'jobicy',
  label: 'Jobicy',
  searchUrl: JOBICY_JOBS_URL,
  attribution: { label: 'Jobicy', url: JOBICY_SOURCE_URL },
  cacheTtlMs: CACHE_TTL_MS,
  fetchJobs,
}
