import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeEvaluation,
  type NormalizedEvaluation,
} from '../src/utils/interviewEvaluationValidation.js'
import {
  isDuplicateQuestion,
  nextQuestionDifficulty,
  normalizeGeneratedQuestion,
  resolveQuestionCount,
  shouldReuseNextQuestion,
} from '../src/utils/interviewQuestionValidation.js'
import {
  mapEvaluationRow,
  mapTurnRow,
  type EvaluationRow,
  type TurnRow,
} from '../src/services/interviews.service.js'

function evaluation() {
  return {
    status: 'evaluated',
    summary: 'The answer explains the core idea but leaves out an edge case.',
    score: 72,
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
      factualErrors: ['Claims lookup is always O(n) in a hash map.'],
      expectedAnswer: 'A hash map gives average O(1) lookup and the empty input should be handled.',
      improvementAdvice: 'State the average complexity and the empty-input case.',
      confidence: 0.82,
    },
  }
}

function assertEvaluated(
  result: NormalizedEvaluation | null,
): asserts result is NormalizedEvaluation {
  assert.ok(result)
  assert.equal(result.status, 'evaluated')
}

test('technical evaluations require a correctness verdict and score', () => {
  const raw = evaluation()
  delete (raw as { correctness?: unknown }).correctness
  assert.equal(normalizeEvaluation(raw, 'technical'), null)

  const parsed = normalizeEvaluation(evaluation(), 'technical')
  assertEvaluated(parsed)
  assert.equal(parsed.correctnessVerdict, 'partially_correct')
  assert.equal(parsed.correctnessScore, 65)
  assert.deepEqual(parsed.keyConceptsMissing, ['Empty input'])
  assert.deepEqual(parsed.factualErrors, ['Claims lookup is always O(n) in a hash map.'])
  assert.equal(parsed.confidence, 0.82)
})

test('accepts every technical correctness verdict and rejects invalid ones', () => {
  for (const verdict of ['correct', 'mostly_correct', 'partially_correct', 'incorrect'] as const) {
    const raw = evaluation()
    raw.correctness.verdict = verdict
    const parsed = normalizeEvaluation(raw, 'technical')
    assertEvaluated(parsed)
    assert.equal(parsed.correctnessVerdict, verdict)
  }

  const invalid = evaluation()
  invalid.correctness.verdict = 'probably_right'
  assert.equal(normalizeEvaluation(invalid, 'technical'), null)

  const missingScore = evaluation()
  delete (missingScore.correctness as { score?: unknown }).score
  assert.equal(normalizeEvaluation(missingScore, 'technical'), null)

  const insufficient = evaluation()
  insufficient.status = 'insufficient_information'
  insufficient.score = null
  const parsedInsufficient = normalizeEvaluation(insufficient, 'technical')
  assert.ok(parsedInsufficient)
  assert.equal(parsedInsufficient.correctnessVerdict, 'insufficient_information')
  assert.equal(parsedInsufficient.correctnessScore, null)
})

test('adaptive difficulty rises for strong answers and falls for incorrect ones', () => {
  assert.equal(nextQuestionDifficulty('medium', 'correct', 90), 'hard')
  assert.equal(nextQuestionDifficulty('medium', 'mostly_correct', 82), 'hard')
  assert.equal(nextQuestionDifficulty('medium', 'partially_correct', 60), 'medium')
  assert.equal(nextQuestionDifficulty('medium', 'incorrect', 20), 'easy')
  assert.equal(nextQuestionDifficulty('medium', 'insufficient_information', null), 'easy')
  assert.equal(nextQuestionDifficulty('hard', 'correct', 95), 'hard')
  assert.equal(nextQuestionDifficulty('easy', 'incorrect', 0), 'easy')
  assert.equal(nextQuestionDifficulty('medium', 'not_applicable', null, 88), 'hard')
  assert.equal(nextQuestionDifficulty(null, 'correct', 100), null)
})

test('behavioural evaluations are never assigned a technical correctness score', () => {
  const raw = evaluation()
  raw.correctness = {
    verdict: 'correct',
    score: 100,
    expectedAnswer: '',
    keyConceptsCovered: [],
    keyConceptsMissing: [],
    factualErrors: [],
    improvementAdvice: '',
    confidence: 0.5,
  }
  const parsed = normalizeEvaluation(raw, 'behavioral')
  assertEvaluated(parsed)
  assert.equal(parsed.correctnessVerdict, 'not_applicable')
  assert.equal(parsed.correctnessScore, null)
})

