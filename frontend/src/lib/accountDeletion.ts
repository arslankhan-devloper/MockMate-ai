import { ApiError, apiRequest } from './api'

export {
  DELETE_ACCOUNT_CONFIRMATION,
  clearDeletedUserLocalData,
  validateDeleteAccountInput,
} from './accountDeletionLocal'

export interface DeleteAccountResponse {
  deleted: true
  completedAt: string
  trackingComplete: boolean
  retentionDays: number
}

export async function requestAccountDeletion(
  accessToken: string | null | undefined,
  password: string,
  confirmation: string,
): Promise<DeleteAccountResponse> {
  if (!accessToken) {
    throw new ApiError(401, 'not_authenticated', 'Your session has expired. Sign in again.')
  }
  return apiRequest<DeleteAccountResponse>('/api/account', {
    method: 'DELETE',
    accessToken,
    body: { password, confirmation },
  })
}
