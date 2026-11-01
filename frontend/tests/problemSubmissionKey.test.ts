import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSubmissionIdempotencyKey,
  resolveSubmissionIdempotencyKey,
  type PendingSubmission,
} from '../src/lib/problemSubmissionKey.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

test('generates a UUID v4 idempotency key', () => {
  const keys = new Set<string>()
  for (let index = 0; index < 100; index += 1) {
    const key = createSubmissionIdempotencyKey()
    assert.match(key, UUID_V4)
    keys.add(key)
  }
  assert.equal(keys.size, 100)
})

test('reuses the key only for the identical pending submission', () => {
  const previous: PendingSubmission = {
    questionId: 'q1',
    language: 'python',
    code: 'print(1)',
    idempotencyKey: 'key-1',
  }
  let created = 0
  const create = () => {
    created += 1
    return `key-${created + 1}`
  }

  assert.equal(
    resolveSubmissionIdempotencyKey(previous, {
      questionId: 'q1',
      language: 'python',
      code: 'print(1)',
    }, create),
    'key-1',
  )
  assert.equal(created, 0)

  for (const change of [
    { questionId: 'q2', language: 'python', code: 'print(1)' },
    { questionId: 'q1', language: 'javascript', code: 'print(1)' },
    { questionId: 'q1', language: 'python', code: 'print(2)' },
  ]) {
    assert.notEqual(resolveSubmissionIdempotencyKey(previous, change, create), 'key-1')
  }
  assert.equal(created, 3)
  assert.equal(
    resolveSubmissionIdempotencyKey(null, {
      questionId: 'q1',
      language: 'python',
      code: 'print(1)',
    }, create),
    'key-5',
  )
})

test('falls back to secure getRandomValues when randomUUID is unavailable', () => {
  const original = globalThis.crypto
  try {
    let counter = 0
    const fallback = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array && 'byteLength' in array) {
          const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
          for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = counter++ & 0xff
          }
        }
        return array
      },
    }
    Object.defineProperty(globalThis, 'crypto', {
      value: fallback,
      configurable: true,
    })

    const first = createSubmissionIdempotencyKey()
    const second = createSubmissionIdempotencyKey()
    assert.match(first, UUID_V4)
    assert.match(second, UUID_V4)
    assert.notEqual(first, second)
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      value: original,
      configurable: true,
    })
  }
})
