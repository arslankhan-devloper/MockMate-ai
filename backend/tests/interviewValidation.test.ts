import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateCreateSession,
  validateSessionUpdate,
} from '../src/utils/interviewValidation.js'

function validAnalysis() {
  return {
    version: 1,
    capturedAt: '2026-01-01T10:05:00.000Z',
    camera: {
      access: 'granted',
      used: true,
      model: 'running',
      samples: 10,
      faceDetected: 9,
      framing: { good: 8, 'too-close': 1, 'too-far': 0, 'off-center': 0, 'no-face': 1 },
      head: { center: 8, left: 1, right: 0, unknown: 0 },
      eyeContact: { onCamera: 7, away: 1, unavailable: 1 },
      movement: { still: 8, moving: 1, unknown: 0 },
    },
    audio: { access: 'granted', used: true, speechRecognitionSupported: true },
  }
}

test('keeps status-only updates backward compatible', () => {
  const parsed = validateSessionUpdate({ status: 'completed' })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value.status, 'completed')
  assert.equal(parsed.value.analysis, undefined)
})

test('accepts and normalizes a bounded analysis summary', () => {
  const parsed = validateSessionUpdate({ status: 'completed', analysis: validAnalysis() })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const analysis = parsed.value.analysis as Record<string, unknown>
  assert.equal(analysis.capturedAt, '2026-01-01T10:05:00.000Z')
  const camera = analysis.camera as Record<string, unknown>
  assert.equal(camera.faceDetected, 9)
})

test('rejects analysis counts larger than the sample count', () => {
  const analysis = validAnalysis()
  analysis.camera.faceDetected = 11
  const parsed = validateSessionUpdate({ status: 'completed', analysis })
  assert.equal(parsed.ok, false)
  if (parsed.ok) return
  assert.match(parsed.fields.analysis, /cannot exceed/)
})

test('rejects invalid access values and unknown update fields', () => {
  const analysis = validAnalysis()
  analysis.camera.access = 'sometimes'
  const invalidAnalysis = validateSessionUpdate({ status: 'completed', analysis })
  assert.equal(invalidAnalysis.ok, false)

  const unknownField = validateSessionUpdate({ status: 'completed', analysis: validAnalysis(), config: {} })
  assert.equal(unknownField.ok, false)
  if (unknownField.ok) return
  assert.match(unknownField.fields.config, /managed by the system/)
})

test('accepts a bounded adaptive question count and stores it in config', () => {
  const parsed = validateCreateSession({ interviewType: 'technical', questionCount: 10 })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal((parsed.value.config as Record<string, unknown>).questionCount, 10)

  const tooLarge = validateCreateSession({ interviewType: 'technical', questionCount: 13 })
  assert.equal(tooLarge.ok, false)
  if (tooLarge.ok) return
  assert.match(tooLarge.fields.questionCount, /between 3 and 12/)
})

test('only English is accepted as an interview language', () => {
  const english = validateCreateSession({ interviewType: 'technical', language: 'en' })
  assert.equal(english.ok, true)

  for (const language of ['hi', 'hi-en', 'hinglish']) {
    const parsed = validateCreateSession({ interviewType: 'technical', language })
    assert.equal(parsed.ok, false, `${language} must be rejected`)
    if (parsed.ok) continue
    assert.match(parsed.fields.language, /allowed values/)
  }
})

test('rejects an invalid capture timestamp', () => {
  const analysis = validAnalysis()
  analysis.capturedAt = 'not-a-date'
  const parsed = validateSessionUpdate({ status: 'completed', analysis })
  assert.equal(parsed.ok, false)
  if (parsed.ok) return
  assert.match(parsed.fields.analysis, /valid date/)

  analysis.capturedAt = `${analysis.capturedAt}${'x'.repeat(64)}`
  const tooLong = validateSessionUpdate({ status: 'completed', analysis })
  assert.equal(tooLong.ok, false)
})
