import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  ShieldCheck,
  VideoOff,
  Square,
} from 'lucide-react'
import { Badge, Button, Card, ProgressBar } from './ui'
import {
  classifyMediaError,
  insecureContextMessage,
  mediaDevicesSupported,
  stopMediaStreams,
  type MediaErrorMessage,
} from '../lib/mediaDevices'

type Status = 'idle' | 'requesting' | 'ready' | 'error'

// Inline device check for Interview Setup.
//
// Unlike the old modal, this component never calls getUserMedia on mount: the
// candidate must press "Enable camera & mic". That keeps the setup page free of
// permission prompts until the candidate is ready. Tracks are stopped when the
// check is stopped, when the component unmounts (leaving setup or starting the
// interview), or when the interview ends.
export default function InterviewMediaCheck() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const meterRef = useRef<number | null>(null)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  const [status, setStatus] = useState<Status>('idle')
  const [camOn, setCamOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<MediaErrorMessage | null>(null)

  const release = useCallback(() => {
    if (meterRef.current !== null) {
      clearInterval(meterRef.current)
      meterRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    stopMediaStreams(streamsRef.current)
    streamsRef.current = []
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const stop = useCallback(() => {
    requestIdRef.current += 1
    release()
    setStatus('idle')
    setCamOn(false)
    setMicOn(false)
    setLevel(0)
    setError(null)
  }, [release])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
      release()
    }
  }, [release])

  const attachVideo = useCallback((stream: MediaStream) => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [])

  const startMeter = useCallback((stream: MediaStream) => {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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
      for (let i = 0; i < data.length; i += 1) {
        const value = (data[i] - 128) / 128
        sum += value * value
      }
      const rms = Math.sqrt(sum / data.length)
      setLevel(Math.min(100, Math.round(rms * 220)))
    }, 100)
  }, [])

  const request = useCallback(async () => {
    const id = ++requestIdRef.current
    release()
    setStatus('requesting')
    setError(null)
    setCamOn(false)
    setMicOn(false)
    setLevel(0)

    if (!mediaDevicesSupported()) {
      setError(insecureContextMessage())
      setStatus('error')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      if (id !== requestIdRef.current || !mountedRef.current) {
        stopMediaStreams([stream])
        return
      }
      streamsRef.current.push(stream)
      setCamOn(stream.getVideoTracks().length > 0)
      setMicOn(stream.getAudioTracks().length > 0)
      attachVideo(stream)
      startMeter(stream)
      setStatus('ready')
    } catch (combinedError) {
      // A single missing/blocked device must not hide the other one. Ask for
      // each separately so the candidate gets a useful partial state.
      let cameraStream: MediaStream | null = null
      let microphoneStream: MediaStream | null = null
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true })
      } catch {
        cameraStream = null
      }
      try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        microphoneStream = null
      }

      if (id !== requestIdRef.current || !mountedRef.current) {
        if (cameraStream) stopMediaStreams([cameraStream])
        if (microphoneStream) stopMediaStreams([microphoneStream])
        return
      }

      if (cameraStream) {
        streamsRef.current.push(cameraStream)
        setCamOn(true)
        attachVideo(cameraStream)
      }
      if (microphoneStream) {
        streamsRef.current.push(microphoneStream)
        setMicOn(true)
        startMeter(microphoneStream)
      }

      if (cameraStream || microphoneStream) {
        setStatus('ready')
      } else {
        setError(classifyMediaError(combinedError))
        setStatus('error')
      }
    }
  }, [attachVideo, release, startMeter])

  const ready = status === 'ready'
  const partial = ready && (!camOn || !micOn)

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-from)]">
            <Camera size={17} />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Camera &amp; microphone check</p>
            <p className="text-[11px] text-[var(--text-muted)]">Recommended before you start</p>
          </div>
        </div>
        <Badge variant={ready ? 'success' : status === 'error' ? 'error' : 'default'}>
          {ready ? 'Ready' : status === 'error' ? 'Needs attention' : 'Not checked'}
        </Badge>
      </div>

      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
        Check your devices here, then start the interview. Access is only requested when you press
        the button below. Nothing is recorded, stored or uploaded — the preview stays on this device.
      </p>

      {status !== 'idle' && (
        <div className="relative rounded-[var(--radius-lg)] overflow-hidden bg-[#0e0a1e] border border-[var(--border)] aspect-video mb-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Camera preview"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          {(status === 'requesting' || !camOn) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
              {status === 'requesting' ? (
                <>
                  <Loader2 size={26} className="text-[var(--accent-from)] animate-spin" />
                  <p className="text-xs text-[var(--text-muted)]">Requesting camera &amp; microphone access…</p>
                </>
              ) : (
                <>
                  <VideoOff size={26} className="text-[var(--text-muted)]" />
                  <p className="text-xs text-[var(--text-muted)]">Camera preview unavailable</p>
                </>
              )}
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex gap-1.5">
            <Badge variant={camOn ? 'success' : 'error'}>
              <Camera size={10} /> {camOn ? 'Camera on' : 'Camera off'}
            </Badge>
            <Badge variant={micOn ? 'success' : 'error'}>
              {micOn ? <Mic size={10} /> : <MicOff size={10} />} {micOn ? 'Mic on' : 'Mic off'}
            </Badge>
          </div>
        </div>
      )}

      {status !== 'idle' && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
              {micOn ? <Mic size={12} className="text-emerald-500" /> : <MicOff size={12} className="text-red-500" />}
              Microphone activity
            </span>
            <Badge variant={micOn ? 'success' : 'error'}>{micOn ? 'Listening' : 'Unavailable'}</Badge>
          </div>
          {micOn ? <ProgressBar value={level} size="md" /> : <div className="h-2.5 rounded-full bg-[var(--accent-soft)]" />}
          <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
            {micOn ? 'Say something — the bar should move as you speak.' : 'No microphone input detected.'}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/20 mb-4" role="alert">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-[var(--text-primary)]">{error.title}</p>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{error.message}</p>
          </div>
        </div>
      )}

      {partial && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/20 mb-4">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            {!camOn ? 'Your camera' : 'Your microphone'} is unavailable. You can still start, but spoken
            answers or the camera preview may be limited.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === 'idle' && (
          <Button onClick={() => { void request() }}>
            <Camera size={14} /> Enable camera &amp; mic
          </Button>
        )}
        {status === 'requesting' && (
          <Button disabled>
            <Loader2 size={14} className="animate-spin" /> Requesting access…
          </Button>
        )}
        {status === 'ready' && (
          <>
            {camOn && micOn ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <CheckCircle2 size={14} /> Devices are working
              </span>
            ) : null}
            <Button variant="secondary" onClick={() => { void request() }}>
              <RefreshCw size={13} /> Re-check
            </Button>
            <Button variant="ghost" onClick={stop}>
              <Square size={12} /> Stop preview
            </Button>
          </>
        )}
        {status === 'error' && (
          <Button onClick={() => { void request() }}>
            <RefreshCw size={13} /> Retry device access
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] mt-4">
        <ShieldCheck size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
          Tracks stop automatically when you leave Setup or end the interview. The check never uploads
          audio or video.
        </p>
      </div>
    </Card>
  )
}
