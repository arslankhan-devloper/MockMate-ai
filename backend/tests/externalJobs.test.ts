import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateExternalJobs, collectExternalJobs } from '../src/services/externalJobs.service.js'
import { dedupeExternalJobs, jobMatchesFilters } from '../src/services/externalJobs/shared.js'
import { mapHimalayasJob } from '../src/services/externalJobs/providers/himalayas.provider.js'
import { mapJobicyJob } from '../src/services/externalJobs/providers/jobicy.provider.js'
import type {
  ExternalJob,
  ExternalJobsParams,
  ExternalProviderDefinition,
  ExternalProviderResult,
} from '../src/services/externalJobs/types.js'

const params: ExternalJobsParams = {
  query: '',
  country: 'in',
  employmentType: '',
  seniority: '',
  page: 1,
}

function baseJob(overrides: Partial<ExternalJob> = {}): ExternalJob {
  return {
    id: 'himalayas:1',
    provider: 'himalayas',
    title: 'Software Engineer',
    company: 'Acme',
    location: 'India',
    remote: true,
    description: 'Build things',
    salary: null,
    employmentType: 'Full Time',
    seniority: 'Mid-level',
    category: 'Engineering',
    postedAt: '2026-10-01T00:00:00.000Z',
    applyUrl: 'https://example.com/jobs/1',
    sourceName: 'Himalayas',
    sourceUrl: 'https://himalayas.app',
    external: true,
    ...overrides,
  }
}

test('normalizes a Himalayas listing into the common job shape', () => {
  const job = mapHimalayasJob({
    guid: 'abc-123',
    title: 'Backend Engineer',
    companyName: 'Example Co',
    locationRestrictions: ['India', 'Worldwide'],
    applicationLink: 'https://example.com/careers/backend?utm_source=himalayas',
    excerpt: '<p>Build APIs &amp; services.</p>',
    employmentType: 'Full Time',
    seniority: ['Mid-level'],
    categories: ['Software Engineering'],
    pubDate: '2026-10-02T08:30:00.000Z',
    minSalary: 100000,
    maxSalary: 150000,
    currency: 'USD',
    salaryPeriod: 'annual',
  })

  assert.ok(job)
  assert.equal(job.id, 'himalayas:abc-123')
  assert.equal(job.provider, 'himalayas')
  assert.equal(job.title, 'Backend Engineer')
  assert.equal(job.company, 'Example Co')
  assert.equal(job.location, 'India, Worldwide')
  assert.equal(job.description, 'Build APIs & services.')
  assert.equal(job.employmentType, 'Full Time')
  assert.equal(job.seniority, 'Mid-level')
  assert.equal(job.category, 'Software Engineering')
  assert.equal(job.postedAt, '2026-10-02T08:30:00.000Z')
  assert.equal(job.salary, '$100,000 – $150,000/year')
  assert.equal(job.applyUrl, 'https://example.com/careers/backend?utm_source=himalayas')
  assert.equal(job.sourceName, 'Himalayas')
  assert.equal(job.external, true)
})

test('normalizes a Jobicy listing into the common job shape', () => {
  const job = mapJobicyJob({
    id: 987,
    url: 'https://jobicy.com/jobs/987-backend-engineer',
    jobTitle: 'Backend Engineer',
    companyName: 'Example Co',
    jobGeo: 'India',
    jobIndustry: ['Engineering'],
    jobType: ['Full-Time'],
    jobLevel: 'Senior',
    jobExcerpt: 'Build platforms.',
    jobDescription: '<p>Build platforms.</p>',
    pubDate: '2026-10-03T10:00:00.000Z',
  })

  assert.ok(job)
  assert.equal(job.id, 'jobicy:987')
  assert.equal(job.provider, 'jobicy')
  assert.equal(job.location, 'India')
  assert.equal(job.description, 'Build platforms.')
  assert.equal(job.employmentType, 'Full-Time')
  assert.equal(job.seniority, 'Senior')
  assert.equal(job.category, 'Engineering')
  assert.equal(job.applyUrl, 'https://jobicy.com/jobs/987-backend-engineer')
  assert.equal(job.sourceName, 'Jobicy')
})

