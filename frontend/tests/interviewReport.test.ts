import assert from 'node:assert/strict'
import test from 'node:test'
import type { FaceAnalysisMetrics } from '../src/lib/faceAnalysis.ts'
import {
  buildAnalysisSummary,
  buildCommunicationDelivery,
  buildCorrectnessInsights,
  buildInterviewInsights,
  buildOnCameraPresentation,
  cameraAnalysisEnabled,
  countTranscriptFillers,
  createAnalysisAccumulator,
  parseAnalysisSummary,
  recordAnalysisSample,
  type InterviewAnalysisSummary,
} from '../src/lib/interviewAnalysis.ts'
import { buildReportFromRemote } from '../src/lib/interviewReport.ts'
import type { InterviewSession, InterviewTurn } from '../src/lib/interviews.ts'

function analysisSummary(overrides: Partial<InterviewAnalysisSummary['camera']> = {}): InterviewAnalysisSummary {
  return {
    version: 1,
    capturedAt: '2026-01-01T10:05:00.000Z',
    consent: null,
    camera: {
      access: 'granted',
      used: true,
      model: 'running',
      samples: 10,
      faceDetected: 10,
      framing: { good: 8, 'too-close': 1, 'too-far': 0, 'off-center': 1, 'no-face': 0 },
      head: { center: 8, left: 1, right: 1, unknown: 0 },
      eyeContact: { onCamera: 7, away: 3, unavailable: 0 },
      movement: { still: 8, moving: 2, unknown: 0 },
      ...overrides,
    },
    audio: { access: 'granted', used: true, speechRecognitionSupported: true },
  }
}

function session(config: Record<string, unknown>): InterviewSession {
  return {
    id: 'session-1',
    studentId: 'student-1',
    interviewType: 'technical',
    mode: 'technical',
    difficulty: 'Medium',
    experience: 'Fresher',
    targetRole: 'Software Engineer',
    targetCompany: 'Acme',
    language: 'en',
    status: 'completed',
    overallScore: null,
    config,
    clientSessionId: null,
    startedAt: '2026-01-01T10:00:00.000Z',
    completedAt: '2026-01-01T10:10:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
  }
}

function turn(
  index: number,
  answerText: string,
  spokenSeconds: number,
  overrides: Partial<InterviewTurn> = {},
): InterviewTurn {
  return {
    id: `turn-${index}`,
    sessionId: 'session-1',
    questionIndex: index,
    questionText: `Question ${index + 1}`,
    questionKey: 'technical',
    answerText,
    spokenSeconds,
    questionSource: 'static',
    questionDifficulty: null,
    questionTopic: null,
    generationRationale: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  }
}

function faceMetrics(overrides: Partial<FaceAnalysisMetrics> = {}): FaceAnalysisMetrics {
  return {
    status: 'running',
    faceDetected: true,
    framing: 'good',
    faceSizePercent: 30,
    headHorizontal: 'center',
    headTiltDegrees: 2,
    gazeOnCamera: true,
    movement: 'still',
    error: '',
    ...overrides,
  }
}

test('builds a report with persisted analysis and without breaking older sessions', () => {
  const report = buildReportFromRemote(
    session({ typeLabel: 'Technical', analysis: analysisSummary() }),
    [turn(0, 'A complete answer.', 30)],
    [],
  )
  const older = buildReportFromRemote(session({ typeLabel: 'Technical' }), [], [])

  assert.equal(report.analysis?.camera.samples, 10)
  assert.equal(report.analysis?.camera.framing.good, 8)
  assert.equal(report.durationSeconds, 600)
  assert.equal(report.answeredCount, 1)
  assert.equal(older.analysis, null)
  assert.equal(older.totalQuestions, 0)
})

test('keeps adaptive question provenance for the report', () => {
  const report = buildReportFromRemote(
    session({ typeLabel: 'Technical' }),
    [
      turn(0, 'A complete answer.', 30),
      turn(1, '', 0, {
        questionText: 'How does a hash map handle collisions?',
        questionSource: 'ai',
        questionDifficulty: 'medium',
        questionTopic: 'Hashing',
      }),
    ],
    [],
  )

  assert.equal(report.turns[0].source, 'static')
  assert.equal(report.turns[0].difficulty, null)
  assert.equal(report.turns[1].source, 'ai')
  assert.equal(report.turns[1].difficulty, 'medium')
  assert.equal(report.turns[1].topic, 'Hashing')
  assert.equal(report.turns[1].answered, false)
})

