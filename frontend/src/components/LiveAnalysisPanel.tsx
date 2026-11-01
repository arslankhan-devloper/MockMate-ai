import { type ReactNode } from 'react'
import { Activity, Mic, MicOff, Move, ScanFace, Video, VideoOff } from 'lucide-react'
import { Card, Badge, ProgressBar } from './ui'
import { type FaceAnalysisMetrics } from '../lib/faceAnalysis'

type MediaStatus = 'requesting' | 'ready' | 'error' | 'unsupported'
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

export interface LiveAnalysisPanelProps {
  mediaStatus: MediaStatus
  hasVideo: boolean
  hasAudio: boolean
  camOn: boolean
  micOn: boolean
  micLevel: number
  recentAudio: boolean
  srSupported: boolean
  listening: boolean
  interim: string
  spokenWords: number
  face: FaceAnalysisMetrics
}

const statusLabel: Record<MediaStatus, string> = {
  requesting: 'Requesting…',
  ready: 'Granted',
  error: 'Unavailable',
  unsupported: 'Not supported',
}

const framingLabels: Record<FaceAnalysisMetrics['framing'], { label: string; variant: BadgeVariant }> = {
  'no-face': { label: 'No face', variant: 'warning' },
  good: { label: 'Well framed', variant: 'success' },
  'too-close': { label: 'Too close', variant: 'warning' },
  'too-far': { label: 'Too far', variant: 'warning' },
  'off-center': { label: 'Off-center', variant: 'warning' },
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px] leading-5">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right font-semibold text-[var(--text-primary)]">{children}</span>
    </div>
  )
}

