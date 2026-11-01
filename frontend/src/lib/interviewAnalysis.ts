import type { FaceAnalysisMetrics } from './faceAnalysis'

export type MediaAccess = 'granted' | 'denied' | 'unsupported' | 'pending'
export type FaceModelState = 'idle' | 'loading' | 'running' | 'error' | 'unsupported'
export type FramingKey = 'good' | 'too-close' | 'too-far' | 'off-center' | 'no-face'
export type HeadKey = 'center' | 'left' | 'right' | 'unknown'
export type MovementKey = 'still' | 'moving' | 'unknown'

export interface InterviewAnalysisSummary {
  version: 1
  capturedAt: string
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
    capturedAt?: string
  },
): InterviewAnalysisSummary {
  const access = mediaAccess(input.mediaStatus)
  return {
    version: 1,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
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
