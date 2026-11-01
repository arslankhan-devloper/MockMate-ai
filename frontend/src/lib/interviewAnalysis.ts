import type { FaceAnalysisMetrics } from './faceAnalysis'

export type MediaAccess = 'granted' | 'denied' | 'unsupported' | 'pending'
export type FaceModelState = 'idle' | 'loading' | 'running' | 'error' | 'unsupported'
export type FramingKey = 'good' | 'too-close' | 'too-far' | 'off-center' | 'no-face'
export type HeadKey = 'center' | 'left' | 'right' | 'unknown'
export type MovementKey = 'still' | 'moving' | 'unknown'

// Explicit, optional consent recorded by the candidate in Interview Setup. It
// is metadata only: declining never blocks the interview and never stops the
// camera from being used for the session itself.
export interface InterviewAnalysisConsent {
  cameraPresentation: boolean
  communication: boolean
}

export interface InterviewAnalysisSummary {
  version: 1
  capturedAt: string
  /** Null for sessions recorded before consent metadata existed. */
  consent: InterviewAnalysisConsent | null
  camera: {
    access: MediaAccess
    used: boolean
    model: FaceModelState
    samples: number
    faceDetected: number
    framing: Record<FramingKey, number>
    head: Record<HeadKey, number>
    eyeContact: { onCamera: number; away: number; unavailable: number }
    movement: Record<MovementKey, number>
  }
  audio: {
    access: MediaAccess
    used: boolean
    speechRecognitionSupported: boolean
  }
}

export interface AnalysisAccumulator {
  cameraUsed: boolean
  microphoneUsed: boolean
  samples: number
  faceDetected: number
  framing: Record<FramingKey, number>
  head: Record<HeadKey, number>
  eyeContact: { onCamera: number; away: number; unavailable: number }
  movement: Record<MovementKey, number>
}

export interface InsightEvaluation {
  status: string
  score: number | null
  strengths: string[]
  improvements: string[]
}

export interface InsightTurn {
  answer: string
  answered: boolean
  spokenSeconds: number
}

export interface InterviewInsights {
  strengths: string[]
  improvements: string[]
  recommendations: string[]
  wordCount: number
  speakingSeconds: number
  wordsPerMinute: number | null
}

/**
 * Whether on-device face analysis may run. Consent is separate from the camera
 * stream itself: declining only stops the analysis, never the interview.
 */
export function cameraAnalysisEnabled(
  consent: InterviewAnalysisConsent | null,
  streamReady: boolean,
): boolean {
  return streamReady && consent?.cameraPresentation !== false
}

export function createAnalysisAccumulator(): AnalysisAccumulator {
  return {
    cameraUsed: false,
    microphoneUsed: false,
    samples: 0,
    faceDetected: 0,
    framing: { good: 0, 'too-close': 0, 'too-far': 0, 'off-center': 0, 'no-face': 0 },
    head: { center: 0, left: 0, right: 0, unknown: 0 },
    eyeContact: { onCamera: 0, away: 0, unavailable: 0 },
    movement: { still: 0, moving: 0, unknown: 0 },
  }
}

export function recordAnalysisSample(
  accumulator: AnalysisAccumulator,
  face: FaceAnalysisMetrics,
): void {
  if (face.status !== 'running') return
  accumulator.samples += 1
  if (!face.faceDetected) {
    accumulator.framing['no-face'] += 1
    return
  }

  accumulator.faceDetected += 1
  if (face.framing === 'no-face') accumulator.framing['no-face'] += 1
  else accumulator.framing[face.framing] += 1

  if (face.headHorizontal) accumulator.head[face.headHorizontal] += 1
  else accumulator.head.unknown += 1

  if (face.gazeOnCamera === true) accumulator.eyeContact.onCamera += 1
  else if (face.gazeOnCamera === false) accumulator.eyeContact.away += 1
  else accumulator.eyeContact.unavailable += 1

  if (face.movement) accumulator.movement[face.movement] += 1
  else accumulator.movement.unknown += 1
}

