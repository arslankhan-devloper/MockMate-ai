export interface PendingSubmission {
  questionId: string
  language: string
  code: string
  idempotencyKey: string
}

interface StoredPendingSubmission {
  version: 1
  userId: string
  questionId: string
  language: string
  codeFingerprint: string
  idempotencyKey: string
}

export interface SubmissionKeyScope {
  userId: string
  questionId: string
  language: string
  codeFingerprint: string
}

interface KeyStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export const PENDING_SUBMISSION_STORAGE_KEY = 'mockmate.problemSubmission.pending.v1'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createSubmissionIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Secure random generation is unavailable.')
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

export function resolveSubmissionIdempotencyKey(
  previous: PendingSubmission | null,
  current: Omit<PendingSubmission, 'idempotencyKey'>,
  create: () => string = createSubmissionIdempotencyKey,
): string {
  if (
    previous &&
    previous.questionId === current.questionId &&
    previous.language === current.language &&
    previous.code === current.code
  ) {
    return previous.idempotencyKey
  }
  return create()
}

export function browserSessionStorage(): KeyStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export async function fingerprintSubmissionCode(code: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(code))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

function parseStored(raw: string | null): StoredPendingSubmission | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredPendingSubmission>
    if (
      value.version !== 1 ||
      typeof value.userId !== 'string' ||
      !value.userId ||
      typeof value.questionId !== 'string' ||
      !value.questionId ||
      typeof value.language !== 'string' ||
      !value.language ||
      typeof value.codeFingerprint !== 'string' ||
      !value.codeFingerprint ||
      typeof value.idempotencyKey !== 'string' ||
      !UUID_V4.test(value.idempotencyKey)
    ) {
      return null
    }
    return value as StoredPendingSubmission
  } catch {
    return null
  }
}

export function loadStoredSubmissionKey(
  storage: KeyStorage | null,
  scope: SubmissionKeyScope,
): string | null {
  if (!storage) return null
  let raw: string | null = null
  try {
    raw = storage.getItem(PENDING_SUBMISSION_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  const stored = parseStored(raw)
  if (
    !stored ||
    stored.userId !== scope.userId ||
    stored.questionId !== scope.questionId ||
    stored.language !== scope.language ||
    stored.codeFingerprint !== scope.codeFingerprint
  ) {
    clearStoredSubmissionKey(storage)
    return null
  }
  return stored.idempotencyKey
}

export function saveStoredSubmissionKey(
  storage: KeyStorage | null,
  userId: string,
  pending: PendingSubmission,
  codeFingerprint: string,
): void {
  if (!storage) return
  const value: StoredPendingSubmission = {
    version: 1,
    userId,
    questionId: pending.questionId,
    language: pending.language,
    codeFingerprint,
    idempotencyKey: pending.idempotencyKey,
  }
  try {
    storage.setItem(PENDING_SUBMISSION_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage can be unavailable or full; in-memory retry still works.
  }
}

export function clearStoredSubmissionKey(storage: KeyStorage | null): void {
  if (!storage) return
  try {
    storage.removeItem(PENDING_SUBMISSION_STORAGE_KEY)
  } catch {
    // Best effort only.
  }
}
