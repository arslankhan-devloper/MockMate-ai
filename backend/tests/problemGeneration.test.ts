import assert from 'node:assert/strict'
import test from 'node:test'
import { env } from '../src/config/env.js'
import { generateCodingProblem } from '../src/services/problemGeneration.service.js'

const mutableEnv = env as unknown as {
  groqApiKey: string
  groqConfigured: boolean
  groqModel: string
  groqBaseUrl: string
}

const originalEnv = {
  groqApiKey: mutableEnv.groqApiKey,
  groqConfigured: mutableEnv.groqConfigured,
  groqModel: mutableEnv.groqModel,
  groqBaseUrl: mutableEnv.groqBaseUrl,
}

function configureGroq() {
  mutableEnv.groqApiKey = 'test-groq-key'
  mutableEnv.groqConfigured = true
  mutableEnv.groqModel = 'test-model'
  mutableEnv.groqBaseUrl = 'https://groq.test/openai/v1'
}

function restoreGroq() {
  Object.assign(mutableEnv, originalEnv)
}

function validProblem() {
  return {
    title: 'Window Maximum',
    difficulty: 'medium',
    topic: 'Sliding Window',
    concepts: ['sliding window', 'arrays'],
    statement: 'Return the maximum sum of any contiguous window of exactly k values from the given non-empty array.',
    inputFormat: 'An array of integers followed by a positive window size k.',
    outputFormat: 'A single integer containing the maximum window sum.',
    constraints: ['1 <= nums.length <= 10^5', '1 <= k <= nums.length'],
    examples: [{ input: 'nums = [1, 3, 2, 6], k = 2', output: '8', explanation: '3 + 2 + 6 is not used; the best adjacent pair is 2 + 6.' }],
    visibleTests: [
      { args: [[1, 3, 2, 6], 2], expected: 8 },
      { args: [[2, 2, 2], 2], expected: 4 },
    ],
    hiddenTests: [
      { args: [[5], 1], expected: 5 },
      { args: [[-1, -2, -3], 2], expected: -3 },
      { args: [[4, 1, 1, 4], 3], expected: 6 },
    ],
    hints: ['Start with the sum of the first window.', 'Slide by removing the outgoing value and adding the incoming value.'],
    approach: 'Maintain a running window sum and record the maximum.',
    expectedComplexity: 'O(n) time, O(1) space',
    functionName: 'maxWindowSum',
    parameters: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
    returnType: 'int',
    starterCode: {
      python: 'def maxWindowSum(nums, k):\n    # Write your solution here\n    pass',
      javascript: 'function maxWindowSum(nums, k) {\n  // Write your solution here\n}',
    },
    rationale: 'A medium sliding-window problem after repeated array practice.',
  }
}

function providerResponse(content: unknown, status = 200) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(responses: Array<() => Response>) {
  const original = globalThis.fetch
  const bodies: string[] = []
  let index = 0
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '')
    const next = responses[Math.min(index, responses.length - 1)]
    index += 1
    return next()
  }) as typeof fetch
  return {
    bodies,
    calls: () => index,
    restore: () => { globalThis.fetch = original },
  }
}

function input() {
  return {
    difficulty: 'medium' as const,
    topic: 'Sliding Window',
    adaptiveReason: 'Staying at Medium with a related problem targeting edge cases.',
    recentTitles: ['Pair Sum Indexes'],
    recentTopics: ['Arrays'],
    targetRole: null,
    branch: 'CSE',
    performance: {
      attempts: 2,
      accepted: 1,
      partial: 1,
      wrong: 0,
      hintsUsed: 0,
      consecutiveFailures: 1,
      lastOutcome: 'partial',
    },
  }
}

test('retries exactly once when the first generated problem is invalid', async () => {
  configureGroq()
  const sandbox = mockFetch([
    () => providerResponse({ title: 'Broken', difficulty: 'medium' }),
    () => providerResponse(validProblem()),
  ])
  try {
    const problem = await generateCodingProblem(input())
    assert.equal(problem.title, 'Window Maximum')
    assert.equal(problem.hiddenTests.length, 3)
    assert.equal(sandbox.calls(), 2)
    assert.match(sandbox.bodies[0], /DO NOT REPEAT/)
    assert.match(sandbox.bodies[0], /Pair Sum Indexes/)
    assert.match(sandbox.bodies[1], /VALIDATION CORRECTION/)
  } finally {
    sandbox.restore()
    restoreGroq()
  }
})

test('reads a valid problem wrapped in a markdown code fence', async () => {
  configureGroq()
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(validProblem())}\n\`\`\`` } }],
  }), { status: 200 })) as typeof fetch
  try {
    const problem = await generateCodingProblem(input())
    assert.equal(problem.functionName, 'maxWindowSum')
  } finally {
    globalThis.fetch = original
    restoreGroq()
  }
})

test('fails explicitly after two invalid provider responses', async () => {
  configureGroq()
  const sandbox = mockFetch([
    () => providerResponse({ title: 'Broken' }),
    () => providerResponse({ title: 'Still broken' }),
  ])
  try {
    await assert.rejects(generateCodingProblem(input()), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'ai_invalid_response')
      assert.match((error as Error).message, /incomplete/i)
      return true
    })
    assert.equal(sandbox.calls(), 2)
  } finally {
    sandbox.restore()
    restoreGroq()
  }
})

test('surfaces provider rate limits without inventing a problem', async () => {
  configureGroq()
  const sandbox = mockFetch([
    () => new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 }),
  ])
  try {
    await assert.rejects(generateCodingProblem(input()), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'ai_rate_limited')
      return true
    })
    assert.equal(sandbox.calls(), 1)
  } finally {
    sandbox.restore()
    restoreGroq()
  }
})

test('surfaces malformed provider JSON as an explicit error', async () => {
  configureGroq()
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'not-json' } }],
  }), { status: 200 })) as typeof fetch
  try {
    await assert.rejects(generateCodingProblem(input()), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'ai_invalid_response')
      return true
    })
  } finally {
    globalThis.fetch = original
    restoreGroq()
  }
})
