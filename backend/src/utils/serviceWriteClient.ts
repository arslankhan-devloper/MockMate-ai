import type { Request } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdminClient } from '../services/supabase.js'

export function getServiceWriteClient(req: Request): SupabaseClient | null {
  if (req.supabaseWrite !== undefined) {
    return req.supabaseWrite
  }
  // In unit test mocks where a lightweight client is injected into req.supabase without
  // an auth administration module, fail closed when no mock writer is supplied.
  if (req.supabase && typeof (req.supabase as { auth?: unknown }).auth === 'undefined') {
    return null
  }
  return getSupabaseAdminClient()
}
