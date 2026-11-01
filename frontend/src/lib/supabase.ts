// Reusable Supabase client for MockMate.
//
// Configuration is read from Vite environment variables so that no secrets are
// ever hard-coded in source:
//   VITE_SUPABASE_URL               — your project URL
//   VITE_SUPABASE_ANON_KEY          — legacy public "anon" key
//   VITE_SUPABASE_PUBLISHABLE_KEY   — newer public "publishable" key
//
// Only public client keys belong here. Never put a service-role / secret key in
// a `VITE_*` variable: Vite inlines those into the shipped bundle.
//
// When the variables are missing the client is intentionally `null` and the app
// keeps working (a development-time warning is logged once). UI that needs cloud
// data should check `getSupabaseClient()` instead of assuming a client exists.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
// Prefer the newer publishable key, falling back to the legacy anon key.
const publicKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let client: SupabaseClient | null = null

if (url && publicKey) {
  client = createClient(url, publicKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
} else if (import.meta.env.DEV) {
  // Development-time warning only. The app must still start without credentials.
  console.warn(
    '[MockMate] Supabase is not configured yet. Add VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) to ' +
      'frontend/.env.local — see SUPABASE_SETUP.md. ' +
      'The app will run with no cloud data until then.',
  )
}

/**
 * Returns the shared Supabase client, or `null` when the project has not been
 * configured yet. Prefer this over importing a client directly.
 */
export function getSupabaseClient(): SupabaseClient | null {
  return client
}

/** Convenience default export — `null` until the project is configured. */
export default client
