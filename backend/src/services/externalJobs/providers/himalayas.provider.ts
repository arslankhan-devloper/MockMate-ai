import { env } from '../../../config/env.js'
import {
  asFiniteNumber,
  asIsoTimestamp,
  asRecord,
  asScalarString,
  asTimestamp,
  cleanText,
  dedupeExternalJobs,
  filterExternalJobs,
  formatSalaryRange,
  isHttpUrl,
  joinList,
  locationLabel,
} from '../shared.js'
import type {
  ExternalJob,
  ExternalJobsParams,
  ExternalProviderDefinition,
  ExternalProviderResult,
  ExternalProviderStatus,
} from '../types.js'

const HIMALAYAS_SEARCH_URL = 'https://himalayas.app/jobs/api/search'
const HIMALAYAS_JOBS_URL = 'https://himalayas.app/jobs'
const HIMALAYAS_SOURCE_URL = 'https://himalayas.app'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 200
const MIN_INTERVAL_MS = 1500
const TIMEOUT_MS = 8000

interface HimalayasPayload {
  total: number | null
  jobs: unknown[]
}

interface CacheEntry {
  expiresAt: number
  result: ExternalProviderResult
}

class HimalayasRequestError extends Error {
  constructor(
    readonly status: Exclude<ExternalProviderStatus, 'ok'>,
    readonly retryAfterSeconds: number | null,
    message: string,
  ) {
    super(message)
  }
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<ExternalProviderResult>>()
let queue: Promise<void> = Promise.resolve()
let lastRequestAt = 0
let rateLimitedUntil = 0

function buildSearchUrl(params: ExternalJobsParams): string {
  const url = new URL(HIMALAYAS_SEARCH_URL)
  if (params.query) url.searchParams.set('q', params.query)
  if (params.country) url.searchParams.set('country', params.country.toUpperCase())
  if (params.employmentType) url.searchParams.set('employment_type', params.employmentType)
  if (params.seniority) url.searchParams.set('seniority', params.seniority)
  url.searchParams.set('sort', 'recent')
  url.searchParams.set('page', String(params.page))
  return url.toString()
}

function buildProviderResult(
  status: ExternalProviderStatus,
  message: string | null,
  jobs: ExternalJob[] = [],
  total: number | null = null,
  cached = false,
): ExternalProviderResult {
  return {
    id: 'himalayas',
    label: 'Himalayas',
    status,
    message,
    searchUrl: HIMALAYAS_JOBS_URL,
    attribution: { label: 'Himalayas', url: HIMALAYAS_SOURCE_URL },
    jobs,
    total,
    cached,
  }
}

function cacheKey(params: ExternalJobsParams): string {
  return [
    params.country,
    params.page,
    params.employmentType,
    params.seniority,
    params.query.toLowerCase(),
  ].join(':')
}

function readCache(key: string): ExternalProviderResult | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return { ...entry.result, cached: true }
}

function writeCache(key: string, result: ExternalProviderResult): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const waitMs = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (waitMs > 0) await delay(waitMs)
    lastRequestAt = Date.now()
    return task()
  })
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function parseRetryAfter(value: string | null): number {
  if (!value) return 60
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60
}

function categoryLabel(raw: Record<string, unknown>): string | null {
  return joinList(raw.categories) ?? joinList(raw.parentCategories)
}

