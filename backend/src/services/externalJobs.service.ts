import { externalJobProviders } from './externalJobs/registry.js'
import {
  EXTERNAL_MAX_PAGE,
  EXTERNAL_RESULTS_PER_PAGE,
  dedupeExternalJobs,
  filterExternalJobs,
  parseExternalJobsQuery,
  sortByNewest,
} from './externalJobs/shared.js'
import type {
  ExternalJobsParams,
  ExternalJobsResult,
  ExternalProvider,
  ExternalProviderDefinition,
  ExternalProviderResult,
} from './externalJobs/types.js'

export * from './externalJobs/types.js'
export {
  EXTERNAL_MAX_PAGE,
  EXTERNAL_RESULTS_PER_PAGE,
  dedupeExternalJobs,
  parseExternalJobsQuery,
}

function failedProviderResult(
  provider: ExternalProviderDefinition,
  error: unknown,
): ExternalProviderResult {
  const message =
    error instanceof Error && error.message
      ? `${provider.label} could not be reached right now. Try again shortly.`
      : `${provider.label} could not be reached right now. Try again shortly.`

  return {
    id: provider.id,
    label: provider.label,
    status: 'unavailable',
    message,
    searchUrl: provider.searchUrl,
    attribution: provider.attribution,
    jobs: [],
    total: null,
    cached: false,
  }
}

export async function collectExternalJobs(
  providers: ExternalProviderDefinition[],
  params: ExternalJobsParams,
): Promise<ExternalProviderResult[]> {
  const settled = await Promise.allSettled(
    providers.map(provider => provider.fetchJobs(params)),
  )

  return settled.map((outcome, index) => {
    const provider = providers[index]
    if (!provider) {
      throw new Error('External provider result is missing its definition.')
    }
    if (outcome.status === 'fulfilled') return outcome.value
    return failedProviderResult(provider, outcome.reason)
  })
}

function toPublicProvider(result: ExternalProviderResult): ExternalProvider {
  return {
    id: result.id,
    label: result.label,
    status: result.status,
    message: result.message,
    searchUrl: result.searchUrl,
    attribution: result.attribution,
  }
}

function aggregateResults(
  params: ExternalJobsParams,
  results: ExternalProviderResult[],
): ExternalJobsResult {
  const merged = sortByNewest(
    dedupeExternalJobs(filterExternalJobs(results.flatMap(result => result.jobs), params)),
  )

  const allProvidersSucceeded = results.every(result => result.status === 'ok')
  const providerTotals = results.map(result => result.total)
  const total =
    allProvidersSucceeded && providerTotals.every((value): value is number => value !== null)
      ? providerTotals.reduce((sum, value) => sum + value, 0)
      : null

  return {
    jobs: merged,
    providers: results.map(toPublicProvider),
    query: params.query,
    country: params.country,
    employmentType: params.employmentType,
    seniority: params.seniority,
    page: params.page,
    pageSize: EXTERNAL_RESULTS_PER_PAGE,
    maxPage: EXTERNAL_MAX_PAGE,
    total,
    totalIsEstimate: true,
    fetchedAt: new Date().toISOString(),
    cached: results.length > 0 && results.every(result => result.cached),
  }
}

export async function getExternalJobs(params: ExternalJobsParams): Promise<ExternalJobsResult> {
  const results = await collectExternalJobs(externalJobProviders, params)
  return aggregateResults(params, results)
}

export { aggregateResults as aggregateExternalJobs }