function StatusBadge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return <Badge variant={variant} className="px-1.5 py-0 text-[10px]">{children}</Badge>
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Activity
  children: ReactNode
}) {
  return (
    <section className="border-t border-[var(--border)] pt-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <Icon size={11} /> {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

export default function LiveAnalysisPanel({
  mediaStatus,
  hasVideo,
  hasAudio,
  camOn,
  micOn,
  micLevel,
  recentAudio,
  srSupported,
  listening,
  interim,
  spokenWords,
  face,
}: LiveAnalysisPanelProps) {
  const feedLabel = hasVideo ? (camOn ? 'Active' : 'Paused') : 'Unavailable'
  const feedVariant: BadgeVariant = hasVideo ? (camOn ? 'success' : 'warning') : 'error'

  const cameraLive = hasVideo && camOn
  const modelReady = face.status === 'running'

  const modelStatus: { label: string; variant: BadgeVariant } = !cameraLive
    ? { label: 'Paused', variant: 'default' }
    : face.status === 'loading'
      ? { label: 'Loading model…', variant: 'info' }
      : face.status === 'running'
        ? { label: 'On-device', variant: 'success' }
        : face.status === 'unsupported'
          ? { label: 'Not supported', variant: 'error' }
          : face.status === 'error'
            ? { label: 'Unavailable', variant: 'error' }
            : { label: 'Starting…', variant: 'default' }

  const framing = modelReady
    ? framingLabels[face.faceDetected ? face.framing : 'no-face']
    : { label: '—', variant: 'default' as BadgeVariant }

  const headDirection = !modelReady || !face.faceDetected || !face.headHorizontal
    ? '—'
    : face.headHorizontal === 'center'
      ? 'Centered'
      : face.headHorizontal === 'left'
        ? 'Turned left'
        : 'Turned right'

  const tilt = !modelReady || !face.faceDetected || face.headTiltDegrees === null
    ? ''
    : face.headTiltDegrees <= 8
      ? 'Upright'
      : `≈ ${face.headTiltDegrees}° tilt`

  const eyeContact = !modelReady || !face.faceDetected
    ? '—'
    : face.gazeOnCamera === null
      ? 'Unavailable'
      : face.gazeOnCamera
        ? 'Camera-facing'
        : 'Looking away'

  const movement = !modelReady || !face.faceDetected || !face.movement
    ? '—'
    : face.movement === 'moving'
      ? 'Moving'
      : 'Steady'

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-from)]">
          <Activity size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-[var(--text-primary)]">Live Analysis</p>
          <p className="text-[10px] text-[var(--text-muted)]">Updates from your devices in real time</p>
        </div>
        <Badge variant="default" className="px-1.5 py-0 text-[10px]">Real signals</Badge>
      </div>

      <div className="mt-3 space-y-3">
        <Section title="Camera & face" icon={ScanFace}>
          <Row label="Camera">
            <span className="inline-flex items-center gap-1">
              {camOn ? <Video size={11} className="text-[var(--text-muted)]" /> : <VideoOff size={11} className="text-[var(--text-muted)]" />}
              <StatusBadge variant={feedVariant}>{feedLabel}</StatusBadge>
            </span>
          </Row>
          <Row label="Device access">{statusLabel[mediaStatus]}</Row>
          {face.error ? (
            <p className="text-[10px] leading-relaxed text-amber-600">{face.error}</p>
          ) : (
            <>
              <Row label="Face model"><StatusBadge variant={modelStatus.variant}>{modelStatus.label}</StatusBadge></Row>
              <Row label="Face detection">
                {!cameraLive
                  ? <span className="font-normal text-[var(--text-muted)]">Camera off</span>
                  : !modelReady
                    ? <span className="font-normal text-[var(--text-muted)]">Waiting…</span>
                    : <StatusBadge variant={face.faceDetected ? 'success' : 'warning'}>{face.faceDetected ? 'Detected' : 'Not detected'}</StatusBadge>}
              </Row>
              <Row label="Framing"><StatusBadge variant={framing.variant}>{framing.label}</StatusBadge></Row>
              <Row label="Face size">{face.faceDetected && face.faceSizePercent !== null ? `≈ ${face.faceSizePercent}% of frame` : '—'}</Row>
            </>
          )}
          <Row label="Head direction (est.)">
            {headDirection}{tilt && headDirection !== '—' ? <span className="font-normal text-[var(--text-muted)]"> · {tilt}</span> : ''}
          </Row>
          <Row label="Eye contact (approx.)">{eyeContact}</Row>
          <Row label="Movement (est.)">
            {face.movement === 'moving'
              ? <span className="inline-flex items-center gap-1"><Move size={11} /> {movement}</span>
              : movement}
          </Row>
          <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
            Face, head and eye signals are approximate on-device estimates, not validated measurements.
          </p>
        </Section>

        <Section title="Microphone & speech" icon={micOn ? Mic : MicOff}>
          <Row label="Microphone">{micOn ? 'On' : 'Muted'}</Row>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] leading-5">
              <span className="text-[var(--text-muted)]">Audio level</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {hasAudio ? (recentAudio ? 'Detected' : 'No audio yet') : 'Unavailable'}
              </span>
            </div>
            <ProgressBar value={micOn ? micLevel : 0} size="sm" />
          </div>
          <Row label="Speech recognition">
            {!srSupported ? 'Unavailable' : !micOn ? 'Paused (mic muted)' : listening ? 'Listening' : 'Idle'}
          </Row>
          <Row label="Words captured">{spokenWords}</Row>
          {interim && (
            <p className="line-clamp-2 text-[10px] leading-relaxed text-[var(--text-muted)]">“{interim.trim()}”</p>
          )}
        </Section>

        <details className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-[var(--text-secondary)]">About these signals</summary>
          <div className="mt-2 space-y-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            <div>
              <p className="mb-1 font-semibold text-[var(--text-secondary)]">Intentionally not measured</p>
              <ul className="flex flex-wrap gap-1.5">
                {['Facial expression & emotion', 'Personality & confidence scoring'].map(item => (
                  <li key={item} className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{item}</li>
                ))}
              </ul>
            </div>
            <p>
              Emotion and confidence are not inferred from your appearance — this panel stays focused on observable camera and microphone cues. Face, head-pose and eye-contact values are on-device estimates, not validated measurements. Camera frames stay on your device. Browser speech-to-text may use your browser's speech service; MockMate does not record or upload audio or video.
            </p>
          </div>
        </details>
      </div>
    </Card>
  )
}