export function mapHimalayasJob(raw: unknown): ExternalJob | null {
  const job = asRecord(raw)
  if (!job) return null

  const guid = asScalarString(job.guid)
  const title = asScalarString(job.title)
  const applyUrl = asScalarString(job.applicationLink)
  if (!guid || !title || !applyUrl || !isHttpUrl(applyUrl)) return null

  const expiry = asTimestamp(job.expiryDate)
  if (expiry !== null && expiry <= Date.now()) return null

  const excerpt = asScalarString(job.excerpt)
  const descriptionHtml = asScalarString(job.description)

  return {
    id: `himalayas:${guid}`,
    provider: 'himalayas',
    title,
    company: asScalarString(job.companyName) ?? 'Company not specified',
    location: locationLabel(job),
    remote: true,
    description: cleanText(excerpt ?? descriptionHtml ?? ''),
    salary: formatSalaryRange(
      job.minSalary,
      job.maxSalary,
      job.currency,
      job.salaryPeriod,
    ),
    employmentType: asScalarString(job.employmentType),
    seniority: joinList(job.seniority),
    category: categoryLabel(job),
    postedAt: asIsoTimestamp(job.pubDate),
    applyUrl,
    sourceName: 'Himalayas',
    sourceUrl: HIMALAYAS_SOURCE_URL,
    external: true,
  }
}

async function fetchHimalayas(params: ExternalJobsParams): Promise<HimalayasPayload> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (env.himalayasApiKey) headers.Authorization = `Bearer ${env.himalayasApiKey}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(buildSearchUrl(params), {
      method: 'GET',
      headers,
      signal: controller.signal,
    })

    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
      throw new HimalayasRequestError(
        'rate_limited',
        retryAfter,
        `Himalayas rate limit reached. Try again in ${retryAfter}s.`,
      )
    }

    if (response.status === 401) {
      throw new HimalayasRequestError(
        'unauthorized',
        null,
        'Himalayas rejected the configured API key. Check HIMALAYAS_API_KEY or remove it to use keyless access.',
      )
    }

    if (!response.ok) {
      throw new HimalayasRequestError(
        'unavailable',
        null,
        'Himalayas could not be reached right now. Try again shortly.',
      )
    }

    const payload: unknown = await response.json()
    const record = asRecord(payload)
    if (!record || !Array.isArray(record.jobs)) {
      throw new HimalayasRequestError(
        'unavailable',
        null,
        'Himalayas returned an unexpected response. Try again shortly.',
      )
    }

    return {
      total: asFiniteNumber(record.totalCount),
      jobs: record.jobs,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function loadHimalayasJobs(params: ExternalJobsParams): Promise<ExternalProviderResult> {
  const rateLimitRemaining = Math.ceil((rateLimitedUntil - Date.now()) / 1000)
  if (rateLimitRemaining > 0) {
    return buildProviderResult(
      'rate_limited',
      `Himalayas rate limit reached. Try again in ${rateLimitRemaining}s.`,
    )
  }

  try {
    const payload = await enqueue(() => fetchHimalayas(params))
    const jobs = filterExternalJobs(
      dedupeExternalJobs(
        payload.jobs
          .map(raw => mapHimalayasJob(raw))
          .filter((job): job is ExternalJob => job !== null),
      ),
      params,
    )
    return buildProviderResult('ok', null, jobs, payload.total)
  } catch (error) {
    if (error instanceof HimalayasRequestError) {
      if (error.status === 'rate_limited') {
        const seconds = error.retryAfterSeconds ?? 60
        rateLimitedUntil = Date.now() + seconds * 1000
      }
      return buildProviderResult(error.status, error.message)
    }

    return buildProviderResult(
      'unavailable',
      'Himalayas could not be reached right now. Try again shortly.',
    )
  }
}

async function fetchJobs(params: ExternalJobsParams): Promise<ExternalProviderResult> {
  const key = cacheKey(params)
  const cached = readCache(key)
  if (cached) return cached

  const existing = inFlight.get(key)
  if (existing) return existing

  const task = loadHimalayasJobs(params)
    .then(result => {
      if (result.status === 'ok') writeCache(key, result)
      return result
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, task)
  return task
}

export const himalayasProvider: ExternalProviderDefinition = {
  id: 'himalayas',
  label: 'Himalayas',
  searchUrl: HIMALAYAS_JOBS_URL,
  attribution: { label: 'Himalayas', url: HIMALAYAS_SOURCE_URL },
  cacheTtlMs: CACHE_TTL_MS,
  fetchJobs,
}