test('summarises correctness without inventing topics or scores', () => {
  const summary = buildCorrectnessInsights(
    [
      {
        index: 0,
        status: 'evaluated',
        correctnessVerdict: 'partially_correct',
        correctnessScore: 50,
        keyConceptsMissing: ['Empty input', 'Time complexity'],
      },
      {
        index: 1,
        status: 'evaluated',
        correctnessVerdict: 'correct',
        correctnessScore: 90,
        keyConceptsMissing: [],
      },
      {
        index: 2,
        status: 'failed',
        correctnessVerdict: null,
        correctnessScore: null,
        keyConceptsMissing: [],
      },
    ],
    [
      { index: 0, topic: 'Hashing', question: 'How do hash maps work?' },
      { index: 1, topic: 'Databases', question: 'Explain indexes.' },
      { index: 2, topic: 'Hashing', question: 'Explain collisions.' },
    ],
  )

  assert.equal(summary.evaluatedCount, 2)
  assert.equal(summary.averageCorrectness, 70)
  assert.deepEqual(summary.weakTopics, ['Hashing'])
  assert.ok(summary.recommendedTopics.includes('Hashing'))
  assert.ok(summary.recommendedTopics.includes('Empty input'))

  const older = buildCorrectnessInsights(
    [{ index: 0, status: 'evaluated', correctnessVerdict: null, correctnessScore: null, keyConceptsMissing: [] }],
    [{ index: 0, topic: 'Hashing', question: 'Older evaluation' }],
  )
  assert.equal(older.averageCorrectness, null)
  assert.deepEqual(older.weakTopics, [])
  assert.deepEqual(older.recommendedTopics, [])
})

test('rejects malformed persisted analysis instead of rendering it', () => {
  const invalid = analysisSummary()
  invalid.camera.faceDetected = 99

  assert.equal(parseAnalysisSummary(invalid), null)
  assert.equal(parseAnalysisSummary({ version: 2 }), null)
  assert.equal(parseAnalysisSummary(null), null)
})

test('aggregates on-device samples into a bounded summary', () => {
  const accumulator = createAnalysisAccumulator()
  accumulator.cameraUsed = true
  accumulator.microphoneUsed = true
  recordAnalysisSample(accumulator, faceMetrics())
  recordAnalysisSample(accumulator, faceMetrics({ faceDetected: false, framing: 'no-face', gazeOnCamera: null, movement: null }))

  const summary = buildAnalysisSummary(accumulator, {
    mediaStatus: 'ready',
    faceModel: 'running',
    speechRecognitionSupported: true,
    capturedAt: '2026-01-01T10:05:00.000Z',
  })

  assert.equal(summary.camera.samples, 2)
  assert.equal(summary.camera.faceDetected, 1)
  assert.equal(summary.camera.framing.good, 1)
  assert.equal(summary.camera.framing['no-face'], 1)
  assert.equal(summary.camera.eyeContact.onCamera, 1)
  assert.equal(summary.camera.eyeContact.unavailable, 0)
  assert.equal(summary.camera.movement.still, 1)
  assert.equal(summary.audio.used, true)
})

