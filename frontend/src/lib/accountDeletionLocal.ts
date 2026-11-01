import { preferenceStorageKey } from './preferences.ts'

export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE MY ACCOUNT'

export function validateDeleteAccountInput(input: {
  password: string
  confirmation: string
  acknowledged: boolean
}): string | null {
  if (!input.password) return 'Enter your current password.'
  if (input.confirmation !== DELETE_ACCOUNT_CONFIRMATION) {
    return `Type ${DELETE_ACCOUNT_CONFIRMATION} exactly to confirm.`
  }
  if (!input.acknowledged) return 'Confirm that you understand this action is permanent.'
  return null
}

interface RemovableStorage {
  length: number
  key: (index: number) => string | null
  removeItem: (key: string) => void
}

function removeMatching(storage: RemovableStorage, matches: (key: string) => boolean): number {
  const keys: string[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && matches(key)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
    return keys.length
  } catch {
    return 0
  }
}

// Removes only this deleted user's browser data. Shared appearance settings and
// another account's data are never touched.
export function clearDeletedUserLocalData(
  userId: string | null | undefined,
  storage: {
    local?: RemovableStorage | null
    session?: RemovableStorage | null
  } = {},
): { local: number; session: number } {
  if (!userId) return { local: 0, session: 0 }

  let local = storage.local
  let session = storage.session
  if (local === undefined || session === undefined) {
    if (typeof window === 'undefined') return { local: 0, session: 0 }
    try {
      local = local === undefined ? window.localStorage : local
      session = session === undefined ? window.sessionStorage : session
    } catch {
      return { local: 0, session: 0 }
    }
  }

  const preferenceKey = preferenceStorageKey(userId)
  const resumeKey = `mockmate.resume.analysis.v1.${userId}`
  const problemDraftPrefix = `mockmate:problem-draft:${userId}:`

  const removedLocal = local
    ? removeMatching(
        local,
        key =>
          key === preferenceKey ||
          key === resumeKey ||
          key.startsWith(problemDraftPrefix),
      )
    : 0
  const removedSession = session
    ? removeMatching(session, key => key === `mockmate.profileSkipped.${userId}`)
    : 0

  return { local: removedLocal, session: removedSession }
}
