import type { Request } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdminClient } from '../services/supabase.js'

export function getServiceWriteClient(req: Request): SupabaseClient | null {
  return req.supabaseWrite ?? getSupabaseAdminClient()
}
