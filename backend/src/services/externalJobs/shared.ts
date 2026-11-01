import {
  EXTERNAL_COUNTRIES,
  EXTERNAL_COUNTRY_LABELS,
  EXTERNAL_EMPLOYMENT_TYPES,
  EXTERNAL_SENIORITY_LEVELS,
  type ExternalCountry,
  type ExternalEmploymentType,
  type ExternalJob,
  type ExternalJobsParams,
  type ExternalSeniority,
} from './types.js'

export const EXTERNAL_RESULTS_PER_PAGE = 20
export const EXTERNAL_MAX_PAGE = 5
const MAX_QUERY_LENGTH = 120

type ParseResult =
  | { ok: true; value: ExternalJobsParams }
  | { ok: false; message: string }

const COUNTRY_MATCH_TERMS: Record<ExternalCountry, string[]> = {
  in: ['india', 'apac', 'asia', 'worldwide', 'anywhere'],
  gb: ['united kingdom', 'great britain', 'uk', 'europe', 'worldwide', 'anywhere'],
  us: ['united states', 'usa', 'u.s.', 'north america', 'americas', 'worldwide', 'anywhere'],
  ca: ['canada', 'north america', 'americas', 'worldwide', 'anywhere'],
  au: ['australia', 'apac', 'oceania', 'worldwide', 'anywhere'],
  sg: ['singapore', 'apac', 'asia', 'worldwide', 'anywhere'],
  nz: ['new zealand', 'apac', 'oceania', 'worldwide', 'anywhere'],
  za: ['south africa', 'africa', 'worldwide', 'anywhere'],
  de: ['germany', 'europe', 'emea', 'worldwide', 'anywhere'],
  fr: ['france', 'europe', 'emea', 'worldwide', 'anywhere'],
  nl: ['netherlands', 'europe', 'emea', 'worldwide', 'anywhere'],
  es: ['spain', 'europe', 'emea', 'worldwide', 'anywhere'],
  it: ['italy', 'europe', 'emea', 'worldwide', 'anywhere'],
  pl: ['poland', 'europe', 'emea', 'worldwide', 'anywhere'],
  ch: ['switzerland', 'europe', 'emea', 'worldwide', 'anywhere'],
  at: ['austria', 'europe', 'emea', 'worldwide', 'anywhere'],
  be: ['belgium', 'europe', 'emea', 'worldwide', 'anywhere'],
  br: ['brazil', 'latin america', 'south america', 'americas', 'worldwide', 'anywhere'],
  mx: ['mexico', 'latin america', 'north america', 'americas', 'worldwide', 'anywhere'],
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asScalarString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function asTimestamp(value: unknown): number | null {
  const numeric = asFiniteNumber(value)
  if (numeric !== null) {
    return Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

export function asIsoTimestamp(value: unknown): string | null {
  const timestamp = asTimestamp(value)
  if (timestamp === null) return null
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function readFirstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

function parseInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isExternalCountry(value: string): value is ExternalCountry {
  return (EXTERNAL_COUNTRIES as readonly string[]).includes(value)
}

function normalizeEmploymentType(value: string): ExternalEmploymentType | null {
  return (
    EXTERNAL_EMPLOYMENT_TYPES.find(
      type => type.toLowerCase() === value.trim().toLowerCase(),
    ) ?? null
  )
}

function normalizeSeniority(value: string): ExternalSeniority | null {
  return (
    EXTERNAL_SENIORITY_LEVELS.find(
      level => level.toLowerCase() === value.trim().toLowerCase(),
    ) ?? null
  )
}

export function parseExternalJobsQuery(input: Record<string, unknown>): ParseResult {
  const rawQuery = readFirstString(input.query) ?? ''
  const query = rawQuery.trim()
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, message: `Search text must be ${MAX_QUERY_LENGTH} characters or fewer.` }
  }

  const rawCountry = readFirstString(input.country)?.trim().toLowerCase()
  const country = rawCountry ? rawCountry : 'in'
  if (!isExternalCountry(country)) {
    return { ok: false, message: 'Unsupported country for remote jobs.' }
  }

  const rawEmploymentType = readFirstString(input.employmentType)?.trim() ?? ''
  const employmentType = rawEmploymentType ? normalizeEmploymentType(rawEmploymentType) : ''
  if (employmentType === null) {
    return { ok: false, message: 'Unsupported employment type.' }
  }

  const rawSeniority = readFirstString(input.seniority)?.trim() ?? ''
  const seniority = rawSeniority ? normalizeSeniority(rawSeniority) : ''
  if (seniority === null) {
    return { ok: false, message: 'Unsupported seniority level.' }
  }

  const rawPage = readFirstString(input.page)
  const page = rawPage === undefined ? 1 : parseInteger(rawPage)
  if (page === null || page < 1 || page > EXTERNAL_MAX_PAGE) {
    return { ok: false, message: `Page must be between 1 and ${EXTERNAL_MAX_PAGE}.` }
  }

  return {
    ok: true,
    value: {
      query,
      country,
      employmentType,
      seniority,
      page,
    },
  }
}

export function cleanText(value: string): string {
  const text = value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > 320 ? `${text.slice(0, 317).trimEnd()}…` : text
}

export function formatMoney(value: number, currency: string | null): string {
  const code = currency?.toUpperCase() ?? ''
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat('en', {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 0,
      }).format(value)
    } catch {
      // Fall through to the plain currency-code format below.
    }
  }
  return `${code ? `${code} ` : ''}${value.toLocaleString('en')}`
}