function mediaAccess(status: 'requesting' | 'ready' | 'error' | 'unsupported'): MediaAccess {
  if (status === 'ready') return 'granted'
  if (status === 'error') return 'denied'
  if (status === 'unsupported') return 'unsupported'
  return 'pending'
}

export function buildAnalysisSummary(
  accumulator: AnalysisAccumulator,
  input: {
    mediaStatus: 'requesting' | 'ready' | 'error' | 'unsupported'
    faceModel: FaceModelState
    speechRecognitionSupported: boolean
    consent?: InterviewAnalysisConsent | null
    capturedAt?: string
  },
): InterviewAnalysisSummary {
  const access = mediaAccess(input.mediaStatus)
  return {
    version: 1,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    consent: input.consent ?? null,
    camera: {
      access,
      used: accumulator.cameraUsed,
      model: input.faceModel,
      samples: accumulator.samples,
      faceDetected: accumulator.faceDetected,
      framing: { ...accumulator.framing },
      head: { ...accumulator.head },
      eyeContact: { ...accumulator.eyeContact },
      movement: { ...accumulator.movement },
    },
    audio: {
      access,
      used: accumulator.microphoneUsed,
      speechRecognitionSupported: input.speechRecognitionSupported,
    },
  }
}

const MAX_COUNT = 1_000_000
const ACCESS_VALUES: MediaAccess[] = ['granted', 'denied', 'unsupported', 'pending']
const MODEL_VALUES: FaceModelState[] = ['idle', 'loading', 'running', 'error', 'unsupported']
const FRAMING_KEYS: FramingKey[] = ['good', 'too-close', 'too-far', 'off-center', 'no-face']
const HEAD_KEYS: HeadKey[] = ['center', 'left', 'right', 'unknown']
const MOVEMENT_KEYS: MovementKey[] = ['still', 'moving', 'unknown']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT
    ? value
    : null
}

function readEnum<T extends string>(value: unknown, allowed: T[]): T | null {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : null
}

function readCountRecord<K extends string>(
  value: unknown,
  keys: K[],
): Record<K, number> | null {
  if (!isRecord(value)) return null
  const out = {} as Record<K, number>
  for (const key of keys) {
    const count = readCount(value[key])
    if (count === null) return null
    out[key] = count
  }
  return out
}

// Consent is optional metadata: an older summary (or a malformed one) simply
// reports `null` instead of failing the whole analysis.
function readConsent(value: unknown): InterviewAnalysisConsent | null {
  if (!isRecord(value)) return null
  if (typeof value.cameraPresentation !== 'boolean') return null
  if (typeof value.communication !== 'boolean') return null
  return {
    cameraPresentation: value.cameraPresentation,
    communication: value.communication,
  }
}

