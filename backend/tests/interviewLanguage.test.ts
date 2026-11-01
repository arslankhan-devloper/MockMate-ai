import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluationMatchesInterviewLanguage,
  interviewLanguageDirective,
  interviewLanguageName,
  isTextInInterviewLanguage,
  normalizeInterviewLanguage,
  resolveInterviewLanguage,
  type EvaluationLanguageText,
} from '../src/utils/interviewLanguage.js'

function evaluation(overrides: Partial<EvaluationLanguageText> = {}): EvaluationLanguageText {
  return {
    summary: 'The answer explains the core idea but misses the empty-input case.',
    strengths: ['Clear explanation'],
    improvements: ['Cover the empty input case'],
    suggestedAnswer: 'A stronger answer would mention the empty input case.',
    criteria: [{ feedback: 'Mostly accurate.' }],
    keyConceptsCovered: ['Hash map lookup'],
    keyConceptsMissing: ['Empty input'],
    factualErrors: [],
    expectedAnswer: 'A hash map gives average O(1) lookup and handles empty input.',
    improvementAdvice: 'State the average complexity and the empty-input case.',
    ...overrides,
  }
}

test('only English is a supported interview language', () => {
  assert.equal(normalizeInterviewLanguage('en'), 'en')
  assert.equal(normalizeInterviewLanguage(' EN '), 'en')
  assert.equal(normalizeInterviewLanguage('hi'), null)
  assert.equal(normalizeInterviewLanguage('hi-en'), null)
  assert.equal(normalizeInterviewLanguage('hinglish'), null)
  assert.equal(normalizeInterviewLanguage(null), null)
  assert.equal(interviewLanguageName('en'), 'English')
})

test('legacy Hindi and Hinglish selections resolve safely to English', () => {
  assert.equal(resolveInterviewLanguage(undefined), 'en')
  assert.equal(resolveInterviewLanguage('hi'), 'en')
  assert.equal(resolveInterviewLanguage('hi-en'), 'en')
  assert.equal(interviewLanguageName('hi'), 'English')
  assert.equal(interviewLanguageName('hi-en'), 'English')
})

test('English output must not contain Devanagari', () => {
  assert.equal(
    isTextInInterviewLanguage('How does a hash map handle collisions?', 'en'),
    true,
  )
  assert.equal(
    isTextInInterviewLanguage('How does a hash map handle collisions?', 'hi'),
    true,
  )
  assert.equal(
    isTextInInterviewLanguage('Hash map में collisions कैसे handle होते हैं?', 'en'),
    false,
  )
  assert.equal(
    isTextInInterviewLanguage('Hash map में collisions कैसे handle होते हैं?', 'hi'),
    false,
  )
})

test('evaluation language checks cover all feedback fields', () => {
  assert.equal(evaluationMatchesInterviewLanguage(evaluation(), 'en'), true)
  assert.equal(evaluationMatchesInterviewLanguage(evaluation(), 'hi'), true)
  assert.equal(
    evaluationMatchesInterviewLanguage(
      evaluation({ summary: 'उत्तर मुख्य विचार समझाता है लेकिन खाली इनपुट छोड़ देता है।' }),
      'en',
    ),
    false,
  )
})

test('language directives explicitly require English only', () => {
  const english = interviewLanguageDirective('en')
  assert.match(english, /English only/)
  assert.match(english, /Do NOT use Hindi/)

  const legacy = interviewLanguageDirective('hi')
  assert.match(legacy, /English only/)
  assert.match(legacy, /Do NOT use Hindi/)
})
