// Thin, typed wrapper around the MockMate backend API.
//
// The backend verifies the Supabase access token on every protected request, so
// callers pass the current session's access token. No privileged key lives in
// the browser.

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:4000'

/** Backend API base URL, without a trailing slash. */
export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '')

interface ApiErrorPayload {
  error?: unknown
  code?: unknown
  fields?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string>

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  accessToken?: string | null
  body?: unknown
  signal?: AbortSignal
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asFields(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(
      0,
      'network_error',
      'Could not reach the MockMate server. Make sure the backend is running.',
    )
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const p = (payload ?? {}) as ApiErrorPayload
    const code = asString(p.code) ?? `http_${response.status}`
    const message = asString(p.error) ?? `Request failed (${response.status}).`
    throw new ApiError(response.status, code, message, asFields(p.fields))
  }

  return payload as T
}
