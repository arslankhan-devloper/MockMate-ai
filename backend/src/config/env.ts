import 'dotenv/config'

function readString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function parseOrigins(value: string | undefined): string[] {
  const raw = readString(value) ?? 'http://localhost:8443'
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(readString(value) ?? '4000', 10)
  return Number.isNaN(parsed) ? 4000 : parsed
}

const supabaseUrl = readString(process.env.SUPABASE_URL)
const supabasePublicKey =
  readString(process.env.SUPABASE_PUBLISHABLE_KEY) ?? readString(process.env.SUPABASE_ANON_KEY)
// Backend-only privileged key. Used for Auth admin operations, account-deletion
// maintenance, and writes to server-authoritative tables after authorization.
// It is never sent to the browser. Prefer the new secret key when issued.
const supabaseServiceRoleKey =
  readString(process.env.SUPABASE_SERVICE_ROLE_KEY) ?? readString(process.env.SUPABASE_SECRET_KEY)

// Groq powers server-side resume analysis. The API key is a secret and is only
// ever read here on the backend; it is never sent to the browser or logged.
const groqApiKey = readString(process.env.GROQ_API_KEY)
// Model used for structured analysis. The configured GROQ_MODEL wins; the
// fallback is a currently supported Groq production model suited to structured
// JSON output (see backend/.env.example for details).
const groqModel = readString(process.env.GROQ_MODEL) ?? 'openai/gpt-oss-120b'
const groqBaseUrl = (readString(process.env.GROQ_API_URL) ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, '')

// External job providers are configured on the backend only. Himalayas' public
// API works without a key; a key only raises rate limits and is optional.
// Jobicy uses its keyless public API, so it needs no environment variable.
const himalayasApiKey = readString(process.env.HIMALAYAS_API_KEY)

// Problem Solving executes code through OnlineCompiler.io, reusing the same
// client, key, base URL and timeout as the Coding Round (see the block below).
// NOTE: the legacy Piston variables are still read for backward compatibility
// with existing deployments but are no longer used by the DSA executor.
const codeExecutionUrl = (
  readString(process.env.CODE_EXECUTION_URL) ?? 'https://emkc.org/api/v2/piston'
).replace(/\/+$/, '')
const codeExecutionApiKey = readString(process.env.CODE_EXECUTION_API_KEY)
const codeExecutionTimeoutMs = Number.parseInt(
  readString(process.env.CODE_EXECUTION_TIMEOUT_MS) ?? '15000',
  10,
)

// Hidden tests and reference approaches are encrypted at rest with this
// backend-only secret. In development the Groq key is used as fallback key
// material; production deployments must set a dedicated secret. Public
// Supabase keys are never accepted as encryption material.
const problemTestSecret =
  readString(process.env.PROBLEM_TEST_SECRET) ?? groqApiKey ?? ''

// Coding Round (interview module) and Problem Solving (DSA) both execute code
// through OnlineCompiler.io using this single configuration.
// The key is a backend-only secret and is sent as the bare Authorization value
// (the provider does not accept a `Bearer ` prefix).
const onlineCompilerApiKey = readString(process.env.ONLINECOMPILER_API_KEY)
const onlineCompilerApiUrl = (
  readString(process.env.ONLINECOMPILER_API_URL) ?? 'https://api.onlinecompiler.io'
).replace(/\/+$/, '')
const onlineCompilerTimeoutMs = Number.parseInt(
  readString(process.env.ONLINECOMPILER_TIMEOUT_MS) ?? '32000',
  10,
)

export const env = {
  nodeEnv: readString(process.env.NODE_ENV) ?? 'development',
  port: parsePort(process.env.PORT),
  frontendOrigins: parseOrigins(process.env.FRONTEND_ORIGIN),
  supabaseUrl,
  supabasePublicKey,
  supabaseServiceRoleKey,
  supabaseConfigured: Boolean(supabaseUrl && supabasePublicKey),
  supabaseAdminConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey),
  groqApiKey,
  groqModel,
  groqBaseUrl,
  groqConfigured: Boolean(groqApiKey),
  himalayasApiKey,
  codeExecutionUrl,
  codeExecutionApiKey,
  codeExecutionTimeoutMs: Number.isFinite(codeExecutionTimeoutMs)
    ? Math.min(Math.max(codeExecutionTimeoutMs, 1000), 60000)
    : 15000,
  problemTestSecret,
  onlineCompilerApiKey,
  onlineCompilerApiUrl,
  onlineCompilerConfigured: Boolean(onlineCompilerApiKey),
  // The synchronous endpoint has a 30s request cap, so a slightly larger local
  // timeout lets the provider's own error surface instead of hanging the API.
  onlineCompilerTimeoutMs: Number.isFinite(onlineCompilerTimeoutMs)
    ? Math.min(Math.max(onlineCompilerTimeoutMs, 5000), 45000)
    : 32000,
} as const