test('generated questions are bounded, typed and reject near-duplicates', () => {
  const parsed = normalizeGeneratedQuestion({
    question: '  How   does a hash map handle collisions?  ',
    category: 'Data Structures',
    difficulty: 'MEDIUM',
    topic: 'Hashing',
    rationale: 'The previous answer did not mention collisions.',
  })
  assert.ok(parsed)
  assert.equal(parsed.questionText, 'How does a hash map handle collisions?')
  assert.equal(parsed.difficulty, 'medium')
  assert.equal(parsed.category, 'Data Structures')
  assert.equal(parsed.topic, 'Hashing')

  assert.equal(
    isDuplicateQuestion(
      'How does a hash map handle collisions',
      ['How does a hash map handle collisions?'],
    ),
    true,
  )
  assert.equal(
    isDuplicateQuestion('Explain database transaction isolation levels.', [
      'How does a hash map handle collisions?',
    ]),
    false,
  )
  assert.equal(normalizeGeneratedQuestion({ category: 'No question text' }), null)
})

test('duplicate submissions reuse only a matching or already-answered next question', () => {
  const base = {
    answerText: '',
    questionSource: 'ai',
    generationSourceAnswerHash: 'hash-1',
  }

  assert.equal(shouldReuseNextQuestion(base, 'hash-1'), true)
  assert.equal(shouldReuseNextQuestion(base, 'hash-2'), false)
  assert.equal(
    shouldReuseNextQuestion({ ...base, questionSource: 'static', generationSourceAnswerHash: null }, 'hash-1'),
    false,
  )
  assert.equal(
    shouldReuseNextQuestion({ ...base, answerText: 'Already answered' }, 'different-hash'),
    true,
  )
  assert.equal(shouldReuseNextQuestion(null, 'hash-1'), false)
})

test('question counts fall back to the documented default outside 3-12', () => {
  assert.equal(resolveQuestionCount(3), 3)
  assert.equal(resolveQuestionCount('10'), 10)
  assert.equal(resolveQuestionCount(2), 8)
  assert.equal(resolveQuestionCount(13), 8)
  assert.equal(resolveQuestionCount(4.5), 8)
  assert.equal(resolveQuestionCount(undefined), 8)
})

test('persisted correctness and generated-question metadata map to the API', () => {
  const evaluation = mapEvaluationRow({
    id: 'evaluation-1',
    session_id: 'session-1',
    question_index: 1,
    status: 'evaluated',
    score: 72,
    summary: 'Mostly accurate.',
    strengths: ['Clear'],
    improvements: ['Handle empty input'],
    suggested_answer: 'Reference answer',
    criteria: [{ criterion: 'Correctness', score: 16, maxScore: 25, feedback: 'Mostly correct.' }],
    model: 'test-model',
    answer_hash: 'hash-1',
    correctness_verdict: 'mostly_correct',
    correctness_score: 78,
    key_concepts_covered: ['Complexity'],
    key_concepts_missing: ['Empty input'],
    factual_errors: [],
    expected_answer: 'Expected points',
    improvement_advice: 'Cover the empty case.',
    confidence: 0.8,
    evaluated_at: '2026-01-01T10:10:00.000Z',
    created_at: '2026-01-01T10:10:00.000Z',
    updated_at: '2026-01-01T10:10:00.000Z',
  } as EvaluationRow)

  assert.equal(evaluation.correctnessVerdict, 'mostly_correct')
  assert.equal(evaluation.correctnessScore, 78)
  assert.deepEqual(evaluation.keyConceptsMissing, ['Empty input'])
  assert.equal(evaluation.confidence, 0.8)

  const turn = mapTurnRow({
    id: 'turn-1',
    session_id: 'session-1',
    question_index: 1,
    question_text: 'Generated question?',
    question_key: 'Hashing',
    answer_text: '',
    spoken_seconds: 0,
    question_source: 'ai',
    question_difficulty: 'medium',
    question_topic: 'Hashing',
    generation_source_answer_hash: 'hash-1',
    generation_rationale: 'Probe the missing concept.',
    created_at: '2026-01-01T10:10:00.000Z',
    updated_at: '2026-01-01T10:10:00.000Z',
  } as TurnRow)

  assert.equal(turn.questionSource, 'ai')
  assert.equal(turn.questionDifficulty, 'medium')
  assert.equal(turn.questionTopic, 'Hashing')
  assert.equal(turn.generationRationale, 'Probe the missing concept.')

  const older = mapEvaluationRow({
    id: 'evaluation-2',
    session_id: 'session-1',
    question_index: 0,
    status: 'evaluated',
    score: 60,
    summary: 'Older evaluation.',
    strengths: null,
    improvements: null,
    suggested_answer: '',
    criteria: [],
    model: null,
    answer_hash: null,
    correctness_verdict: null,
    correctness_score: null,
    key_concepts_covered: null,
    key_concepts_missing: null,
    factual_errors: null,
    expected_answer: null,
    improvement_advice: null,
    confidence: null,
    evaluated_at: null,
    created_at: '2026-01-01T10:10:00.000Z',
    updated_at: '2026-01-01T10:10:00.000Z',
  } as EvaluationRow)
  assert.equal(older.correctnessVerdict, null)
  assert.equal(older.correctnessScore, null)
})
