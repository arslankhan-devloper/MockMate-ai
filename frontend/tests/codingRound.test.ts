import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CODING_ROUND_LANGUAGES,
  buildCodingQuestionText,
  buildCodingTurnAnswer,
  codingRoundLanguageLabel,
  codingStarterCode,
  isCodingRoundLanguage,
  selectCodingQuestions,
} from '../src/lib/codingRound.ts'
import {
  classifyMediaError,
  insecureContextMessage,
  mediaDevicesSupported,
  stopMediaStreams,
} from '../src/lib/mediaDevices.ts'

test('coding round exposes the languages the backend can execute', () => {
  assert.equal(CODING_ROUND_LANGUAGES.length, 8)
  assert.deepEqual(
    CODING_ROUND_LANGUAGES.map((language) => language.id),
    ['python', 'javascript', 'typescript', 'c', 'cpp', 'java', 'go', 'rust'],
  )
  assert.equal(isCodingRoundLanguage('cpp'), true)
  assert.equal(isCodingRoundLanguage('brainfuck'), false)
  assert.equal(codingRoundLanguageLabel('python'), 'Python')
})

test('coding questions respect difficulty and the requested count', () => {
  const easy = selectCodingQuestions('Easy', 5)
  assert.equal(easy.length, 5)
  assert.equal(easy[0].difficulty, 'Easy')
  assert.ok(easy.some((question) => question.difficulty === 'Easy'))

  const mixed = selectCodingQuestions('Mixed', 10)
  assert.equal(mixed.length, 10)
  assert.equal(new Set(mixed.map((question) => question.id)).size, 10)

  const clamped = selectCodingQuestions('Hard', 99)
  assert.equal(clamped.length, 10)
  assert.equal(clamped[0].difficulty, 'Hard')
})

test('coding starter code is language-specific and mentions the task', () => {
  const question = selectCodingQuestions('Easy', 1)[0]
  const python = codingStarterCode('python', question)
  const java = codingStarterCode('java', question)
  assert.match(python, /def solve/)
  assert.match(python, new RegExp(question.title))
  assert.match(java, /public class Main/)
  assert.notEqual(python, java)
})

test('coding turn answers stay within the backend limit', () => {
  const question = selectCodingQuestions('Hard', 1)[0]
  const answer = buildCodingTurnAnswer('python', question, 'x'.repeat(50_000), {
    output: 'y'.repeat(5_000),
    error: 'z'.repeat(5_000),
    exitCode: 0,
  })
  assert.ok(answer.length <= 8_000, `expected <= 8000, got ${answer.length}`)
  assert.match(answer, /\[Coding Round\]/)
  assert.match(answer, /Language: Python/)
  assert.match(answer, /Last run: exit 0/)
})

test('coding question text stays within the interview-turn limit', () => {
  const question = selectCodingQuestions('Medium', 1)[0]
  const text = buildCodingQuestionText(question)
  assert.ok(text.length <= 1_000)
  assert.match(text, /Example input:/)
})

test('media permission errors map to actionable messages', () => {
  assert.equal(classifyMediaError({ name: 'NotAllowedError' }).kind, 'denied')
  assert.equal(classifyMediaError({ name: 'NotFoundError' }).kind, 'not-found')
  assert.equal(classifyMediaError({ name: 'NotReadableError' }).kind, 'in-use')
  assert.equal(classifyMediaError({ name: 'OverconstrainedError' }).kind, 'unsupported')
  assert.equal(classifyMediaError(new Error('boom')).kind, 'unknown')
  assert.equal(insecureContextMessage().kind, 'insecure')
})

test('media support detection is false outside a browser', () => {
  assert.equal(mediaDevicesSupported(), false)
})

test('stopMediaStreams stops every track exactly once', () => {
  let stopped = 0
  const stream = {
    getTracks: () => [{ stop: () => { stopped += 1 } }, { stop: () => { stopped += 1 } }],
  } as unknown as MediaStream
  stopMediaStreams([stream])
  assert.equal(stopped, 2)
})
