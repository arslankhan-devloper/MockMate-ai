export const EXTERNAL_COUNTRIES = [
  'in',
  'gb',
  'us',
  'ca',
  'au',
  'sg',
  'nz',
  'za',
  'de',
  'fr',
  'nl',
  'es',
  'it',
  'pl',
  'ch',
  'at',
  'be',
  'br',
  'mx',
] as const

export type ExternalCountry = (typeof EXTERNAL_COUNTRIES)[number]

export const EXTERNAL_COUNTRY_LABELS: Record<ExternalCountry, string> = {
  in: 'India',
  gb: 'United Kingdom',
  us: 'United States',
  ca: 'Canada',
  au: 'Australia',
  sg: 'Singapore',
  nz: 'New Zealand',
  za: 'South Africa',
  de: 'Germany',
  fr: 'France',
  nl: 'Netherlands',
  es: 'Spain',
  it: 'Italy',
  pl: 'Poland',
  ch: 'Switzerland',
  at: 'Austria',
  be: 'Belgium',
  br: 'Brazil',
  mx: 'Mexico',
}

export const EXTERNAL_EMPLOYMENT_TYPES = [
  'Full Time',
  'Part Time',
  'Contractor',
  'Temporary',
  'Intern',
  'Volunteer',
  'Other',
] as const

export type ExternalEmploymentType = (typeof EXTERNAL_EMPLOYMENT_TYPES)[number]

export const EXTERNAL_SENIORITY_LEVELS = [
  'Entry-level',
  'Mid-level',
  'Senior',
  'Manager',
  'Director',
  'Executive',
] as const

export type ExternalSeniority = (typeof EXTERNAL_SENIORITY_LEVELS)[number]

export type ExternalProviderId = 'himalayas' | 'jobicy'
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
  country: ExternalCountry
  employmentType: ExternalEmploymentType | ''
  seniority: ExternalSeniority | ''
  page: number
  pageSize: number
  maxPage: number
  total: number | null
  totalIsEstimate: boolean
  fetchedAt: string
  cached: boolean
}

export interface ExternalJobsParams {
  query: string
  country: ExternalCountry
  employmentType: ExternalEmploymentType | ''
  seniority: ExternalSeniority | ''
  page: number
}

export interface ExternalProviderResult {
  id: ExternalProviderId
  label: string
  status: ExternalProviderStatus
  message: string | null
  searchUrl: string | null
  attribution: { label: string; url: string } | null
  jobs: ExternalJob[]
  total: number | null
  cached: boolean
}

export interface ExternalProviderDefinition {
  id: ExternalProviderId
  label: string
  searchUrl: string
  attribution: { label: string; url: string }
  cacheTtlMs: number
  fetchJobs: (params: ExternalJobsParams) => Promise<ExternalProviderResult>
}
