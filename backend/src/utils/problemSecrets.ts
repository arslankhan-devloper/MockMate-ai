import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'
import type { ProblemTest } from './problemGenerationValidation.js'

// Hidden tests and the reference approach are encrypted before they touch the
// database. The key is derived from a backend-only secret and never leaves the
// server, so even a direct PostgREST read of a student's own row only exposes
// ciphertext.
//
// Format: base64url(iv) + '.' + base64url(authTag) + '.' + base64url(ciphertext)

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

export class ProblemSecretError extends Error {
  readonly code = 'problem_secret_missing'
  constructor() {
    super('Problem-solving storage is not configured. Set PROBLEM_TEST_SECRET on the server.')
    this.name = 'ProblemSecretError'
  }
}

function secretMaterial(): string {
  // Read the process environment lazily so tests (and late-loaded secrets) can
  // provide the key after this module has been imported.
  return process.env.PROBLEM_TEST_SECRET?.trim() || env.problemTestSecret
}

function key(): Buffer {
  const secret = secretMaterial()
  if (!secret) throw new ProblemSecretError()
  return createHash('sha256').update(secret).digest()
}

function encryptText(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

function decryptText(payload: string): string {
  const parts = payload.split('.')
  if (parts.length !== 3) throw new Error('Invalid encrypted problem payload.')
  const [ivPart, tagPart, dataPart] = parts
  const decipher = createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivPart, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export function encryptHiddenTests(tests: ProblemTest[]): string {
  return encryptText(JSON.stringify(tests))
}

export function decryptHiddenTests(payload: string): ProblemTest[] {
  const parsed: unknown = JSON.parse(decryptText(payload))
  if (!Array.isArray(parsed)) throw new Error('Invalid decrypted test payload.')
  return parsed as ProblemTest[]
}

export function encryptProblemText(text: string): string {
  return encryptText(text)
}

export function decryptProblemText(payload: string): string {
  return decryptText(payload)
}
