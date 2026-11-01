import type {
  ExternalJob,
  ExternalJobsResult,
  ExternalProvider,
  ExternalProviderId,
  ExternalProviderStatus,
} from '../data/externalJobs'
import { apiRequest } from './api'

export interface ExternalJobsRequest {
  query?: string
  country?: string
  employmentType?: string
  seniority?: string
  page?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function asProviderId(value: unknown): ExternalProviderId | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asProviderStatus(value: unknown): ExternalProviderStatus | null {
  if (
    value === 'ok' ||
    value === 'rate_limited' ||
    value === 'unauthorized' ||
    value === 'unavailable'
  ) {
    return value
  }
  return null
}

function normalizeJob(raw: unknown): ExternalJob | null {
  if (!isRecord(raw)) return null

  const id = asString(raw.id)
  const provider = asProviderId(raw.provider)
  const title = asString(raw.title)
  const company = asString(raw.company)
  const location = asString(raw.location)
  const applyUrl = asString(raw.applyUrl)
  const sourceName = asString(raw.sourceName)
  const sourceUrl = asString(raw.sourceUrl)

  if (
    !id ||
    !provider ||
    !title ||
    !company ||
    !location ||
    !applyUrl ||
    !isHttpUrl(applyUrl) ||
    !sourceName ||
    !sourceUrl ||
    !isHttpUrl(sourceUrl)
  ) {
    return null
  }

  return {
    id,
    provider,
    title,
    company,
    location,
    remote: raw.remote === true,
    description: asString(raw.description) ?? '',
    salary: asNullableString(raw.salary),
    employmentType: asNullableString(raw.employmentType),
    seniority: asNullableString(raw.seniority),
    category: asNullableString(raw.category),
    postedAt: asNullableString(raw.postedAt),
    applyUrl,
    sourceName,
    sourceUrl,
    external: true,
  }
}

function normalizeProvider(raw: unknown): ExternalProvider | null {
  if (!isRecord(raw)) return null

  const id = asProviderId(raw.id)
  const label = asString(raw.label)
  const status = asProviderStatus(raw.status)
  if (!id || !label || !status) return null

  const attribution = isRecord(raw.attribution)
    ? {
        label: asString(raw.attribution.label) ?? label,
        url: asString(raw.attribution.url) ?? '',
      }
    : null
  const searchUrl = asNullableString(raw.searchUrl)

  return {
    id,
    label,
    status,
    message: asNullableString(raw.message),
    searchUrl: searchUrl && isHttpUrl(searchUrl) ? searchUrl : null,
    attribution:
      attribution && isHttpUrl(attribution.url)
        ? { label: attribution.label, url: attribution.url }
        : null,
  }
}

export async function listExternalJobs(
  accessToken: string,
  request: ExternalJobsRequest = {},
): Promise<ExternalJobsResult> {
  const search = new URLSearchParams()
  if (request.query?.trim()) search.set('query', request.query.trim())
  if (request.country) search.set('country', request.country)
  if (request.employmentType) search.set('employmentType', request.employmentType)
  if (request.seniority) search.set('seniority', request.seniority)
  if (request.page && request.page > 1) search.set('page', String(request.page))

  const queryString = search.toString()
  const raw = await apiRequest<unknown>(
    `/api/jobs/external${queryString ? `?${queryString}` : ''}`,
    { accessToken },
  )
  const payload = isRecord(raw) ? raw : {}

  return {
    jobs: Array.isArray(payload.jobs)
      ? payload.jobs.map(normalizeJob).filter((job): job is ExternalJob => job !== null)
      : [],
    providers: Array.isArray(payload.providers)
      ? payload.providers
          .map(normalizeProvider)
          .filter((provider): provider is ExternalProvider => provider !== null)
      : [],
    query: asString(payload.query) ?? '',
    country: asString(payload.country) ?? request.country ?? 'in',
    employmentType: asString(payload.employmentType) ?? request.employmentType ?? '',
    seniority: asString(payload.seniority) ?? request.seniority ?? '',
    page: asNumber(payload.page) ?? request.page ?? 1,
    pageSize: asNumber(payload.pageSize) ?? 20,
    maxPage: asNumber(payload.maxPage) ?? 5,
    total: asNumber(payload.total),
    totalIsEstimate: payload.totalIsEstimate === true,
    fetchedAt: asString(payload.fetchedAt) ?? new Date().toISOString(),
    cached: payload.cached === true,
  }
}