test('derives insights from evaluations, answers and analysis without inventing values', () => {
  const insights = buildInterviewInsights(
    [
      { status: 'evaluated', score: 50, strengths: ['Clear structure'], improvements: ['Add examples'] },
      { status: 'failed', score: null, strengths: [], improvements: [] },
    ],
    [
      { answer: Array.from({ length: 100 }, (_, i) => `word${i}`).join(' '), answered: true, spokenSeconds: 20 },
      { answer: '', answered: false, spokenSeconds: 0 },
    ],
    analysisSummary({
      samples: 20,
      faceDetected: 10,
      eyeContact: { onCamera: 4, away: 6, unavailable: 0 },
      movement: { still: 0, moving: 10, unknown: 0 },
    }),
  )

  assert.deepEqual(insights.strengths, ['Clear structure'])
  assert.deepEqual(insights.improvements, ['Add examples'])
  assert.equal(insights.wordCount, 100)
  assert.equal(insights.wordsPerMinute, 300)
  assert.ok(insights.recommendations.some((item) => item.includes('left unanswered')))
  assert.ok(insights.recommendations.some((item) => item.includes('Slow your speaking pace')))
  assert.ok(insights.recommendations.some((item) => item.includes('face clearly visible')))
  assert.ok(insights.recommendations.some((item) => item.includes('Look toward the camera')))
})

test('returns no fabricated strengths or improvements when data is missing', () => {
  const insights = buildInterviewInsights(
    [],
    [{ answer: 'A short answer.', answered: true, spokenSeconds: 0 }],
    null,
  )

  assert.deepEqual(insights.strengths, [])
  assert.deepEqual(insights.improvements, [])
  assert.equal(insights.wordsPerMinute, null)
  assert.ok(insights.recommendations.includes('Evaluate at least one answer to get feedback on answer quality.'))
})

test('persists optional analysis consent and tolerates older summaries', () => {
  const accumulator = createAnalysisAccumulator()
  const summary = buildAnalysisSummary(accumulator, {
    mediaStatus: 'ready',
    faceModel: 'running',
    speechRecognitionSupported: true,
    consent: { cameraPresentation: false, communication: true },
    capturedAt: '2026-01-01T10:05:00.000Z',
  })

  assert.deepEqual(summary.consent, { cameraPresentation: false, communication: true })
  assert.deepEqual(parseAnalysisSummary(summary)?.consent, { cameraPresentation: false, communication: true })

  // Older sessions have no consent key at all: null, never a guess.
  const legacy = analysisSummary()
  const { consent: _dropped, ...legacyWithoutConsent } = legacy
  assert.equal(parseAnalysisSummary(legacyWithoutConsent)?.consent, null)

  // Half-formed consent is ignored rather than trusted.
  assert.equal(
    parseAnalysisSummary({ ...legacy, consent: { cameraPresentation: true } })?.consent,
    null,
  )
})

test('consent gates face analysis without ever blocking the interview', () => {
  const declined = { cameraPresentation: false, communication: true }
  assert.equal(cameraAnalysisEnabled(declined, true), false)
  assert.equal(cameraAnalysisEnabled(declined, false), false)
  assert.equal(cameraAnalysisEnabled({ cameraPresentation: true, communication: true }, true), true)
  // Older sessions carry no consent record and keep working as before.
  assert.equal(cameraAnalysisEnabled(null, true), true)
  // A ready stream alone is never enough while the interview has not started.
  assert.equal(cameraAnalysisEnabled(null, false), false)

  // Declining analysis does not change what the session records about the camera.
  const summary = analysisSummary()
  summary.consent = declined
  const section = buildOnCameraPresentation(summary)
  assert.equal(section.status, 'declined')
  assert.deepEqual(section.metrics, [])
  assert.equal(summary.camera.used, true)
})

test('builds an analysable On-Camera Presentation section from real samples', () => {
  const section = buildOnCameraPresentation(
    analysisSummary({ consent: { cameraPresentation: true, communication: true } }),
  )

  assert.equal(section.status, 'analysed')
  assert.equal(section.reason, null)
  assert.equal(section.metrics.find((metric) => metric.label === 'Face visible')?.value, '100%')
  assert.equal(section.metrics.find((metric) => metric.label === 'Well framed')?.value, '80%')
  assert.equal(section.metrics.find((metric) => metric.label === 'Head centred')?.value, '80%')
  assert.ok(section.strengths.length > 0)
  // No emotion/confidence wording ever reaches the section.
  const text = JSON.stringify(section).toLowerCase()
  assert.equal(text.includes('confiden'), false)
  assert.equal(text.includes('nervous'), false)
})