test('rejects listings whose view/apply link is not an absolute HTTP(S) URL', () => {
  const himalayas = mapHimalayasJob({
    guid: 'bad-link',
    title: 'Backend Engineer',
    applicationLink: 'javascript:alert(1)',
  })
  const jobicy = mapJobicyJob({
    id: 1,
    jobTitle: 'Backend Engineer',
    url: '/relative/apply',
  })

  assert.equal(himalayas, null)
  assert.equal(jobicy, null)
})

test('deduplicates by stable provider ID and canonical URL', () => {
  const original = baseJob()
  const duplicateId = baseJob({ applyUrl: 'https://example.com/other' })
  const duplicateUrl = baseJob({
    id: 'himalayas:2',
    applyUrl: 'https://example.com/jobs/1/?utm_source=feed&utm_campaign=test',
  })
  const unique = baseJob({
    id: 'jobicy:3',
    provider: 'jobicy',
    applyUrl: 'https://example.org/jobs/3',
  })

  const deduped = dedupeExternalJobs([original, duplicateId, duplicateUrl, unique])
  assert.equal(deduped.length, 2)
  assert.deepEqual(deduped.map(job => job.id), ['himalayas:1', 'jobicy:3'])
})

test('filters combined results by search, country, employment type and seniority', () => {
  const matching = baseJob()
  const wrongCountry = baseJob({ id: 'himalayas:2', location: 'Germany' })
  const wrongType = baseJob({ id: 'himalayas:3', employmentType: 'Part Time' })
  const wrongSeniority = baseJob({ id: 'himalayas:4', seniority: 'Senior' })
  const queryParams: ExternalJobsParams = {
    ...params,
    query: 'acme',
    employmentType: 'Full Time',
    seniority: 'Mid-level',
  }

  assert.equal(jobMatchesFilters(matching, queryParams), true)
  assert.equal(jobMatchesFilters(wrongCountry, queryParams), false)
  assert.equal(jobMatchesFilters(wrongType, queryParams), false)
  assert.equal(jobMatchesFilters(wrongSeniority, queryParams), false)
})

test('one failing provider does not remove another provider results', async () => {
  const goodJob = baseJob()
  const goodProvider: ExternalProviderDefinition = {
    id: 'himalayas',
    label: 'Himalayas',
    searchUrl: 'https://himalayas.app/jobs',
    attribution: { label: 'Himalayas', url: 'https://himalayas.app' },
    cacheTtlMs: 1000,
    fetchJobs: async (): Promise<ExternalProviderResult> => ({
      id: 'himalayas',
      label: 'Himalayas',
      status: 'ok',
      message: null,
      searchUrl: 'https://himalayas.app/jobs',
      attribution: { label: 'Himalayas', url: 'https://himalayas.app' },
      jobs: [goodJob],
      total: 1,
      cached: false,
    }),
  }
  const failingProvider: ExternalProviderDefinition = {
    id: 'jobicy',
    label: 'Jobicy',
    searchUrl: 'https://jobicy.com/jobs',
    attribution: { label: 'Jobicy', url: 'https://jobicy.com' },
    cacheTtlMs: 1000,
    fetchJobs: async () => {
      throw new Error('upstream down')
    },
  }

  const providerResults = await collectExternalJobs([goodProvider, failingProvider], params)
  const combined = aggregateExternalJobs(params, providerResults)

  assert.equal(providerResults[0]?.status, 'ok')
  assert.equal(providerResults[1]?.status, 'unavailable')
  assert.match(providerResults[1]?.message ?? '', /Jobicy could not be reached/)
  assert.equal(combined.jobs.length, 1)
  assert.equal(combined.jobs[0]?.id, 'himalayas:1')
  assert.deepEqual(combined.providers.map(provider => provider.id), ['himalayas', 'jobicy'])
  assert.deepEqual(combined.providers.map(provider => provider.status), ['ok', 'unavailable'])
  assert.equal(combined.total, null)
})