export function parseAnalysisSummary(value: unknown): InterviewAnalysisSummary | null {
  if (!isRecord(value) || value.version !== 1) return null
  if (
    typeof value.capturedAt !== 'string' ||
    value.capturedAt.length > 64 ||
    Number.isNaN(Date.parse(value.capturedAt))
  ) {
    return null
  }
  if (!isRecord(value.camera) || !isRecord(value.audio)) return null

  const camera = value.camera
  const audio = value.audio
  const access = readEnum(camera.access, ACCESS_VALUES)
  const model = readEnum(camera.model, MODEL_VALUES)
  const samples = readCount(camera.samples)
  const faceDetected = readCount(camera.faceDetected)
  const framing = readCountRecord(camera.framing, FRAMING_KEYS)
  const head = readCountRecord(camera.head, HEAD_KEYS)
  const eyeContact = readCountRecord(camera.eyeContact, ['onCamera', 'away', 'unavailable'] as const)
  const movement = readCountRecord(camera.movement, MOVEMENT_KEYS)
  const audioAccess = readEnum(audio.access, ACCESS_VALUES)

  if (
    access === null ||
    model === null ||
    samples === null ||
    faceDetected === null ||
    faceDetected > samples ||
    framing === null ||
    head === null ||
    eyeContact === null ||
    movement === null ||
    audioAccess === null ||
    typeof camera.used !== 'boolean' ||
    typeof audio.used !== 'boolean' ||
    typeof audio.speechRecognitionSupported !== 'boolean'
  ) {
    return null
  }

  for (const count of [...Object.values(framing), ...Object.values(head), ...Object.values(eyeContact), ...Object.values(movement)]) {
    if (count > samples) return null
  }

  return {
    version: 1,
    capturedAt: value.capturedAt,
    consent: readConsent(value.consent),
    camera: {
      access,
      used: camera.used,
      model,
      samples,
      faceDetected,
      framing,
      head,
      eyeContact,
      movement,
    },
    audio: {
      access: audioAccess,
      used: audio.used,
      speechRecognitionSupported: audio.speechRecognitionSupported,
    },
  }
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function percent(count: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((count / total) * 100)
}

export interface CorrectnessInsightEvaluation {
  index: number
  status: string
  correctnessVerdict: string | null
  correctnessScore: number | null
  keyConceptsMissing: string[]
}

export interface CorrectnessInsightTurn {
  index: number
  topic: string | null
  question: string
}

export interface CorrectnessInsights {
  evaluatedCount: number
  averageCorrectness: number | null
  weakTopics: string[]
  recommendedTopics: string[]
}

// Summarises only real technical-correctness data. It never turns missing
// fields into a score or invents a weak topic for an older evaluation.
export function buildCorrectnessInsights(
  evaluations: CorrectnessInsightEvaluation[],
  turns: CorrectnessInsightTurn[],
): CorrectnessInsights {
  const turnByIndex = new Map(turns.map((turn) => [turn.index, turn]))
  const topicScores = new Map<string, { sum: number; count: number }>()
  const missingConcepts = new Map<string, number>()
  const scores: number[] = []

  for (const evaluation of evaluations) {
    if (evaluation.status !== 'evaluated') continue
    if (typeof evaluation.correctnessScore === 'number') scores.push(evaluation.correctnessScore)

    for (const concept of evaluation.keyConceptsMissing) {
      const label = concept.trim()
      if (!label) continue
      missingConcepts.set(label, (missingConcepts.get(label) ?? 0) + 1)
    }

    if (typeof evaluation.correctnessScore !== 'number') continue
    const turn = turnByIndex.get(evaluation.index)
    const topic = (turn?.topic ?? '').trim()
    if (!topic) continue
    const current = topicScores.get(topic) ?? { sum: 0, count: 0 }
    current.sum += evaluation.correctnessScore
    current.count += 1
    topicScores.set(topic, current)
  }

  const weakTopics = [...topicScores.entries()]
    .map(([topic, value]) => ({ topic, average: value.sum / value.count }))
    .filter((item) => item.average < 75)
    .sort((a, b) => a.average - b.average || a.topic.localeCompare(b.topic))
    .slice(0, 5)
    .map((item) => item.topic)

  const mostMissed = [...missingConcepts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([concept]) => concept)

  return {
    evaluatedCount: scores.length,
    averageCorrectness:
      scores.length > 0
        ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
        : null,
    weakTopics,
    recommendedTopics: unique([...weakTopics, ...mostMissed]).slice(0, 6),
  }
}

export function buildInterviewInsights(
  evaluations: InsightEvaluation[],
  turns: InsightTurn[],
  analysis: InterviewAnalysisSummary | null,
): InterviewInsights {
  const wordCount = turns.reduce((sum, turn) => {
    if (!turn.answered) return sum
    const words = turn.answer.trim().split(/\s+/).filter(Boolean).length
    return sum + words
  }, 0)
  const speakingSeconds = turns.reduce((sum, turn) => sum + Math.max(0, turn.spokenSeconds), 0)
  const wordsPerMinute =
    speakingSeconds >= 10 && wordCount >= 10
      ? Math.round(wordCount / (speakingSeconds / 60))
      : null

  const evaluated = evaluations.filter(
    (evaluation) => evaluation.status === 'evaluated' && typeof evaluation.score === 'number',
  )
  const average =
    evaluated.length > 0
      ? Math.round(
          evaluated.reduce((sum, evaluation) => sum + (evaluation.score ?? 0), 0) / evaluated.length,
        )
      : null

  const strengths = unique(evaluations.flatMap((evaluation) => evaluation.strengths)).slice(0, 5)
  const improvements = unique(evaluations.flatMap((evaluation) => evaluation.improvements)).slice(0, 5)
  const answered = turns.filter((turn) => turn.answered).length
  const unanswered = turns.length - answered
  const recommendations: string[] = []

  if (unanswered > 0) {
    recommendations.push(
      `Answer every question: ${unanswered} of ${turns.length} were left unanswered.`,
    )
  }
  if (evaluated.length === 0) {
    recommendations.push('Evaluate at least one answer to get feedback on answer quality.')
  } else if (average !== null && average < 60) {
    recommendations.push('Review the core concepts and practise structuring each answer with a clear example.')
  } else if (average !== null && average >= 80) {
    recommendations.push('Move to a harder difficulty and practise concise, high-impact answers.')
  } else {
    recommendations.push('Use the per-answer feedback below to tighten your weakest responses.')
  }

  if (wordsPerMinute !== null && wordsPerMinute > 180) {
    recommendations.push('Slow your speaking pace; aim for a steady, clear delivery.')
  } else if (wordsPerMinute !== null && wordsPerMinute < 90) {
    recommendations.push('Expand your spoken answers with more detail and concrete examples.')
  }
  if (answered >= 2 && speakingSeconds > 0 && speakingSeconds / answered < 20) {
    recommendations.push('Speak for longer per answer; aim for a complete explanation, not a one-line response.')
  }

  if (analysis?.audio.used === false) {
    recommendations.push('Use the microphone for spoken practice so speech timing and pacing can be captured.')
  }

  const camera = analysis?.camera
  if (camera && camera.used && camera.samples >= 10) {
    const detectionRate = percent(camera.faceDetected, camera.samples)
    if (detectionRate !== null && detectionRate < 70) {
      recommendations.push('Keep your face clearly visible and centred in the camera frame.')
    }
    const gazeTotal = camera.eyeContact.onCamera + camera.eyeContact.away
    const gazeRate = percent(camera.eyeContact.onCamera, gazeTotal)
    if (gazeRate !== null && gazeTotal >= 10 && gazeRate < 60) {
      recommendations.push('Look toward the camera more often while answering.')
    }
    const movementRate = percent(camera.movement.moving, camera.faceDetected)
    if (movementRate !== null && camera.faceDetected >= 10 && movementRate >= 50) {
      recommendations.push('Reduce unnecessary movement to keep your framing steady.')
    }
  }

  return {
    strengths,
    improvements,
    recommendations: recommendations.slice(0, 5),
    wordCount,
    speakingSeconds,
    wordsPerMinute,
  }
}

// ── Report sections ──────────────────────────────────────────────────
// The report renders two sections built from the persisted aggregate summary
// and the real answer evaluations. Every builder here returns an explicit
// "not analysed" state instead of a fabricated score when data is missing.

export type SectionStatus = 'analysed' | 'declined' | 'insufficient' | 'unavailable'

export interface SectionMetric {
  label: string
  /** Percentage string, or null when the underlying count did not exist. */
  value: string | null
  note: string
}

export interface PresentationSection {
  status: SectionStatus
  reason: string | null
  metrics: SectionMetric[]
  strengths: string[]
  suggestions: string[]
}

export interface CommunicationComponent {
  label: string
  score: number | null
  note: string
}

export interface CommunicationSection {
  status: SectionStatus
  reason: string | null
  /** Transparent average of the observable components; null when unmeasured. */
  score: number | null
  components: CommunicationComponent[]
  metrics: SectionMetric[]
  strengths: string[]
  suggestions: string[]
}

/** Minimum samples before percentages are shown as findings. */
export const MIN_CAMERA_SAMPLES = 10
export const MIN_FACE_SAMPLES = 5
/** Minimum words before a transcript-derived rate is treated as reliable. */
export const MIN_WORDS_FOR_RATE = 60

function pctLabel(value: number | null): string | null {
  return value === null ? null : `${value}%`
}

export function buildOnCameraPresentation(
  analysis: InterviewAnalysisSummary | null,
): PresentationSection {
  const unavailable = (reason: string, status: SectionStatus): PresentationSection => ({
    status,
    reason,
    metrics: [],
    strengths: [],
    suggestions: [],
  })

  if (!analysis) {
    return unavailable(
      'No on-device camera summary was saved for this session, so on-camera presentation is not analysed.',
      'unavailable',
    )
  }
  if (analysis.consent?.cameraPresentation === false) {
    return unavailable(
      'On-camera presentation analysis was turned off for this session. The interview itself ran normally.',
      'declined',
    )
  }

  const camera = analysis.camera
  if (!camera.used) {
    return unavailable(
      'The camera was not used in this session, so there is no framing or visibility data to analyse.',
      'unavailable',
    )
  }
  if (camera.samples < MIN_CAMERA_SAMPLES || camera.faceDetected < MIN_FACE_SAMPLES) {
    return unavailable(
      `Too little camera data was captured to analyse presentation (${camera.samples} sample${
        camera.samples === 1 ? '' : 's'
      }, ${camera.faceDetected} with a visible face). At least ${MIN_CAMERA_SAMPLES} samples and ${MIN_FACE_SAMPLES} visible faces are needed.`,
      'insufficient',
    )
  }

  const visibility = percent(camera.faceDetected, camera.samples)
  const framingGood = percent(camera.framing.good, camera.samples)
  const headCentred = percent(camera.head.center, camera.faceDetected)
  const steady = percent(camera.movement.still, camera.faceDetected)
  const gazeTotal = camera.eyeContact.onCamera + camera.eyeContact.away
  const facing = gazeTotal >= MIN_CAMERA_SAMPLES ? percent(camera.eyeContact.onCamera, gazeTotal) : null

  const metrics: SectionMetric[] = [
    {
      label: 'Face visible',
      value: pctLabel(visibility),
      note: `Visible in ${camera.faceDetected} of ${camera.samples} on-device samples.`,
    },
    {
      label: 'Well framed',
      value: pctLabel(framingGood),
      note: 'Share of samples where the face was a sensible size and centred in frame.',
    },
    {
      label: 'Head centred',
      value: pctLabel(headCentred),
      note: 'Approximate share of samples with the head facing forward.',
    },
    {
      label: 'Framing steady',
      value: pctLabel(steady),
      note: 'Share of samples with little frame-to-frame movement.',
    },
    {
      label: 'Camera-facing (approx.)',
      value: pctLabel(facing),
      note: facing === null
        ? 'Not enough gaze samples were captured.'
        : 'Approximate share of samples looking toward the camera.',
    },
  ]

  const strengths: string[] = []
  const suggestions: string[] = []

  if (visibility !== null && visibility >= 90) {
    strengths.push('Your face stayed visible for almost the whole session.')
  } else if (visibility !== null && visibility < 70) {
    suggestions.push('Keep your face inside the camera frame for the whole answer.')
  }

  if (framingGood !== null && framingGood >= 70) {
    strengths.push('Your framing stayed in a good position for most of the session.')
  } else if (framingGood !== null) {
    suggestions.push('Set the camera at eye level and keep a consistent distance from it.')
  }

  if (headCentred !== null && headCentred >= 70) {
    strengths.push('You kept your head generally facing the camera.')
  } else if (headCentred !== null && headCentred < 50) {
    suggestions.push('Face the camera more directly while answering.')
  }

  if (steady !== null && steady >= 80) {
    strengths.push('Your on-screen position stayed steady.')
  } else if (steady !== null && steady < 50) {
    suggestions.push('Reduce large movements so your framing stays stable.')
  }

  if (facing !== null && facing >= 70) {
    strengths.push('You looked toward the camera for most of the session.')
  } else if (facing !== null && facing < 60) {
    suggestions.push('Look toward the camera more often while answering.')
  }

  return { status: 'analysed', reason: null, metrics, strengths, suggestions }
}

const CLARITY_KEYS = ['clarity', 'structure', 'organisation', 'organization']
const RELEVANCE_KEYS = ['relevance', 'technical', 'accuracy']
const COMPLETENESS_KEYS = ['completeness', 'specificity', 'examples', 'detail']

function criteriaAverage(
  entries: CommunicationEvaluationCriteria[],
  keys: string[],
): number | null {
  let sum = 0
  let count = 0
  for (const entry of entries) {
    const name = entry.criterion.toLowerCase()
    if (!keys.some((key) => name.includes(key))) continue
    if (typeof entry.score !== 'number' || entry.score < 0) continue
    if (typeof entry.maxScore !== 'number' || entry.maxScore <= 0) continue
    sum += (entry.score / entry.maxScore) * 100
    count += 1
  }
  return count > 0 ? Math.round(sum / count) : null
}

export interface CommunicationEvaluationCriteria {
  criterion: string
  score: number | null
  maxScore: number | null
}

export interface CommunicationEvaluation {
  status: string
  score: number | null
  criteria: CommunicationEvaluationCriteria[]
}

const FILLER_PATTERNS = [
  /\bum+\b/gi,
  /\buh+\b/gi,
  /\berm+\b/gi,
  /\byou know\b/gi,
  /\bi mean\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
]

/** Counts explicit filler words present in the stored answer text. */
export function countTranscriptFillers(text: string): number {
  let total = 0
  for (const pattern of FILLER_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) total += matches.length
  }
  return total
}

