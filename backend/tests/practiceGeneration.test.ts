import assert from 'node:assert/strict'
import test from 'node:test'

// Configuration is read at module load, exactly like the other provider tests.
process.env.GROQ_API_KEY = 'test-groq-key'
process.env.GROQ_API_URL = 'https://api.groq.test/openai/v1'

const {
  PRACTICE_GENERATION_MAX_RETRIES,
  practiceQuestionKey,
  validateGeneratedQuestions,
} = await import('../src/utils/practiceGenerationValidation.js')
const { generatePracticeQuestions } = await import('../src/services/practiceGeneration.service.js')
const { createPracticeSession, mapPracticeQuestionRow } = await import(
  '../src/services/practice.service.js'
)
const { GroqError } = await import('../src/services/resume.service.js')
const { validatePracticeSession } = await import('../src/utils/practiceValidation.js')

const target = {
  kind: 'branch_mcq' as const,
  branch: 'cse',
  category: 'DBMS',
  topic: 'Normalization',
  difficulty: 'medium' as const,
  count: 5,
}

function question(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    branch: 'cse',
    category: 'DBMS',
    topic: 'Normalization',
    difficulty: 'medium',
    prompt: 'Which normal form removes partial dependency on a composite key?',
    options: ['1NF', '2NF', '3NF', 'BCNF'],
    correctIndex: 1,
    explanation: 'Second normal form requires every non-key attribute to depend on the whole key.',
    ...overrides,
  }
}

function groqResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

interface FakeBankRow {
  id: string
  category: string
  topic: string
  prompt: string
}

function fakeBankClient(existing: FakeBankRow[] = []) {
  const inserted: Array<Record<string, unknown>> = []
  const client = {
    from(table: string) {
      assert.equal(table, 'practice_questions')
      const chain = {
        _filters: {} as Record<string, string>,
        select() {
          return chain
        },
        eq(column: string, value: string) {
          chain._filters[column] = value
          return chain
        },
        limit() {
          return Promise.resolve({
            data: existing.filter((row) =>
              Object.entries(chain._filters).every(
                ([column, value]) => (row as unknown as Record<string, string>)[column] === value,
              ),
            ),
            error: null,
          })
        },
        upsert(rows: Array<Record<string, unknown>>) {
          inserted.push(...rows)
          return {
            select: async () => ({
              data: rows.map((_, index) => ({ id: `generated-${index}` })),
              error: null,
            }),
          }
        },
      }
      return chain
    },
  }
  return { client, inserted }
}

function useFetchSequence(responses: Array<() => Response>) {
  const original = globalThis.fetch
  let index = 0
  const calls: string[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(typeof init?.body === 'string' ? init.body : '')
    const make = responses[Math.min(index, responses.length - 1)]
    index += 1
    return make()
  }) as unknown as typeof fetch
  return {
    calls,
    restore: () => { globalThis.fetch = original },
  }
}

test('validates a complete generated batch', () => {
  const result = validateGeneratedQuestions({ questions: [question()] }, target)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.length, 1)
  assert.equal(result.value[0].correctIndex, 1)
  assert.equal(result.value[0].options.length, 4)
  assert.equal(result.value[0].branch, 'cse')
})

test('rejects malformed, ambiguous and duplicate generated questions', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['three options', { options: ['1NF', '2NF', '3NF'] }],
    ['duplicate options', { options: ['2NF', '2NF', '3NF', 'BCNF'] }],
    ['index out of range', { correctIndex: 4 }],
    ['missing explanation', { explanation: '' }],
    ['short explanation', { explanation: 'Because.' }],
    ['explanation repeats an option', { explanation: '2NF' }],
    ['wrong difficulty', { difficulty: 'easy' }],
    ['wrong topic', { topic: 'Indexing' }],
    ['wrong category', { category: 'Operating Systems' }],
    ['wrong branch', { branch: 'it' }],
    ['short prompt', { prompt: 'Which one?' }],
  ]
  for (const [label, overrides] of cases) {
    const result = validateGeneratedQuestions({ questions: [question(overrides)] }, target)
    assert.equal(result.ok, false, `${label} should be rejected`)
  }
})

test('rejects a batch that duplicates an existing bank question', () => {
  const existingKey = practiceQuestionKey(
    String(question().category),
    String(question().topic),
    String(question().prompt),
  )
  const result = validateGeneratedQuestions(
    { questions: [question()] },
    target,
    new Set([existingKey]),
  )
  assert.equal(result.ok, false)
})

test('rejects duplicates inside one generated batch', () => {
  const result = validateGeneratedQuestions(
    { questions: [question(), question({ prompt: 'Which  normal form removes  partial dependency on a composite key?' })] },
    target,
  )
  assert.equal(result.ok, false)
})

