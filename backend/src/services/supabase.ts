import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const

// Shared, unauthenticated client. Used only to validate access tokens against
// Supabase Auth. It carries no user session and no privileged key.
const anonClient: SupabaseClient | null = env.supabaseConfigured
  ? createClient(env.supabaseUrl as string, env.supabasePublicKey as string, clientOptions)
  : null

export function getSupabaseClient(): SupabaseClient | null {
  return anonClient
}

// Privileged client for explicit administrative operations and writes to
// server-authoritative tables after the handler has verified ownership or role.
// It is created lazily and only when the backend-only service key is configured.
// Never import this from frontend code and never use it without server-side
// authorization checks.
let adminClient: SupabaseClient | null = null
let adminClientInitialized = false

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (adminClientInitialized) return adminClient
  adminClientInitialized = true
  if (!env.supabaseAdminConfigured) return null
  adminClient = createClient(
    env.supabaseUrl as string,
    env.supabaseServiceRoleKey as string,
    clientOptions,
  )
  return adminClient
}

// Verify a password without trusting a refreshed access token. Uses a temporary
// public client so the caller's token is not modified. The password is used only
// for this call and is never logged or persisted.
export async function verifyAccountPassword(
  email: string,
  password: string,
  expectedUserId: string,
): Promise<boolean> {
  if (!env.supabaseConfigured || !email || !password) return false
  const client = createClient(env.supabaseUrl as string, env.supabasePublicKey as string, {
    ...clientOptions,
  })
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.user || data.user.id !== expectedUserId) return false
    return true
  } catch {
    return false
  } finally {
    // Best-effort local cleanup only. The resulting server session is revoked
    // when the account is deleted; on failure it is discarded with this client.
    try {
      await client.auth.signOut({ scope: 'local' })
    } catch {
      // Ignore cleanup failures.
    }
  }
}

// Create a client scoped to a single caller's access token. Every query made
// through it runs under that user's identity, so Row Level Security applies and
// privileged access is never granted implicitly.
export function createUserClient(accessToken: string): SupabaseClient {
  if (!env.supabaseConfigured) {
    throw new Error('Supabase is not configured')
  }

  return createClient(env.supabaseUrl as string, env.supabasePublicKey as string, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}
