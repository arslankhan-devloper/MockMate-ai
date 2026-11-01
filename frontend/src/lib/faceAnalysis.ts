import { useEffect, useRef, useState, type RefObject } from 'react'
import type { FaceLandmarker, FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

// On-device face analysis. A MediaPipe FaceLandmarker (WASM runtime + model,
// both self-hosted under /mediapipe) runs entirely inside this browser tab on
// the live <video> element. No camera frames, video, audio or biometric data
// ever leave the device — only these derived numbers do, and only to local
// React state.
//
// These are browser-side estimates of observable signals, not validated
// measurements, and they are labelled as such in the UI. We intentionally do
// NOT infer emotion or "confidence" from appearance.

export type FaceAnalysisStatus = 'idle' | 'loading' | 'running' | 'error' | 'unsupported'
export type FramingState = 'no-face' | 'good' | 'too-close' | 'too-far' | 'off-center'
export type HorizontalDirection = 'left' | 'right' | 'center'
export type MovementState = 'still' | 'moving'

export interface FaceAnalysisMetrics {
  status: FaceAnalysisStatus
  faceDetected: boolean
  framing: FramingState
  /** Rounded percentage of the video frame covered by the face's height. */
  faceSizePercent: number | null
  /** Head turn from the candidate's own perspective ("left"/"right"). */
  headHorizontal: HorizontalDirection | null
  /** Head tilt magnitude in degrees (approximate). */
  headTiltDegrees: number | null
  /** Approximate camera-facing indicator (null when iris landmarks are unavailable). */
  gazeOnCamera: boolean | null
  movement: MovementState | null
  error: string
}

const INITIAL: FaceAnalysisMetrics = {
  status: 'idle',
  faceDetected: false,
  framing: 'no-face',
  faceSizePercent: null,
  headHorizontal: null,
  headTiltDegrees: null,
  gazeOnCamera: null,
  movement: null,
  error: '',
}

// ~7.7 detections/sec keeps CPU use reasonable and the UI stable.
const DETECT_INTERVAL_MS = 130
// Re-publish even when nothing changed this often, so the UI never looks stale.
const REFRESH_INTERVAL_MS = 1000
const MOVEMENT_WINDOW_MS = 1200

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const rad2deg = (rad: number) => (rad * 180) / Math.PI

let landmarkerPromise: Promise<FaceLandmarker> | null = null

function assetRoot(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

async function loadLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import('@mediapipe/tasks-vision')
      const root = assetRoot()
      const fileset = await vision.FilesetResolver.forVisionTasks(`${root}mediapipe/wasm`)
      const options = {
        baseOptions: { modelAssetPath: `${root}mediapipe/face_landmarker.task` },
        runningMode: 'VIDEO' as const,
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      }
      try {
        return await vision.FaceLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'GPU' as const },
        })
      } catch {
        // GPU delegate is unavailable on some devices/browsers — fall back to CPU.
        return await vision.FaceLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'CPU' as const },
        })
      }
    })().catch((err) => {
      landmarkerPromise = null
      throw err
    })
  }
  return landmarkerPromise
}

interface Box {
  cx: number
  cy: number
  height: number
}

function boundingBox(lm: NormalizedLandmark[]): Box {
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  for (const p of lm) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, height: maxY - minY }
}

// Horizontal iris offset from the eye's own corner midpoint, normalised by eye
// width. Sign matches the head-turn sign: negative = candidate's right.
function irisHorizontal(lm: NormalizedLandmark[], a: number, b: number, iris: number): number {
  const p0 = lm[a]
  const p1 = lm[b]
  const center = lm[iris]
  const width = Math.max(0.006, Math.abs(p0.x - p1.x))
  return (center.x - (p0.x + p1.x) / 2) / width
}

// Vertical iris offset from the eyelid midpoint, normalised by eye opening.
function irisVertical(lm: NormalizedLandmark[], top: number, bottom: number, iris: number): number {
  const upper = lm[top]
  const lower = lm[bottom]
  const center = lm[iris]
  const opening = Math.abs(lower.y - upper.y)
  if (opening < 0.008) return 0 // eye is blinking/closed — vertical cue is meaningless
  return (center.y - (upper.y + lower.y) / 2) / opening
}

interface MovementPoint {
  t: number
  x: number
  y: number
  yaw: number
}

function spread(values: number[]): number {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return hi - lo
}

