import type { SupabaseClient } from '@supabase/supabase-js'

export const ACCOUNT_DELETION_CONFIRMATION = 'DELETE MY ACCOUNT'
export const ACCOUNT_DELETION_RETENTION_DAYS = 30

export type AccountDeletionErrorCode =
  | 'account_deletion_unavailable'
  | 'account_deletion_failed'

export class AccountDeletionError extends Error {
  readonly code: AccountDeletionErrorCode
  readonly retryable: boolean

  constructor(code: AccountDeletionErrorCode, message: string, retryable = true) {
    super(message)
    this.name = 'AccountDeletionError'
    this.code = code
    this.retryable = retryable
  }
}

export interface DeletionResult {
  ok: boolean
  errorCode?: string
  missingRelation?: boolean
}

export interface AccountDeletionGateway {
  createRequest(userId: string): Promise<string>
  recordStep(
    requestId: string,
    step: string,
    resources: Record<string, string>,
  ): Promise<void>
  markCompleted(requestId: string): Promise<void>
  markFailed(requestId: string, step: string, errorCode: string): Promise<void>
  deleteOwnedRows(table: string, userId: string): Promise<DeletionResult>
  deleteAuthUser(userId: string): Promise<DeletionResult>
}

interface OwnedDataStep {
  table: string
  optional: boolean
}

// Delete children before parents. Interview turns/evaluations cascade from the
// session; problem questions/submissions cascade from their session as well, but
// are listed explicitly so a retry and the audit trail show each resource.
//
// `campus_jobs` and `colleges` are deliberately absent: they are institution-
// owned. Deleting the Auth user sets `campus_jobs.posted_by` to null without
// removing the college's posting. The `profiles` row is removed by the Auth
// deletion cascade, only after every owned data table has been cleared.
export const OWNED_DATA_STEPS: readonly OwnedDataStep[] = [
  { table: 'job_applications', optional: false },
  { table: 'interview_sessions', optional: false },
  { table: 'roadmap_topic_progress', optional: true },
  { table: 'roadmap_ai_plans', optional: true },
  { table: 'roadmap_topic_resources', optional: true },
  { table: 'problem_submissions', optional: true },
  { table: 'problem_questions', optional: true },
  { table: 'problem_sessions', optional: true },
  { table: 'problem_topic_progress', optional: true },
]

function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code)) return code
  }
  return 'unknown_error'
}

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message ?? '') ||
    /could not find the table .*schema cache/i.test(error.message ?? '')
  )
}

export function createSupabaseDeletionGateway(
  admin: SupabaseClient,
): AccountDeletionGateway {
  return {
    async createRequest(userId) {
      const { data, error } = await admin
        .from('account_deletion_requests')
        .insert({ user_id: userId, status: 'deleting', started_at: new Date().toISOString() })
        .select('id')
        .single()
      if (error || !data) {
        throw new AccountDeletionError(
          'account_deletion_unavailable',
          'Account deletion tracking is not configured.',
        )
      }
      return String((data as { id: unknown }).id)
    },

    async recordStep(requestId, step, resources) {
      const { error } = await admin
        .from('account_deletion_requests')
        .update({ last_step: step, deleted_resources: resources })
        .eq('id', requestId)
      if (error) {
        throw new AccountDeletionError(
          'account_deletion_failed',
          'Could not update the deletion status.',
        )
      }
    },

    async markCompleted(requestId) {
      const { error } = await admin
        .from('account_deletion_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString(), last_step: 'auth' })
        .eq('id', requestId)
      if (error) throw error
    },

    async markFailed(requestId, step, errorCode) {
      const { error } = await admin
        .from('account_deletion_requests')
        .update({ status: 'failed', last_step: step, last_error: errorCode })
        .eq('id', requestId)
      if (error) throw error
    },

    async deleteOwnedRows(table, userId) {
      const { error } = await admin.from(table).delete().eq('student_id', userId)
      if (!error) return { ok: true }
      return {
        ok: false,
        errorCode: safeErrorCode(error),
        missingRelation: missingRelation(error),
      }
    },

    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, false)
      if (!error) return { ok: true }
      const notFound =
        (error as { status?: number }).status === 404 ||
        /user not found/i.test(error.message ?? '')
      if (notFound) return { ok: true }
      return { ok: false, errorCode: safeErrorCode(error) }
    },
  }
}

export interface AccountDeletionOutcome {
  requestId: string
  completedAt: string
  trackingComplete: boolean
}

export async function runAccountDeletion(
  gateway: AccountDeletionGateway,
  userId: string,
): Promise<AccountDeletionOutcome> {
  let requestId: string | null = null
  let lastStep = 'create_request'
  const resources: Record<string, string> = {}

  try {
    requestId = await gateway.createRequest(userId)

    for (const step of OWNED_DATA_STEPS) {
      lastStep = step.table
      const result = await gateway.deleteOwnedRows(step.table, userId)
      if (result.ok) {
        resources[step.table] = 'deleted'
      } else if (result.missingRelation && step.optional) {
        resources[step.table] = 'skipped_missing_table'
      } else {
        throw new AccountDeletionError(
          'account_deletion_failed',
          'Could not delete every account resource.',
        )
      }
      await gateway.recordStep(requestId, step.table, resources)
    }

    lastStep = 'auth'
    const authResult = await gateway.deleteAuthUser(userId)
    if (!authResult.ok) {
      throw new AccountDeletionError(
        'account_deletion_failed',
        'Could not delete the authentication account.',
      )
    }

    const completedAt = new Date().toISOString()
    let trackingComplete = true
    try {
      await gateway.markCompleted(requestId)
    } catch {
      // The Auth user and owned data are already gone. A failed audit write must
      // not turn a real deletion into a false failure, but the caller is told
      // that status tracking did not finish.
      trackingComplete = false
    }

    return { requestId, completedAt, trackingComplete }
  } catch (error) {
    if (requestId) {
      try {
        await gateway.markFailed(
          requestId,
          lastStep,
          error instanceof AccountDeletionError ? error.code : 'unknown_error',
        )
      } catch {
        // Best-effort status update; the original failure is returned below.
      }
    }
    if (error instanceof AccountDeletionError) throw error
    throw new AccountDeletionError('account_deletion_failed', 'Account deletion failed.')
  }
}
