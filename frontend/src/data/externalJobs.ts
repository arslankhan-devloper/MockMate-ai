export type ExternalProviderId = string
export type ExternalProviderStatus = 'ok' | 'rate_limited' | 'unauthorized' | 'unavailable'

export interface ExternalJob {
  id: string
  provider: ExternalProviderId
  title: string
  company: string
  location: string
  remote: boolean
  description: string
  salary: string | null
  employmentType: string | null
  seniority: string | null
  category: string | null
  postedAt: string | null
  applyUrl: string
  sourceName: string
  sourceUrl: string
  external: true
}

export interface ExternalProvider {
  id: ExternalProviderId
  label: string
  status: ExternalProviderStatus
  message: string | null
  searchUrl: string | null
  attribution: { label: string; url: string } | null
}

export interface ExternalJobsResult {
  jobs: ExternalJob[]
  providers: ExternalProvider[]
  query: string
  country: string
  employmentType: string
  seniority: string
  page: number
  pageSize: number
  maxPage: number
  total: number | null
  totalIsEstimate: boolean
  fetchedAt: string
  cached: boolean
}

export interface ExternalCountryOption {
  code: string
  label: string
}

export const externalCountryOptions: ExternalCountryOption[] = [
  { code: 'in', label: 'India' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'us', label: 'United States' },
  { code: 'ca', label: 'Canada' },
  { code: 'au', label: 'Australia' },
  { code: 'sg', label: 'Singapore' },
  { code: 'nz', label: 'New Zealand' },
  { code: 'za', label: 'South Africa' },
  { code: 'de', label: 'Germany' },
  { code: 'fr', label: 'France' },
  { code: 'nl', label: 'Netherlands' },
  { code: 'es', label: 'Spain' },
  { code: 'it', label: 'Italy' },
  { code: 'pl', label: 'Poland' },
  { code: 'ch', label: 'Switzerland' },
  { code: 'at', label: 'Austria' },
  { code: 'be', label: 'Belgium' },
  { code: 'br', label: 'Brazil' },
  { code: 'mx', label: 'Mexico' },
]

export const externalEmploymentTypes = [
  'Full Time',
  'Part Time',
  'Contractor',
  'Temporary',
  'Intern',
  'Volunteer',
  'Other',
]

export const externalEmploymentOptions = ['All Employment Types', ...externalEmploymentTypes]

export const externalSeniorityLevels = [
  'Entry-level',
  'Mid-level',
  'Senior',
  'Manager',
  'Director',
  'Executive',
]

export const externalSeniorityOptions = ['All Seniority Levels', ...externalSeniorityLevels]

export function externalCountryLabel(code: string): string {
  return externalCountryOptions.find(option => option.code === code)?.label ?? 'India'
}

export function externalCountryCode(label: string): string {
  return externalCountryOptions.find(option => option.label === label)?.code ?? 'in'
}

export function externalFilterValue(label: string, allLabel: string): string {
  return label === allLabel ? '' : label
}

export function formatExternalPosted(iso: string | null): string {
  if (!iso) return 'Date not provided'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Date not provided'

  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (diffDays <= 0) return 'Posted today'
  if (diffDays === 1) return 'Posted yesterday'
  if (diffDays < 7) return `Posted ${diffDays} days ago`
  return `Posted ${date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`
}

export function formatExternalFetchedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}
