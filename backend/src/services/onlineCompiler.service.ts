// OnlineCompiler.io execution client.
//
// Shared by the Coding Round and by Problem Solving (DSA) via
// `problemExecution.service.ts`: one client, one credential, one response
// contract, so the two features cannot drift apart.
//
// Contract (https://api.onlinecompiler.io/openapi.json):
//   POST {base}/api/run-code-sync/
//   Authorization: <bare API key>   (no `Bearer ` prefix)
//   { compiler, code, input?, time_limit? }
//   -> { output, error, status, exit_code, signal, truncated, time, total,
//        memory, time_limit, files, files_truncated }
//
// The provider answers HTTP 200 even when the program fails; callers must read
// `status` / `exit_code`. HTTP 429 means no run happened and nothing was
// charged. The key is read from the backend environment only.

import { env } from '../config/env.js'
import { compilerForLanguage, type CodingRoundLanguageId } from '../utils/codingRoundLanguages.js'

export type CodingProviderErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'auth'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'invalid_response'

export class CodingProviderError extends Error {
  readonly code: CodingProviderErrorCode
  /** Safe, provider-supplied detail. Never contains credentials. */
  readonly detail: string

  constructor(code: CodingProviderErrorCode, message: string, detail = '') {
    super(message)
    this.name = 'CodingProviderError'
    this.code = code
    this.detail = detail
  }
}

export interface CodingRunInput {
  language: CodingRoundLanguageId
  code: string
  input: string
  timeLimit: number
}

export interface CodingRunResult {
  output: string
  error: string
  status: 'success' | 'error'
  exitCode: number
  signal: number | null
  truncated: boolean
  time: string
  total: string
  memory: string
  timeLimit: number
  provider: 'onlinecompiler'
}

type FetchLike = typeof fetch

const RUN_PATH = '/api/run-code-sync/'
const MAX_DETAIL = 300

function safeDetail(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_DETAIL) : ''
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (!text) return ''
    try {
      const parsed = JSON.parse(text) as { error?: unknown }
      return safeDetail(parsed.error) || safeDetail(text)
    } catch {
      return safeDetail(text)
    }
  } catch {
    return ''
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeResult(raw: unknown, fallbackTimeLimit: number): CodingRunResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CodingProviderError('invalid_response', 'The code runner returned an unexpected response.')
  }
  const body = raw as Record<string, unknown>
  const status = body.status
  const exitCode = numberOrNull(body.exit_code)
  if ((status !== 'success' && status !== 'error') || exitCode === null) {
    throw new CodingProviderError('invalid_response', 'The code runner returned an incomplete result.')
  }

  return {
    output: typeof body.output === 'string' ? body.output : '',
    error: typeof body.error === 'string' ? body.error : '',
    status,
    exitCode,
    signal: numberOrNull(body.signal),
    truncated: body.truncated === true,
    time: typeof body.time === 'string' ? body.time : '',
    total: typeof body.total === 'string' ? body.total : '',
    memory: typeof body.memory === 'string' ? body.memory : '',
    timeLimit: numberOrNull(body.time_limit) ?? fallbackTimeLimit,
    provider: 'onlinecompiler',
  }
}

export async function runOnlineCompiler(
  input: CodingRunInput,
  fetchImpl: FetchLike = fetch,
): Promise<CodingRunResult> {
  if (!env.onlineCompilerApiKey) {
    throw new CodingProviderError(
      'not_configured',
      'Coding Round execution is not configured on this server.',
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.onlineCompilerTimeoutMs)

  let response: Response
  try {
    response = await fetchImpl(`${env.onlineCompilerApiUrl}${RUN_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: env.onlineCompilerApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        compiler: compilerForLanguage(input.language),
        code: input.code,
        input: input.input,
        time_limit: input.timeLimit,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new CodingProviderError('timeout', 'The code runner took too long to respond. Retry shortly.')
    }
    const detail = error instanceof Error ? safeDetail(error.message) : ''
    throw new CodingProviderError(
      'unavailable',
      'Could not reach the code runner. Check your connection and retry.',
      detail,
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response)
    if (response.status === 429) {
      throw new CodingProviderError(
        'rate_limited',
        'The code runner is busy right now. Wait a moment and retry.',
        detail,
      )
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new CodingProviderError(
        'auth',
        'The code runner rejected the server credentials. Contact support.',
        detail,
      )
    }
    if (response.status === 400) {
      throw new CodingProviderError(
        'invalid_request',
        'The code runner rejected this request. Check the code, language and input.',
        detail,
      )
    }
    throw new CodingProviderError(
      'unavailable',
      'The code runner is temporarily unavailable. Retry shortly.',
      detail,
    )
  }

  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    throw new CodingProviderError('invalid_response', 'The code runner returned an unreadable response.')
  }
  return normalizeResult(raw, input.timeLimit)
}
