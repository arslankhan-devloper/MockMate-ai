import type { Request, Response } from 'express'
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_RETENTION_DAYS,
  AccountDeletionError,
  createSupabaseDeletionGateway,
  runAccountDeletion,
  type AccountDeletionGateway,
} from '../services/accountDeletion.service.js'
import {
  getSupabaseAdminClient,
  verifyAccountPassword,
} from '../services/supabase.js'
import { sendError } from '../utils/http.js'

export interface AccountDeletionDependencies {
  verifyPassword?: (
    email: string,
    password: string,
    expectedUserId: string,
  ) => Promise<boolean>
  gateway?: AccountDeletionGateway | null
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function defaultGateway(): AccountDeletionGateway | null {
  const admin = getSupabaseAdminClient()
  return admin ? createSupabaseDeletionGateway(admin) : null
}

// The authenticated user id comes only from the verified access token. A user id
// in the body is ignored, so this endpoint cannot be used to delete someone else.
// The current password is re-verified server-side with Supabase Auth immediately
// before deletion, which is the supported reauthentication step for this app.
export function createDeleteAccountHandler(
  dependencies: AccountDeletionDependencies = {},
) {
  return async function deleteAccountHandler(req: Request, res: Response): Promise<void> {
    if (!req.auth) {
      sendError(res, 401, 'not_authenticated', 'Authentication is required.')
      return
    }

    const body = asObject(req.body)
    if (body.confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
      sendError(
        res,
        400,
        'confirmation_required',
        `Type "${ACCOUNT_DELETION_CONFIRMATION}" to confirm account deletion.`,
        { fields: { confirmation: 'The confirmation text does not match.' } },
      )
      return
    }

    const password = typeof body.password === 'string' ? body.password : ''
    if (!password || password.length > 1024) {
      sendError(res, 400, 'password_required', 'Enter your current password to continue.', {
        fields: { password: 'Current password is required.' },
      })
      return
    }

    if (!req.auth.email) {
      sendError(
        res,
        400,
        'reauth_unavailable',
        'Password reauthentication is not available for this account.',
      )
      return
    }

    const gateway =
      dependencies.gateway === undefined ? defaultGateway() : dependencies.gateway
    if (!gateway) {
      sendError(
        res,
        503,
        'account_deletion_unavailable',
        'Account deletion is not configured on this server. Contact your placement cell administrator.',
      )
      return
    }

    const verifyPassword = dependencies.verifyPassword ?? verifyAccountPassword
    let verified = false
    try {
      verified = await verifyPassword(req.auth.email, password, req.auth.userId)
    } catch {
      verified = false
    }
    if (!verified) {
      sendError(
        res,
        403,
        'reauth_failed',
        'The current password could not be verified. No data was deleted.',
        { fields: { password: 'Check your current password and try again.' } },
      )
      return
    }

    try {
      const outcome = await runAccountDeletion(gateway, req.auth.userId)
      res.status(200).json({
        deleted: true,
        completedAt: outcome.completedAt,
        trackingComplete: outcome.trackingComplete,
        retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
      })
    } catch (error) {
      const failure =
        error instanceof AccountDeletionError
          ? error
          : new AccountDeletionError('account_deletion_failed', 'Account deletion failed.')
      console.error(`[mockmate-backend] account deletion failed: ${failure.code}`)
      sendError(
        res,
        failure.code === 'account_deletion_unavailable' ? 503 : 500,
        failure.code,
        failure.code === 'account_deletion_unavailable'
          ? 'Account deletion is not configured on this server. Contact your placement cell administrator.'
          : 'Account deletion did not complete. No success was recorded; you can retry safely.',
      )
    }
  }
}

export const deleteAccountHandler = createDeleteAccountHandler()
