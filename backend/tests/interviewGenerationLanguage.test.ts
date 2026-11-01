import assert from 'node:assert/strict'
import test from 'node:test'

process.env.GROQ_API_KEY = 'test-key'
process.env.GROQ_API_URL = 'https://groq.invalid/v1'

const { generateNextQuestion } = await import('../src/services/interviewQuestion.service.js')
const { evaluateAnswer } = await import('../src/services/interviewEvaluation.service.js')
const { GroqError } = await import('../src/services/resume.service.js')

interface CapturedRequest {
  messages: { role: string; content: string }[]
}

function providerResponse(content: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  } as unknown as Response
}

function mockProvider(responses: unknown[]): CapturedRequest[] {
  const captured: CapturedRequest[] = []
  let index = 0
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    captured.push(JSON.parse(String(init?.body ?? '{}')) as CapturedRequest)
    const response = responses[Math.min(index, responses.length - 1)]
    index += 1
    return providerResponse(response)
  }) as typeof fetch
  return captured
}

function questionInput(language: string) {
  return {
    interviewType: 'technical',
    mode: 'technical',
    difficulty: 'Medium',
    experience: 'Fresher',
    targetRole: 'Software Engineer',
    targetCompany: 'Acme',
    language,
    questionIndex: 1,
    questionCount: 8,
    questionText: 'What is a closure in JavaScript?',
    answerText: 'A closure keeps access to variables from its outer scope.',
    currentDifficulty: 'medium' as const,
    evaluation: {
      correctnessVerdict: 'mostly_correct' as const,
      correctnessScore: 78,
      overallScore: 76,
      summary: 'The core idea is right but the answer is short.',
      keyConceptsMissing: ['Lexical scope'],
      factualErrors: [],
      improvementAdvice: 'Mention lexical scope and a practical example.',
    },
    history: [],
  }
}

function rawEvaluation(overrides: Record<string, unknown> = {}) {
  return {
    status: 'evaluated',
    score: 72,
    summary: 'The answer explains the core idea but leaves out an edge case.',
    strengths: ['Clear explanation'],
    improvements: ['Cover the empty input case'],
    suggestedAnswer: 'A stronger answer would mention the empty input case.',
    criteria: [
      { criterion: 'Correctness', score: 16, maxScore: 25, feedback: 'Mostly accurate.' },
      { criterion: 'Relevance', score: 20, maxScore: 25, feedback: 'On topic.' },
      { criterion: 'Completeness', score: 16, maxScore: 25, feedback: 'One gap.' },
      { criterion: 'Clarity', score: 20, maxScore: 25, feedback: 'Clear.' },
    ],
    correctness: {
      verdict: 'partially_correct',
      score: 65,
      keyConceptsCovered: ['Hash map lookup'],
      keyConceptsMissing: ['Empty input'],
      factualErrors: [],
      expectedAnswer: 'A hash map gives average O(1) lookup and handles empty input.',
      improvementAdvice: 'State the average complexity and the empty-input case.',
      confidence: 0.82,
    },
    ...overrides,
  }
}

const englishQuestion = {
  question: 'How does a closure capture its lexical scope?',
  category: 'JavaScript',
  difficulty: 'medium',
  topic: 'Closures',
  rationale: 'The answer needs a deeper explanation of lexical scope.',
}

test('adaptive English question generation does not add a retry', async () => {
  const requests = mockProvider([englishQuestion])

  const result = await generateNextQuestion(questionInput('en'))

  assert.equal(result.questionText, englishQuestion.question)
  assert.equal(requests.length, 1)
})

test('a legacy Hindi selection is coerced to English for new questions', async () => {
  const requests = mockProvider([englishQuestion])

  const result = await generateNextQuestion(questionInput('hi'))

  assert.equal(result.questionText, englishQuestion.question)
  assert.equal(requests.length, 1)
  assert.match(requests[0].messages[1].content, /Interview language: English/)
  assert.doesNotMatch(requests[0].messages[0].content, /Devanagari script/)
})

test('Devanagari output for a legacy Hindi selection fails explicitly', async () => {
  mockProvider([
    {
      ...englishQuestion,
      question: 'क्लोजर अपने लेक्सिकल स्कोप को कैसे कैप्चर करता है?',
    },
  ])

  await assert.rejects(
    () => generateNextQuestion(questionInput('hi')),
    (err: unknown) =>
      err instanceof GroqError && err.code === 'ai_language_mismatch',
  )
})

test('English evaluation is accepted for a legacy Hindi selection', async () => {
  const requests = mockProvider([rawEvaluation()])

  const result = await evaluateAnswer({
    interviewType: 'technical',
    mode: 'technical',
    difficulty: 'Medium',
    targetRole: 'Software Engineer',
    targetCompany: 'Acme',
    language: 'hi',
    questionText: 'How does a hash map handle collisions?',
    answerText: 'It uses chaining to store multiple values in the same bucket.',
  })

  assert.equal(result.status, 'evaluated')
  assert.equal(requests.length, 1)
  assert.match(requests[0].messages[1].content, /Interview language: English/)
})
