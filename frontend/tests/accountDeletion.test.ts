import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DELETE_ACCOUNT_CONFIRMATION,
  clearDeletedUserLocalData,
  validateDeleteAccountInput,
} from '../src/lib/accountDeletionLocal.ts'
import { preferenceStorageKey } from '../src/lib/preferences.ts'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    get length() {
      return values.size
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
  }
}

test('account deletion requires a password, exact phrase and acknowledgement', () => {
  assert.equal(
    validateDeleteAccountInput({
      password: 'secret',
      confirmation: DELETE_ACCOUNT_CONFIRMATION,
      acknowledged: true,
    }),
    null,
  )
  assert.match(
    validateDeleteAccountInput({
      password: '',
      confirmation: DELETE_ACCOUNT_CONFIRMATION,
      acknowledged: true,
    }) ?? '',
    /password/i,
  )
  assert.match(
    validateDeleteAccountInput({
      password: 'secret',
      confirmation: 'DELETE',
      acknowledged: true,
    }) ?? '',
    /exactly/i,
  )
  assert.match(
    validateDeleteAccountInput({
      password: 'secret',
      confirmation: DELETE_ACCOUNT_CONFIRMATION,
      acknowledged: false,
    }) ?? '',
    /permanent/i,
  )
})

test('local cleanup removes only the deleted user data and preserves shared settings', () => {
  const userId = 'user-1'
  const local = memoryStorage({
    [preferenceStorageKey(userId)]: '{}',
    [`mockmate.resume.analysis.v1.${userId}`]: '{}',
    [`mockmate:problem-draft:${userId}:question-1`]: 'draft',
    [preferenceStorageKey('user-2')]: '{}',
    [`mockmate.resume.analysis.v1.user-2`]: '{}',
    'mockmate.theme': 'dark',
    'mockmate.returnTo': 'settings',
  })
  const session = memoryStorage({
    [`mockmate.profileSkipped.${userId}`]: 'true',
    'mockmate.profileSkipped.user-2': 'true',
    'unrelated-key': 'keep',
  })

  const result = clearDeletedUserLocalData(userId, { local, session })

  assert.deepEqual(result, { local: 3, session: 1 })
  assert.equal(local.values.has(preferenceStorageKey(userId)), false)
  assert.equal(local.values.has(`mockmate.resume.analysis.v1.${userId}`), false)
  assert.equal(local.values.has(`mockmate:problem-draft:${userId}:question-1`), false)
  assert.equal(local.values.has(preferenceStorageKey('user-2')), true)
  assert.equal(local.values.has('mockmate.theme'), true)
  assert.equal(local.values.has('mockmate.returnTo'), true)
  assert.equal(session.values.has(`mockmate.profileSkipped.${userId}`), false)
  assert.equal(session.values.has('mockmate.profileSkipped.user-2'), true)
  assert.equal(session.values.has('unrelated-key'), true)
})

test('local cleanup is a no-op without a user id', () => {
  const local = memoryStorage({ 'mockmate.theme': 'dark' })
  const result = clearDeletedUserLocalData(null, { local, session: memoryStorage() })
  assert.deepEqual(result, { local: 0, session: 0 })
  assert.equal(local.values.get('mockmate.theme'), 'dark')
})
