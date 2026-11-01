export type InterviewAnalysisValidation =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string }

const MAX_COUNT = 1_000_000
const ACCESS_VALUES = ['granted', 'denied', 'unsupported', 'pending'] as const
const MODEL_VALUES = ['idle', 'loading', 'running', 'error', 'unsupported'] as const
const FRAMING_KEYS = ['good', 'too-close', 'too-far', 'off-center', 'no-face'] as const
const HEAD_KEYS = ['center', 'left', 'right', 'unknown'] as const
const MOVEMENT_KEYS = ['still', 'moving', 'unknown'] as const
const EYE_CONTACT_KEYS = ['onCamera', 'away', 'unavailable'] as const

type Access = (typeof ACCESS_VALUES)[number]
type Model = (typeof MODEL_VALUES)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT
    ? value
    : null
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function readCountRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
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

export function validateInterviewAnalysis(value: unknown): InterviewAnalysisValidation {
  if (!isRecord(value)) return { ok: false, message: 'Analysis must be a JSON object.' }
  if (value.version !== 1) return { ok: false, message: 'Unsupported analysis version.' }
  if (
    typeof value.capturedAt !== 'string' ||
    value.capturedAt.length > 64 ||
    Number.isNaN(Date.parse(value.capturedAt))
  ) {
    return { ok: false, message: 'capturedAt must be a valid date.' }
  }
  if (!isRecord(value.camera) || !isRecord(value.audio)) {
    return { ok: false, message: 'Analysis camera and audio objects are required.' }
  }

  const camera = value.camera
  const audio = value.audio
  const access = readEnum<Access>(camera.access, ACCESS_VALUES)
  const model = readEnum<Model>(camera.model, MODEL_VALUES)
  const samples = readCount(camera.samples)
  const faceDetected = readCount(camera.faceDetected)
  const framing = readCountRecord(camera.framing, FRAMING_KEYS)
  const head = readCountRecord(camera.head, HEAD_KEYS)
  const eyeContact = readCountRecord(camera.eyeContact, EYE_CONTACT_KEYS)
  const movement = readCountRecord(camera.movement, MOVEMENT_KEYS)
  const audioAccess = readEnum<Access>(audio.access, ACCESS_VALUES)

  if (access === null) return { ok: false, message: 'camera.access is invalid.' }
  if (model === null) return { ok: false, message: 'camera.model is invalid.' }
  if (samples === null) return { ok: false, message: 'camera.samples is invalid.' }
  if (faceDetected === null) return { ok: false, message: 'camera.faceDetected is invalid.' }
  if (faceDetected > samples) {
    return { ok: false, message: 'camera.faceDetected cannot exceed camera.samples.' }
  }
  if (framing === null) return { ok: false, message: 'camera.framing is invalid.' }
  if (head === null) return { ok: false, message: 'camera.head is invalid.' }
  if (eyeContact === null) return { ok: false, message: 'camera.eyeContact is invalid.' }
  if (movement === null) return { ok: false, message: 'camera.movement is invalid.' }
  if (audioAccess === null) return { ok: false, message: 'audio.access is invalid.' }
  if (typeof camera.used !== 'boolean') return { ok: false, message: 'camera.used must be a boolean.' }
  if (typeof audio.used !== 'boolean') return { ok: false, message: 'audio.used must be a boolean.' }
  if (typeof audio.speechRecognitionSupported !== 'boolean') {
    return { ok: false, message: 'audio.speechRecognitionSupported must be a boolean.' }
  }

  const allCounts = [
    ...Object.values(framing),
    ...Object.values(head),
    ...Object.values(eyeContact),
    ...Object.values(movement),
  ]
  if (allCounts.some((count) => count > samples)) {
    return { ok: false, message: 'Analysis counts cannot exceed camera.samples.' }
  }

  return {
    ok: true,
    value: {
      version: 1,
      capturedAt: new Date(value.capturedAt).toISOString(),
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
    },
  }
}