function salaryPeriodSuffix(period: string | null): string {
  const normalized = period?.toLowerCase()
  if (normalized === 'hourly' || normalized === 'hour') return '/hour'
  if (normalized === 'weekly' || normalized === 'week') return '/week'
  if (normalized === 'fortnightly') return '/fortnight'
  if (normalized === 'monthly' || normalized === 'month') return '/month'
  if (normalized === 'annual' || normalized === 'annually' || normalized === 'yearly' || normalized === 'year') {
    return '/year'
  }
  return ''
}

export function formatSalaryRange(
  minValue: unknown,
  maxValue: unknown,
  currencyValue: unknown,
  periodValue: unknown,
): string | null {
  const min = asFiniteNumber(minValue)
  const max = asFiniteNumber(maxValue)
  if (min === null && max === null) return null

  const currency = asScalarString(currencyValue)
  const suffix = salaryPeriodSuffix(asScalarString(periodValue))

  let text: string
  if (min !== null && max !== null) {
    text =
      min === max
        ? formatMoney(min, currency)
        : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`
  } else if (min !== null) {
    text = `From ${formatMoney(min, currency)}`
  } else {
    text = `Up to ${formatMoney(max as number, currency)}`
  }

  return `${text}${suffix}`
}

export function locationLabel(raw: Record<string, unknown>): string {
  const restrictions = Array.isArray(raw.locationRestrictions) ? raw.locationRestrictions : []
  const names: string[] = []
  for (const restriction of restrictions) {
    if (typeof restriction === 'string' && restriction.trim()) {
      names.push(restriction.trim())
      continue
    }
    const record = asRecord(restriction)
    const name = record ? asScalarString(record.name) : null
    if (name) names.push(name)
  }

  const unique = [...new Set(names)]
  if (unique.length === 0) return 'Worldwide'
  return unique.length > 4
    ? `${unique.slice(0, 4).join(', ')} +${unique.length - 4} more`
    : unique.join(', ')
}

export function joinList(value: unknown): string | null {
  const items = Array.isArray(value)
    ? value.map(item => asScalarString(item)).filter((item): item is string => item !== null)
    : []
  return items.length > 0 ? [...new Set(items)].join(' · ') : null
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function employmentMatches(jobValue: string, requested: string): boolean {
  const job = normalizeComparable(jobValue)
  const target = normalizeComparable(requested)
  if (!job || !target) return true
  if (target === 'full time') return job.includes('full time') || job === 'fulltime'
  if (target === 'part time') return job.includes('part time') || job === 'parttime'
  if (target === 'contractor') return job.includes('contract') || job.includes('freelance')
  if (target === 'temporary') return job.includes('temporary') || job.includes('temp')
  if (target === 'intern') return job.includes('intern')
  if (target === 'volunteer') return job.includes('volunteer')
  return job.includes(target) || target.includes(job)
}

function seniorityMatches(jobValue: string, requested: string): boolean {
  const job = normalizeComparable(jobValue)
  const target = normalizeComparable(requested)
  if (!job || !target) return true
  if (target === 'entry level') {
    return job.includes('entry') || job.includes('junior') || job.includes('graduate')
  }
  if (target === 'mid level') return job.includes('mid')
  if (target === 'senior') return job.includes('senior') || job.includes('sr')
  return job.includes(target) || target.includes(job)
}

function countryMatches(location: string, country: ExternalCountry): boolean {
  const text = normalizeComparable(location)
  if (!text) return false
  return COUNTRY_MATCH_TERMS[country].some(term => text.includes(normalizeComparable(term)))
}

export function jobMatchesFilters(job: ExternalJob, params: ExternalJobsParams): boolean {
  if (params.employmentType && job.employmentType && !employmentMatches(job.employmentType, params.employmentType)) {
    return false
  }
  if (params.employmentType && !job.employmentType) return false
  if (params.seniority && job.seniority && !seniorityMatches(job.seniority, params.seniority)) {
    return false
  }
  if (params.seniority && !job.seniority) return false

  if (!countryMatches(job.location, params.country)) return false

  if (!params.query) return true
  const query = params.query.toLowerCase()
  const haystack = [
    job.title,
    job.company,
    job.location,
    job.description,
    job.employmentType ?? '',
    job.seniority ?? '',
    job.category ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function filterExternalJobs(jobs: ExternalJob[], params: ExternalJobsParams): ExternalJob[] {
  return jobs.filter(job => jobMatchesFilters(job, params))
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase()
      if (lower.startsWith('utm_') || lower === 'gclid' || lower === 'fbclid') {
        url.searchParams.delete(key)
      }
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return null
  }
}

export function dedupeExternalJobs(jobs: ExternalJob[]): ExternalJob[] {
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()
  const unique: ExternalJob[] = []

  for (const job of jobs) {
    if (seenIds.has(job.id)) continue
    const url = canonicalUrl(job.applyUrl)
    if (url && seenUrls.has(url)) continue
    seenIds.add(job.id)
    if (url) seenUrls.add(url)
    unique.push(job)
  }

  return unique
}

export function sortByNewest(jobs: ExternalJob[]): ExternalJob[] {
  return [...jobs].sort((a, b) => {
    const aTime = a.postedAt ? Date.parse(a.postedAt) : Number.NaN
    const bTime = b.postedAt ? Date.parse(b.postedAt) : Number.NaN
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
    if (Number.isNaN(aTime)) return 1
    if (Number.isNaN(bTime)) return -1
    return bTime - aTime
  })
}

export function countryLabel(country: ExternalCountry): string {
  return EXTERNAL_COUNTRY_LABELS[country]
}