test('retries invalid generation and stores only validated questions', async () => {
  const { client, inserted } = fakeBankClient()
  const fetchMock = useFetchSequence([
    () => groqResponse({ questions: [question({ options: ['1NF', '2NF', '3NF'] })] }),
    () => groqResponse({ questions: [question()] }),
  ])
  try {
    const result = await generatePracticeQuestions(client as never, target, 1, () => 0)
    assert.equal(fetchMock.calls.length, 2)
    assert.equal(result.stored, 1)
    assert.equal(inserted.length, 1)
    assert.equal(inserted[0].source, 'ai')
    assert.equal(typeof inserted[0].prompt_key, 'string')
    assert.equal(inserted[0].correct_index, 1)
  } finally {
    fetchMock.restore()
  }
})

test('gives up after the retry budget and stores nothing', async () => {
  const { client, inserted } = fakeBankClient()
  const invalid = () => groqResponse({ questions: [question({ correctIndex: 9 })] })
  const fetchMock = useFetchSequence([invalid, invalid, invalid])
  try {
    const result = await generatePracticeQuestions(client as never, target, 1, () => 0)
    assert.equal(result.stored, 0)
    assert.equal(inserted.length, 0)
    // One attempt plus the configured retries, never more.
    assert.equal(fetchMock.calls.length, 1 + PRACTICE_GENERATION_MAX_RETRIES)
  } finally {
    fetchMock.restore()
  }
})

test('surfaces a provider failure instead of inventing questions', async () => {
  const { client } = fakeBankClient()
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch
  try {
    await assert.rejects(
      generatePracticeQuestions(client as never, target, 1, () => 0),
      (error: unknown) => {
        assert.equal(error instanceof GroqError, true)
        assert.equal((error as { code?: string }).code, 'ai_request_failed')
        return true
      },
    )
  } finally {
    globalThis.fetch = original
  }
})

function sessionClient(questions: Array<Record<string, unknown>>) {
  const insertedLinks: Array<Record<string, unknown>> = []
  const client = {
    from(table: string) {
      if (table === 'practice_questions') {
        const chain = {
          select() { return chain },
          eq() { return chain },
          limit() { return Promise.resolve({ data: questions, error: null }) },
        }
        return chain
      }
      if (table === 'practice_sessions') {
        return {
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: 'session-1',
                      student_id: 'student-1',
                      answered_count: 0,
                      correct_count: 0,
                      status: 'active',
                      started_at: new Date().toISOString(),
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                      completed_at: null,
                      expires_at: null,
                      ...payload,
                    },
                    error: null,
                  }),
                }
              },
            }
          },
          delete() {
            const chain = { eq() { return chain }, then(resolve: (value: unknown) => unknown) { return Promise.resolve({ error: null }).then(resolve) } }
            return chain
          },
        }
      }
      assert.equal(table, 'practice_session_questions')
      return {
        insert(rows: Array<Record<string, unknown>>) {
          insertedLinks.push(...rows)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { client, insertedLinks }
}

function bankQuestion(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'branch_mcq',
    branch: 'cse',
    category: 'DBMS',
    topic: 'Normalization',
    difficulty: 'medium',
    prompt: `Stored question ${id}`,
    options: ['A', 'B', 'C', 'D'],
    correct_index: 0,
    explanation: 'Stored explanation for the question.',
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

test('reuses stored questions and generates only the shortfall', async () => {
  const stored = [bankQuestion('q1'), bankQuestion('q2')]
  const { client, insertedLinks } = sessionClient(stored)
  let generated = 0
  const parsed = validatePracticeSession({
    kind: 'branch_mcq',
    branch: 'cse',
    category: 'DBMS',
    topic: 'Normalization',
    difficulty: 'medium',
    count: 5,
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  const result = await createPracticeSession(client as never, 'student-1', parsed.value, {
    generate: async (_target, missing) => {
      generated = missing
      // Simulate the provider storing the missing questions in the bank.
      for (let index = 0; index < missing; index += 1) {
        stored.push(bankQuestion(`generated-${index}`))
      }
      return { requested: missing, reused: 0, generated: missing, stored: missing }
    },
  })

  assert.equal(generated, 3)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.view.questions.length, 5)
  assert.equal(result.generation?.stored, 3)
  assert.equal(insertedLinks.length, 5)
})

test('does not call the generator when the bank already has enough questions', async () => {
  const stored = Array.from({ length: 5 }, (_, index) => bankQuestion(`q${index}`))
  const { client } = sessionClient(stored)
  const parsed = validatePracticeSession({
    kind: 'branch_mcq',
    branch: 'cse',
    category: 'DBMS',
    topic: 'Normalization',
    count: 5,
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  let called = false
  const result = await createPracticeSession(client as never, 'student-1', parsed.value, {
    generate: async () => {
      called = true
      return { requested: 0, reused: 0, generated: 0, stored: 0 }
    },
  })
  assert.equal(called, false)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.generation, null)
})

test('generated questions never expose the answer before submission', () => {
  const view = mapPracticeQuestionRow(
    bankQuestion('q1', { correct_index: 2, explanation: 'Hidden until answered.' }) as never,
    0,
    undefined,
  )
  assert.equal(view.answer, null)
  assert.equal(JSON.stringify(view).includes('correctIndex'), false)
  assert.equal(JSON.stringify(view).includes('Hidden until answered'), false)
})