test('reports On-Camera Presentation as not analysed when declined or too sparse', () => {
  const declined = buildOnCameraPresentation({
    ...analysisSummary(),
    consent: { cameraPresentation: false, communication: true },
  })
  assert.equal(declined.status, 'declined')
  assert.deepEqual(declined.metrics, [])
  assert.deepEqual(declined.strengths, [])

  const sparse = buildOnCameraPresentation(analysisSummary({ samples: 3, faceDetected: 2 }))
  assert.equal(sparse.status, 'insufficient')
  assert.deepEqual(sparse.metrics, [])

  const noCamera = buildOnCameraPresentation(analysisSummary({ used: false, samples: 0, faceDetected: 0 }))
  assert.equal(noCamera.status, 'unavailable')

  assert.equal(buildOnCameraPresentation(null).status, 'unavailable')
})

function evaluation(
  criteria: Array<{ criterion: string; score: number | null; maxScore: number | null }>,
  status = 'evaluated',
) {
  return { status, score: null as number | null, criteria }
}

test('derives a transparent Communication & Delivery score from real criteria', () => {
  const section = buildCommunicationDelivery(
    [
      evaluation([
        { criterion: 'Clarity', score: 20, maxScore: 25 },
        { criterion: 'Structure', score: 15, maxScore: 25 },
        { criterion: 'Relevance', score: 25, maxScore: 25 },
        { criterion: 'Completeness', score: 10, maxScore: 25 },
      ]),
    ],
    [
      {
        answer: Array.from({ length: 100 }, (_, index) => `word${index}`).join(' '),
        answered: true,
        spokenSeconds: 40,
      },
    ],
    analysisSummary(),
  )

  // Clarity+Structure = 70, Relevance = 100, Completeness = 40 -> average 70.
  assert.equal(section.status, 'analysed')
  assert.equal(section.score, 70)
  assert.equal(section.components.find((item) => item.label === 'Clarity & structure')?.score, 70)
  assert.equal(section.components.find((item) => item.label === 'Relevance & technical explanation')?.score, 100)
  assert.equal(section.components.find((item) => item.label === 'Examples & completeness')?.score, 40)
  assert.equal(section.metrics.find((metric) => metric.label === 'Speaking pace')?.value, '150 wpm')
})

test('Communication & Delivery shows Not analysed instead of inventing metrics', () => {
  const noAnswers = buildCommunicationDelivery([], [], analysisSummary())
  assert.equal(noAnswers.status, 'unavailable')
  assert.equal(noAnswers.score, null)

  const noCriteria = buildCommunicationDelivery(
    [evaluation([])],
    [{ answer: 'A short answer.', answered: true, spokenSeconds: 5 }],
    analysisSummary(),
  )
  assert.equal(noCriteria.score, null)
  assert.equal(
    noCriteria.components.find((item) => item.label === 'Clarity & structure')?.score,
    null,
  )
  assert.equal(noCriteria.metrics.find((metric) => metric.label === 'Pauses')?.value, null)
  assert.equal(noCriteria.metrics.find((metric) => metric.label === 'Filler words')?.value, null)
  assert.equal(noCriteria.metrics.find((metric) => metric.label === 'Speaking pace')?.value, null)

  const declined = buildCommunicationDelivery(
    [evaluation([{ criterion: 'Clarity', score: 20, maxScore: 25 }])],
    [{ answer: 'A short answer.', answered: true, spokenSeconds: 5 }],
    { ...analysisSummary(), consent: { cameraPresentation: true, communication: false } },
  )
  assert.equal(declined.status, 'declined')
  assert.equal(declined.score, null)
})

test('counts explicit filler words only when a rate is reliable', () => {
  assert.equal(countTranscriptFillers('Um, so, you know, I mean it is kind of done.'), 4)

  const long = Array.from({ length: 40 }, () => 'um word').join(' ')
  const section = buildCommunicationDelivery(
    [],
    [{ answer: long, answered: true, spokenSeconds: 30 }],
    analysisSummary(),
  )
  const fillers = section.metrics.find((metric) => metric.label === 'Filler words')
  // 80 words with 40 fillers is a 50 per-100-words rate.
  assert.equal(fillers?.value, '50 per 100 words')
})

