import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCode } from '../src/services/problemExecution.service.js'

interface PistonResponseBody {
  compile?: { code?: number; stdout?: string; stderr?: string; output?: string }
  run?: { stdout?: string; stderr?: string; code?: number | null; signal?: string | null }
}

function mockSandbox(responses: PistonResponseBody[]) {
  const original = globalThis.fetch
  const requests: string[] = []
  let index = 0
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    requests.push(typeof init?.body === 'string' ? init.body : '')
    const body = responses[index] ?? responses[responses.length - 1] ?? {}
    index += 1
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return {
    requests,
    restore: () => { globalThis.fetch = original },
  }
}

const tests = [
  { args: [[2, 3], 2], expected: 5 },
  { args: [[4, 5], 2], expected: 9 },
  { args: [[10, 20], 2], expected: 30 },
]

test('accepts only when every real test output matches', async () => {
  const sandbox = mockSandbox([
    { run: { stdout: '5\n', stderr: '', code: 0, signal: null } },
    { run: { stdout: '9\n', stderr: '', code: 0, signal: null } },
  ])
  try {
    const result = await evaluateCode({
      language: 'python',
      code: 'def add(values, count):\n  return sum(values)',
      functionName: 'add',
      tests: tests.slice(0, 2),
      revealDetails: true,
    })
    assert.equal(result.verdict, 'accepted')
    assert.equal(result.passedTests, 2)
    assert.equal(result.totalTests, 2)
    assert.equal(result.results.every((item) => item.passed), true)
  } finally {
    sandbox.restore()
  }
})

test('reports a wrong answer with real visible details', async () => {
  const sandbox = mockSandbox([
    { run: { stdout: '5\n', stderr: '', code: 0, signal: null } },
    { run: { stdout: '5\n', stderr: '', code: 0, signal: null } },
  ])
  try {
    const result = await evaluateCode({
      language: 'python',
      code: 'def add(values, count):\n  return 5',
      functionName: 'add',
      tests: tests.slice(0, 2),
      revealDetails: true,
    })
    assert.equal(result.verdict, 'wrong_answer')
    assert.equal(result.passedTests, 1)
    assert.deepEqual(result.results[0].input, tests[0].args)
    assert.deepEqual(result.results[1].expected, tests[1].expected)
    assert.equal(result.results[1].actual, 5)
  } finally {
    sandbox.restore()
  }
})

test('never returns hidden test inputs, expected values or output', async () => {
  const sandbox = mockSandbox([
    { run: { stdout: '5\n', stderr: '', code: 0, signal: null } },
    { run: { stdout: '999\n', stderr: '', code: 0, signal: null } },
  ])
  try {
    const result = await evaluateCode({
      language: 'javascript',
      code: 'function add(values, count) { return 5 }',
      functionName: 'add',
      tests: tests.slice(0, 2),
      revealDetails: true,
      hiddenFromIndex: 1,
    })
    assert.equal(result.verdict, 'wrong_answer')
    assert.equal(result.results[1].hidden, true)
    assert.equal(result.results[1].passed, false)
    assert.equal(result.results[1].input, undefined)
    assert.equal(result.results[1].expected, undefined)
    assert.equal(result.results[1].actual, undefined)
    assert.equal(result.results[1].stderr, undefined)
    assert.equal(JSON.stringify(result.results[1]).includes('999'), false)
    // The harness receives args only; expected values are compared server-side.
    assert.equal(sandbox.requests.join('\n').includes('expected'), false)
  } finally {
    sandbox.restore()
  }
})

test('ignores stderr warnings when the process exits successfully', async () => {
  const sandbox = mockSandbox([
    { run: { stdout: '5\n', stderr: 'DeprecationWarning: something', code: 0, signal: null } },
  ])
  try {
    const result = await evaluateCode({
      language: 'python',
      code: 'def add(values, count):\n  return 5',
      functionName: 'add',
      tests: [tests[0]],
      revealDetails: true,
    })
    assert.equal(result.verdict, 'accepted')
    assert.equal(result.results[0].stderr, 'DeprecationWarning: something')
  } finally {
    sandbox.restore()
  }
})

test('reports compile errors separately from runtime errors', async () => {
  const sandbox = mockSandbox([
    { compile: { code: 1, stderr: 'SyntaxError: invalid syntax' } },
    { run: { stdout: '', stderr: 'Traceback: boom', code: 1, signal: null } },
  ])
  try {
    const compile = await evaluateCode({
      language: 'python',
      code: 'def add(',
      functionName: 'add',
      tests: [tests[0]],
      revealDetails: true,
    })
    assert.equal(compile.verdict, 'compile_error')

    const runtime = await evaluateCode({
      language: 'python',
      code: 'def add(values, count):\n  raise ValueError()',
      functionName: 'add',
      tests: [tests[0]],
      revealDetails: true,
    })
    assert.equal(runtime.verdict, 'runtime_error')
  } finally {
    sandbox.restore()
  }
})

test('reports time limit exceeded when the sandbox kills the process', async () => {
  const sandbox = mockSandbox([
    { run: { stdout: '', stderr: '', code: null, signal: 'SIGKILL' } },
  ])
  try {
    const result = await evaluateCode({
      language: 'javascript',
      code: 'while (true) {}',
      functionName: 'add',
      tests: [tests[0]],
      revealDetails: true,
    })
    assert.equal(result.verdict, 'time_limit_exceeded')
    assert.equal(result.passedTests, 0)
  } finally {
    sandbox.restore()
  }
})

test('aborts the whole evaluation when the sandbox is unavailable', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('network down')
  }) as typeof fetch
  try {
    await assert.rejects(
      evaluateCode({
        language: 'python',
        code: 'def add(values, count):\n  return 0',
        functionName: 'add',
        tests: [tests[0]],
        revealDetails: true,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'code_execution_unavailable')
        return true
      },
    )
  } finally {
    globalThis.fetch = original
  }
})
