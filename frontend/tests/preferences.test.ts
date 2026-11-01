import assert from 'node:assert/strict'
import test from 'node:test'
import { accountProfilePage, validatePasswordChange } from '../src/lib/account.ts'
import { problemDraftKey } from '../src/lib/problemDrafts.ts'
import {
  DEFAULT_USER_PREFERENCES,
  INTERVIEW_LANGUAGE,
  defaultUserPreferences,
  loadCodingPreferences,
  loadInterviewPreferences,
  loadUserPreferences,
  normalizeUserPreferences,
  preferenceStorageKey,
  resetUserPreferences,
  saveUserPreferences,
  type UserPreferences,
} from '../src/lib/preferences.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

function customPreferences(): UserPreferences {
  return {
    interview: {
      type: 'combined',
      difficulty: 'Hard',
      durationMinutes: 45,
      questionCount: 10,
    },
    coding: {
      language: 'javascript',
      fontSize: 16,
    },
  }
}

test('preferences use safe defaults when nothing is stored', () => {
  assert.deepEqual(loadUserPreferences(memoryStorage(), 'user-1'), defaultUserPreferences())
  assert.deepEqual(loadUserPreferences(null, 'user-1'), DEFAULT_USER_PREFERENCES)
  assert.deepEqual(loadUserPreferences(memoryStorage(), null), DEFAULT_USER_PREFERENCES)
  assert.equal(INTERVIEW_LANGUAGE, 'en')
})

test('interview preferences cannot override the English-only language', () => {
  const normalized = normalizeUserPreferences({
    interview: {
      type: 'technical',
      difficulty: 'Medium',
      durationMinutes: 30,
      questionCount: 8,
      language: 'hi',
    },
    coding: {
      language: 'python',
      fontSize: 13,
    },
  })

  assert.equal(INTERVIEW_LANGUAGE, 'en')
  assert.equal('language' in normalized.interview, false)
})

test('preferences round-trip and reload for the same user', () => {
  const storage = memoryStorage()
  const preferences = customPreferences()
  assert.equal(saveUserPreferences(storage, 'user-1', preferences), true)
  assert.deepEqual(loadUserPreferences(storage, 'user-1'), preferences)
  assert.deepEqual(loadInterviewPreferences(storage, 'user-1'), preferences.interview)
  assert.deepEqual(loadCodingPreferences(storage, 'user-1'), preferences.coding)
})

test('preferences are isolated by authenticated user id', () => {
  const storage = memoryStorage()
  saveUserPreferences(storage, 'user-1', customPreferences())

  assert.deepEqual(loadUserPreferences(storage, 'user-2'), defaultUserPreferences())
  assert.notEqual(
    preferenceStorageKey('user-1'),
    preferenceStorageKey('user-2'),
  )
})

test('switching accounts loads only that account\'s saved preferences', () => {
  const storage = memoryStorage()
  const secondUser: UserPreferences = {
    interview: {
      type: 'hr',
      difficulty: 'Easy',
      durationMinutes: 15,
      questionCount: 5,
    },
    coding: {
      language: 'python',
      fontSize: 12,
    },
  }

  saveUserPreferences(storage, 'user-1', customPreferences())
  saveUserPreferences(storage, 'user-2', secondUser)

  assert.deepEqual(loadUserPreferences(storage, 'user-1'), customPreferences())
  assert.deepEqual(loadUserPreferences(storage, 'user-2'), secondUser)
})

test('reset restores documented defaults without changing unrelated storage', () => {
  const storage = memoryStorage()
  saveUserPreferences(storage, 'user-1', customPreferences())

  const draftKey = problemDraftKey('user-1', 'problem-1')
  const draft = JSON.stringify({
    questionId: 'problem-1',
    language: 'javascript',
    codes: { python: 'print(1)', javascript: 'console.log(1)' },
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
  storage.setItem(draftKey, draft)
  storage.setItem('mockmate.theme', 'dark')

  assert.equal(resetUserPreferences(storage, 'user-1'), true)
  assert.deepEqual(loadUserPreferences(storage, 'user-1'), defaultUserPreferences())
  assert.equal(storage.getItem(draftKey), draft)
  assert.equal(storage.getItem('mockmate.theme'), 'dark')
})

test('reset reports failure without writing when storage is unavailable', () => {
  const failingWrite = {
    getItem: () => null,
    setItem: () => { throw new Error('quota') },
  }

  assert.equal(resetUserPreferences(failingWrite, 'user-1'), false)
  assert.equal(resetUserPreferences(null, 'user-1'), false)
})

test('invalid stored fields fall back per preference without discarding valid fields', () => {
  const normalized = normalizeUserPreferences({
    interview: {
      type: 'phone-screen',
      difficulty: 'Hard',
      durationMinutes: 999,
      questionCount: '8',
    },
    coding: {
      language: 'java',
      fontSize: 14,
    },
  })

  assert.equal(normalized.interview.type, 'technical')
  assert.equal(normalized.interview.difficulty, 'Hard')
  assert.equal(normalized.interview.durationMinutes, 30)
  assert.equal(normalized.interview.questionCount, 8)
  assert.equal(normalized.coding.language, 'python')
  assert.equal(normalized.coding.fontSize, 14)
})

test('malformed, unreadable and unavailable storage never throws', () => {
  const malformed = memoryStorage()
  malformed.setItem(preferenceStorageKey('user-1'), 'not json')
  assert.deepEqual(loadUserPreferences(malformed, 'user-1'), defaultUserPreferences())

  const failingRead = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => {},
  }
  assert.deepEqual(loadUserPreferences(failingRead, 'user-1'), defaultUserPreferences())

  const failingWrite = {
    getItem: () => null,
    setItem: () => { throw new Error('quota') },
  }
  assert.equal(saveUserPreferences(failingWrite, 'user-1', customPreferences()), false)
  assert.equal(saveUserPreferences(null, 'user-1', customPreferences()), false)
})

test('password changes require a strong matching confirmation', () => {
  assert.equal(validatePasswordChange('', ''), 'Enter a new password.')
  assert.equal(validatePasswordChange('short', 'short'), 'Use at least 8 characters.')
  assert.equal(validatePasswordChange('long-enough', 'different'), 'The passwords do not match.')
  assert.equal(validatePasswordChange('long-enough', 'long-enough'), null)
})

test('account profile route follows the verified role', () => {
  assert.equal(accountProfilePage('student'), 'profile')
  assert.equal(accountProfilePage('placement-officer'), 'officer-profile')
})
