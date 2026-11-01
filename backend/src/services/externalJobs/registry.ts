import { himalayasProvider } from './providers/himalayas.provider.js'
import { jobicyProvider } from './providers/jobicy.provider.js'
import type { ExternalProviderDefinition } from './types.js'

export const externalJobProviders: ExternalProviderDefinition[] = [
  himalayasProvider,
  jobicyProvider,
]
