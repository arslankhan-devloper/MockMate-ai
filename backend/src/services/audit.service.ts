import { getSupabaseAdminClient } from './supabase.js'

export interface AuditLogEntry {
  actorId: string | null
  actorRole: string
  action: string
  targetType: string
  targetId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}

export interface AuditLogRow {
  id: string
  actor_id: string | null
  actor_role: string
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

/**
 * Record an administrative or security event into public.audit_logs.
 * Uses the service role client since client roles (students, officers)
 * cannot insert into the audit_logs table.
 *
 * Failures to record audit logs are logged to stderr but never crash the request.
 */
export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  const adminClient = getSupabaseAdminClient()
  if (!adminClient) {
    console.warn('[audit] Supabase admin client unavailable; skipping audit record for action:', entry.action)
    return
  }

  try {
    const { error } = await adminClient.from('audit_logs').insert({
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
      ip_address: entry.ipAddress ?? null,
    })

    if (error) {
      console.error('[audit] Failed to write audit log:', error.message)
    }
  } catch (err) {
    console.error('[audit] Error writing audit log:', err)
  }
}

/**
 * Fetch paginated audit logs for the Super Admin panel.
 */
export async function fetchAuditLogs(options?: {
  limit?: number
  offset?: number
  action?: string
  targetType?: string
}): Promise<{ logs: AuditLogRow[]; total: number }> {
  const adminClient = getSupabaseAdminClient()
  if (!adminClient) {
    return { logs: [], total: 0 }
  }

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100)
  const offset = Math.max(options?.offset ?? 0, 0)

  let query = adminClient
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (options?.action) {
    query = query.eq('action', options.action)
  }
  if (options?.targetType) {
    query = query.eq('target_type', options.targetType)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[audit] Failed to fetch audit logs:', error.message)
    return { logs: [], total: 0 }
  }

  return {
    logs: (data ?? []) as AuditLogRow[],
    total: count ?? 0,
  }
}
