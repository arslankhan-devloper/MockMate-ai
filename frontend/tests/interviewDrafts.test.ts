import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveStoredAnswer } from '../src/lib/interviewDrafts.ts'

const saved = new Map<number, string>([[1, 'Saved answer']])

test('restores a confirmed saved answer when there is no queued draft', () => {
  const result = resolveStoredAnswer(1, new Map(), saved)
  assert.equal(result.text, 'Saved answer')
  assert.equal(result.spokenSeconds, 0)
})

test('prefers a non-empty queued draft over the last saved answer', () => {
  const pending = new Map([[1, { answerText: 'Unsaved edit', spokenSeconds: 42 }]])
  const result = resolveStoredAnswer(1, pending, saved)
  assert.equal(result.text, 'Unsaved edit')
  assert.equal(result.spokenSeconds, 42)
})

test('falls back to the saved answer when the queued draft is empty', () => {
  const pending = new Map([[1, { answerText: '   ', spokenSeconds: 10 }]])
  const result = resolveStoredAnswer(1, pending, saved)
  assert.equal(result.text, 'Saved answer')
  assert.equal(result.spokenSeconds, 10)
})

test('returns an empty answer for a question that has never been answered', () => {
  const result = resolveStoredAnswer(2, new Map(), saved)
  assert.equal(result.text, '')
  assert.equal(result.spokenSeconds, 0)
})
