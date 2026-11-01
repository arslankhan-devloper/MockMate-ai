// Camera/microphone helpers shared by the Interview Setup device check.
//
// Pure functions live here so the permission-error mapping can be unit-tested
// without a browser. Device access itself is only requested from an explicit
// user action in `InterviewMediaCheck`; nothing here prompts on import.

export type MediaErrorKind = 'denied' | 'not-found' | 'in-use' | 'unsupported' | 'insecure' | 'unknown'

export interface MediaErrorMessage {
  kind: MediaErrorKind
  title: string
  message: string
}

export function mediaDevicesSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function classifyMediaError(error: unknown): MediaErrorMessage {
  const name = (error as { name?: string } | null)?.name
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        kind: 'denied',
        title: 'Permission denied',
        message:
          'Camera or microphone access was blocked. Allow access for this site in your browser settings, then retry.',
      }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        kind: 'not-found',
        title: 'No device found',
        message: 'No camera or microphone was found on this device. Connect a device and retry.',
      }
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        kind: 'in-use',
        title: 'Device is in use',
        message:
          'Your camera or microphone is already in use by another application. Close it and retry.',
      }
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        kind: 'unsupported',
        title: 'Settings not supported',
        message: 'The requested camera or microphone settings are not supported on this device.',
      }
    default:
      return {
        kind: 'unknown',
        title: 'Could not access devices',
        message: 'The camera and microphone could not be started. Check your devices and retry.',
      }
  }
}

export function insecureContextMessage(): MediaErrorMessage {
  return {
    kind: 'insecure',
    title: 'Secure connection required',
    message:
      'Camera and microphone access needs a secure page. Open MockMate over https or localhost, then retry.',
  }
}

// Stops every track and releases the audio context. Kept as a small helper so
// setup and the interview room clean up identically.
export function stopMediaStreams(streams: Iterable<MediaStream>): void {
  for (const stream of streams) {
    for (const track of stream.getTracks()) track.stop()
  }
}