export function buildCommunicationDelivery(
  evaluations: CommunicationEvaluation[],
  turns: InsightTurn[],
  analysis: InterviewAnalysisSummary | null,
): CommunicationSection {
  const empty = (reason: string, status: SectionStatus): CommunicationSection => ({
    status,
    reason,
    score: null,
    components: [],
    metrics: [],
    strengths: [],
    suggestions: [],
  })

  if (analysis?.consent?.communication === false) {
    return empty(
      'Communication and delivery analysis was turned off for this session. The interview itself ran normally.',
      'declined',
    )
  }

  const answeredTurns = turns.filter((turn) => turn.answered)
  if (answeredTurns.length === 0) {
    return empty(
      'No answers were recorded, so there is no transcript to analyse.',
      'unavailable',
    )
  }

  const evaluated = evaluations.filter(
    (evaluation) => evaluation.status === 'evaluated' && evaluation.criteria.length > 0,
  )
  const criteria = evaluated.flatMap((evaluation) => evaluation.criteria)

  const clarity = criteriaAverage(criteria, CLARITY_KEYS)
  const relevance = criteriaAverage(criteria, RELEVANCE_KEYS)
  const completeness = criteriaAverage(criteria, COMPLETENESS_KEYS)

  const transcript = answeredTurns.map((turn) => turn.answer.trim()).join('\n')
  const wordCount = transcript.split(/\s+/).filter(Boolean).length
  const speakingSeconds = answeredTurns.reduce((sum, turn) => sum + Math.max(0, turn.spokenSeconds), 0)
  const wordsPerMinute =
    speakingSeconds >= 10 && wordCount >= 10
      ? Math.round(wordCount / (speakingSeconds / 60))
      : null

  const measured = [clarity, relevance, completeness].filter(
    (value): value is number => typeof value === 'number',
  )
  const score =
    measured.length > 0 ? Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length) : null

  if (score === null && wordCount === 0) {
    return empty(
      'No evaluated answers and no transcript text were available, so communication and delivery is not analysed.',
      'insufficient',
    )
  }

  const components: CommunicationComponent[] = [
    {
      label: 'Clarity & structure',
      score: clarity,
      note: clarity === null
        ? 'Not analysed - no clarity or structure criterion was returned for these answers.'
        : 'Average of the clarity and structure criteria from the AI answer evaluations.',
    },
    {
      label: 'Relevance & technical explanation',
      score: relevance,
      note: relevance === null
        ? 'Not analysed - no relevance criterion was returned for these answers.'
        : 'Average of the relevance criteria from the AI answer evaluations.',
    },
    {
      label: 'Examples & completeness',
      score: completeness,
      note: completeness === null
        ? 'Not analysed - no completeness criterion was returned for these answers.'
        : 'Average of the completeness and specificity criteria from the AI answer evaluations.',
    },
  ]

  const fillerCount = countTranscriptFillers(transcript)
  const fillersReliable = wordCount >= MIN_WORDS_FOR_RATE
  const fillerRate = fillersReliable ? Number(((fillerCount / wordCount) * 100).toFixed(1)) : null

  const metrics: SectionMetric[] = [
    {
      label: 'Words captured',
      value: `${wordCount}`,
      note: 'Word count from the saved answer transcripts.',
    },
    {
      label: 'Speaking pace',
      value: wordsPerMinute === null ? null : `${wordsPerMinute} wpm`,
      note: wordsPerMinute === null
        ? 'Pace needs at least 10 words and 10 measured speaking seconds.'
        : 'Word count over measured speaking seconds for answered questions.',
    },
    {
      label: 'Filler words',
      value: fillerRate === null ? null : `${fillerRate} per 100 words`,
      note: fillersReliable
        ? `${fillerCount} explicit filler word${fillerCount === 1 ? '' : 's'} in the stored transcript text.`
        : `Not analysed - fewer than ${MIN_WORDS_FOR_RATE} words were captured, so a rate would be unreliable.`,
    },
    {
      label: 'Pauses',
      value: null,
      note: 'Not analysed - pause detection needs reliable per-utterance timing, which this session did not record.',
    },
  ]

  const strengths: string[] = []
  const suggestions: string[] = []

  if (clarity !== null && clarity >= 75) {
    strengths.push('Your answers were clearly structured.')
  } else if (clarity !== null && clarity < 60) {
    suggestions.push('Structure each answer: a direct point, then the reasoning, then a conclusion.')
  }
  if (relevance !== null && relevance >= 75) {
    strengths.push('Your answers stayed relevant to the question asked.')
  } else if (relevance !== null && relevance < 60) {
    suggestions.push('Answer the exact question first, then add supporting detail.')
  }
  if (completeness !== null && completeness >= 75) {
    strengths.push('You backed answers with concrete detail and examples.')
  } else if (completeness !== null && completeness < 60) {
    suggestions.push('Add one concrete example or project detail to each answer.')
  }
  if (wordsPerMinute !== null && wordsPerMinute > 180) {
    suggestions.push('Slow your speaking pace; aim for a steady, clear delivery.')
  } else if (wordsPerMinute !== null && wordsPerMinute >= 90 && wordsPerMinute <= 180) {
    strengths.push('Your speaking pace was within a comfortable range.')
  } else if (wordsPerMinute !== null && wordsPerMinute < 90) {
    suggestions.push('Expand spoken answers with more detail rather than short replies.')
  }
  if (fillerRate !== null && fillerRate <= 1) {
    strengths.push('Your transcript contained very few filler words.')
  } else if (fillerRate !== null && fillerRate >= 4) {
    suggestions.push('Reduce filler words; a short pause is stronger than "um" or "you know".')
  }

  return {
    status: 'analysed',
    reason: null,
    score,
    components,
    metrics,
    strengths,
    suggestions,
  }
}
