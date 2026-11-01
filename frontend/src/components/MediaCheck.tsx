import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Mic, MicOff, VideoOff, RefreshCw, AlertTriangle, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react'
import { Card, Button, Badge, ProgressBar } from './ui'

type Status = 'requesting' | 'ready' | 'error'

interface MediaCheckProps {
  onProceed: () => void
  onCancel: () => void
}

function classify(err: unknown): string {
  const name = (err as DOMException)?.name
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permission to use the camera/microphone was denied. Allow access in your browser (site permissions) and retry.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera or microphone was found on this device. Connect a device and retry.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your camera or microphone is already in use by another application. Close it and retry.'
    case 'OverconstrainedError':
      return 'The requested device settings are not supported on this device.'
    default:
      return 'Could not access your camera or microphone. Please retry.'
  }
}

export default function MediaCheck({ onProceed, onCancel }: MediaCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const meterRef = useRef<number | null>(null)

  const [status, setStatus] = useState<Status>('requesting')
  const [camOn, setCamOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [level, setLevel] = useState(0)

  const stopAll = useCallback(() => {
    if (meterRef.current !== null) { clearInterval(meterRef.current); meterRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()))
    streamsRef.current = []
    if (videoRef.current) videoRef.current.srcObject = null
    setLevel(0)
  }, [])

  const attachVideo = useCallback((stream: MediaStream) => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [])

  const startMeter = useCallback((stream: MediaStream) => {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    audioCtxRef.current = ctx
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    meterRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v }
      const rms = Math.sqrt(sum / data.length)
      setLevel(Math.min(100, Math.round(rms * 220)))
    }, 100)
  }, [])

  const request = useCallback(async () => {
    stopAll()
    setStatus('requesting'); setErrorMsg(''); setCamOn(false); setMicOn(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('This browser or context does not support camera/microphone access. A secure (https or localhost) page is required.')
      setStatus('error')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamsRef.current.push(stream)
      setCamOn(stream.getVideoTracks().length > 0)
      setMicOn(stream.getAudioTracks().length > 0)
      attachVideo(stream)
      startMeter(stream)
      setStatus('ready')
    } catch (combinedErr) {
      let camStream: MediaStream | null = null
      let micStream: MediaStream | null = null
      try { camStream = await navigator.mediaDevices.getUserMedia({ video: true }) } catch { camStream = null }
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { micStream = null }
      if (camStream) { streamsRef.current.push(camStream); setCamOn(true); attachVideo(camStream) }
      if (micStream) { streamsRef.current.push(micStream); setMicOn(true); startMeter(micStream) }
      if (camStream || micStream) {
        setStatus('ready')
      } else {
        setErrorMsg(classify(combinedErr))
        setStatus('error')
      }
    }
  }, [stopAll, attachVideo, startMeter])

  useEffect(() => {
    request()
    return () => stopAll()
  }, [request, stopAll])

  const partial = status === 'ready' && (!camOn || !micOn)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2">
            <Camera size={18} className="text-[var(--accent-from)]" /> Camera &amp; Microphone Check
          </h3>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
          Verify your camera and microphone before starting. No audio or video is recorded, stored, or sent anywhere — the check only tests that your devices work.
        </p>

        {/* Preview */}
        <div className="relative rounded-[var(--radius-lg)] overflow-hidden bg-[#0e0a1e] border border-[var(--border)] aspect-video mb-4">
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          {(status === 'requesting' || !camOn) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
              {status === 'requesting'
                ? <><Loader2 size={26} className="text-[var(--accent-from)] animate-spin" /><p className="text-xs text-[var(--text-muted)]">Requesting camera &amp; microphone access…</p></>
                : <><VideoOff size={26} className="text-[var(--text-muted)]" /><p className="text-xs text-[var(--text-muted)]">Camera preview unavailable</p></>}
            </div>
          )}
          <div className="absolute bottom-2 left-2">
            <Badge variant={camOn ? 'success' : 'error'}><Camera size={10} /> Camera {camOn ? 'on' : 'off'}</Badge>
          </div>
        </div>

        {/* Microphone meter */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
              {micOn ? <Mic size={12} className="text-emerald-500" /> : <MicOff size={12} className="text-red-500" />} Microphone activity
            </span>
            <Badge variant={micOn ? 'success' : 'error'}>{micOn ? 'Listening' : 'Unavailable'}</Badge>
          </div>
          {micOn
            ? <ProgressBar value={level} size="md" />
            : <div className="h-2.5 rounded-full bg-[var(--accent-soft)]" />}
          <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{micOn ? 'Say something — the bar should move as you speak.' : 'No microphone input detected.'}</p>
        </div>

        {/* Error / partial warning */}
        {status === 'error' && (
          <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/20 mb-4">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{errorMsg}</p>
          </div>
        )}
        {partial && (
          <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/20 mb-4">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {!camOn && !micOn ? 'Camera and microphone' : !camOn ? 'Your camera' : 'Your microphone'} unavailable. You can still start, but you won't be able to record spoken answers.
            </p>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] mb-5">
          <ShieldCheck size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">Tracks are stopped automatically when you leave this screen. Nothing is uploaded.</p>
        </div>

        {/* Controls */}
        {status === 'requesting' ? (
          <Button className="w-full" disabled><Loader2 size={15} className="animate-spin" /> Requesting access…</Button>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={onCancel}>Back</Button>
            <Button variant="secondary" onClick={request}><RefreshCw size={13} /> Retry</Button>
            {status === 'ready' && (camOn || micOn) ? (
              <Button className="flex-1" onClick={onProceed}>Proceed to Interview <ArrowRight size={14} /></Button>
            ) : (
              <Button className="flex-1" variant="danger" onClick={onProceed}>Continue without devices <ArrowRight size={14} /></Button>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
