import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createProblemDraft,
  initialDraftCodes,
  loadProblemDraft,
  parseProblemDraft,
  problemDraftKey,
  saveProblemDraft,
  serializeProblemDraft,
} from '../src/lib/problemDrafts.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

test('draft keys are scoped to both user and problem', () => {
  assert.notEqual(problemDraftKey('user-1', 'q1'), problemDraftKey('user-2', 'q1'))
  assert.notEqual(problemDraftKey('user-1', 'q1'), problemDraftKey('user-1', 'q2'))
})

test('round-trips a draft through storage', () => {
  const storage = memoryStorage()
  const draft = createProblemDraft({
    questionId: 'q1',
    language: 'javascript',
    codes: { python: 'def f():\n  pass', javascript: 'function f() {}' },
  })
  assert.equal(saveProblemDraft(storage, 'user-1', draft), true)
  const loaded = loadProblemDraft(storage, 'user-1', 'q1')
  assert.equal(loaded?.language, 'javascript')
  assert.equal(loaded?.codes.javascript, 'function f() {}')
})

test('rejects corrupt, mismatched and unsupported drafts', () => {
  assert.equal(parseProblemDraft('not json', 'q1'), null)
  assert.equal(parseProblemDraft(JSON.stringify({ questionId: 'q2' }), 'q1'), null)
  assert.equal(
    parseProblemDraft(serializeProblemDraft(createProblemDraft({
      questionId: 'q1',
      language: 'python',
      codes: { python: 'x', javascript: 'y' },
    })), 'q1')?.questionId,
    'q1',
  )
  assert.equal(
    parseProblemDraft(JSON.stringify({ questionId: 'q1', language: 'java', codes: {} }), 'q1'),
    null,
  )
  assert.equal(
    parseProblemDraft(JSON.stringify({
      questionId: 'q1',
      language: 'python',
      codes: { python: 'x'.repeat(20_001), javascript: '' },
    }), 'q1'),
    null,
  )
})

test('does not return a draft saved for another user', () => {
  const storage = memoryStorage()
  saveProblemDraft(storage, 'user-2', createProblemDraft({
    questionId: 'q1',
    language: 'python',
    codes: { python: 'secret', javascript: '' },
  }))
  assert.equal(loadProblemDraft(storage, 'user-1', 'q1'), null)
})

test('initial codes prefer a matching draft and otherwise use starter code', () => {
  const starter = { python: 'def solve():\n  pass', javascript: 'function solve() {}' }
  const fallback = initialDraftCodes('q1', starter, null)
  assert.equal(fallback.language, 'python')
  assert.equal(fallback.codes.python, starter.python)

  const preferred = initialDraftCodes('q1', starter, null, 'javascript')
  assert.equal(preferred.language, 'javascript')
  assert.equal(preferred.codes.javascript, starter.javascript)

  const stored = createProblemDraft({
    questionId: 'q1',
    language: 'javascript',
    codes: { python: 'my python', javascript: 'my js' },
  })
  const draft = initialDraftCodes('q1', starter, stored)
  assert.equal(draft.language, 'javascript')
  assert.equal(draft.codes.python, 'my python')
  assert.equal(draft.codes.javascript, 'my js')

  const mismatched = initialDraftCodes('q2', starter, stored)
  assert.equal(mismatched.language, 'python')
  assert.equal(mismatched.codes.javascript, starter.javascript)
})

test('storage failures are reported without throwing', () => {
  const failing = { setItem: () => { throw new Error('quota') } }
  assert.equal(
    saveProblemDraft(failing, 'user-1', createProblemDraft({
      questionId: 'q1',
      language: 'python',
      codes: { python: '', javascript: '' },
    })),
    false,
  )
})