function summarize(
  result: FaceLandmarkerResult,
  history: MovementPoint[],
  now: number,
): FaceAnalysisMetrics {
  const lm = result.faceLandmarks?.[0]
  if (!lm || lm.length < 100) {
    history.length = 0
    return { ...INITIAL, status: 'running', framing: 'no-face' }
  }

  const box = boundingBox(lm)
  const faceSizePercent = Math.round(clamp(box.height, 0, 1) * 100)
  const offX = Math.abs(box.cx - 0.5)
  const offY = Math.abs(box.cy - 0.5)

  let framing: FramingState = 'good'
  if (box.height > 0.68) framing = 'too-close'
  else if (box.height < 0.2) framing = 'too-far'
  else if (offX > 0.17 || offY > 0.2) framing = 'off-center'

  // Head turn from landmarks (deterministic 2D geometry, candidate's perspective).
  const eyeRight = lm[33]
  const eyeLeft = lm[263]
  const nose = lm[1]
  const eyeMidX = (eyeRight.x + eyeLeft.x) / 2
  const interOcular = Math.max(0.03, Math.abs(eyeLeft.x - eyeRight.x))
  const yaw = (nose.x - eyeMidX) / interOcular
  const headHorizontal: HorizontalDirection = yaw < -0.22 ? 'right' : yaw > 0.22 ? 'left' : 'center'
  const rollRad = Math.atan2(eyeLeft.y - eyeRight.y, eyeLeft.x - eyeRight.x)
  const headTiltDegrees = Math.round(Math.abs(rad2deg(rollRad)))

  // Approximate camera-facing indicator, only when the model returns iris
  // landmarks (FaceLandmarker publishes 478 points including both irises).
  let gazeOnCamera: boolean | null = null
  if (lm[468] && lm[473]) {
    const h = (irisHorizontal(lm, 33, 133, 468) + irisHorizontal(lm, 362, 263, 473)) / 2
    const v = (irisVertical(lm, 159, 145, 468) + irisVertical(lm, 386, 374, 473)) / 2
    gazeOnCamera = Math.abs(h) < 0.2 && Math.abs(v) < 0.3 && Math.abs(yaw) < 0.45
  }

  // Movement: variation of nose position / head turn over a short window.
  history.push({ t: now, x: nose.x, y: nose.y, yaw })
  while (history.length > 0 && now - history[0].t > MOVEMENT_WINDOW_MS) history.shift()
  let movement: MovementState | null = null
  if (history.length >= 5 && now - history[0].t >= 700) {
    const span = Math.max(
      spread(history.map((p) => p.x)),
      spread(history.map((p) => p.y)),
      spread(history.map((p) => p.yaw)),
    )
    movement = span > 0.045 ? 'moving' : 'still'
  }

  return {
    status: 'running',
    faceDetected: true,
    framing,
    faceSizePercent,
    headHorizontal,
    headTiltDegrees,
    gazeOnCamera,
    movement,
    error: '',
  }
}

function signature(m: FaceAnalysisMetrics): string {
  return [
    m.faceDetected,
    m.framing,
    m.faceSizePercent,
    m.headHorizontal,
    m.headTiltDegrees,
    m.gazeOnCamera,
    m.movement,
  ].join('|')
}

function describeFaceError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/wasm|webassembly|compile/i.test(message)) {
    return 'This browser could not start the on-device face model (WebAssembly unavailable or blocked).'
  }
  return 'The on-device face model could not be loaded. Camera analysis is unavailable.'
}

/**
 * Runs MediaPipe FaceLandmarker on the given video element while `enabled` is
 * true and returns the latest derived metrics. The model is loaded once and
 * reused; the detection loop and any motion history are torn down on disable or
 * unmount. Nothing is recorded or transmitted.
 */
export function useFaceAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): FaceAnalysisMetrics {
  const [metrics, setMetrics] = useState<FaceAnalysisMetrics>(INITIAL)
  const historyRef = useRef<MovementPoint[]>([])
  const lastSignatureRef = useRef('')

  useEffect(() => {
    historyRef.current = []
    lastSignatureRef.current = ''
    if (!enabled) {
      setMetrics(INITIAL)
      return
    }

    if (typeof WebAssembly === 'undefined') {
      setMetrics({ ...INITIAL, status: 'unsupported', error: 'WebAssembly is not available in this browser.' })
      return
    }

    let cancelled = false
    let raf = 0
    let lastDetect = 0
    let lastPublish = 0
    let consecutiveErrors = 0

    const publish = (next: FaceAnalysisMetrics) => {
      const sig = signature(next)
      const now = performance.now()
      if (sig === lastSignatureRef.current && now - lastPublish < REFRESH_INTERVAL_MS) return
      lastSignatureRef.current = sig
      lastPublish = now
      setMetrics(next)
    }

    const start = async () => {
      setMetrics((prev) => ({ ...prev, status: 'loading', error: '' }))
      let landmarker: FaceLandmarker
      try {
        landmarker = await loadLandmarker()
      } catch (err) {
        console.warn('[face-analysis] model load failed', err)
        if (!cancelled) setMetrics({ ...INITIAL, status: 'error', error: describeFaceError(err) })
        return
      }
      if (cancelled) return
      setMetrics({ ...INITIAL, status: 'running' })

      const loop = () => {
        if (cancelled) return
        raf = requestAnimationFrame(loop)
        const video = videoRef.current
        const now = performance.now()
        if (!video || video.readyState < 2 || video.videoWidth === 0) return
        if (now - lastDetect < DETECT_INTERVAL_MS) return
        lastDetect = now
        if (document.hidden) return
        try {
          const result = landmarker.detectForVideo(video, now)
          consecutiveErrors = 0
          publish(summarize(result, historyRef.current, now))
        } catch (err) {
          consecutiveErrors += 1
          if (consecutiveErrors >= 5) {
            console.warn('[face-analysis] detection failed repeatedly', err)
            cancelled = true
            cancelAnimationFrame(raf)
            setMetrics({ ...INITIAL, status: 'error', error: 'Face analysis stopped after repeated errors.' })
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      historyRef.current = []
    }
  }, [enabled, videoRef])

  return metrics
}
