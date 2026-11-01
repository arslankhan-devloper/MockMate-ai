// Local, per-user copy of the most recent resume analysis.
//
// The backend analyses a resume but does not persist the report, so the
// dashboard and the resume-based interview read the latest result from this
// browser store. It is scoped by user id and never sent anywhere; a failed
// write (private mode, quota) simply disables the stored summary.

import type { ResumeAnalysis } from './resume'

const KEY_PREFIX = 'mockmate.resume.analysis.v1'

export interface StoredResume {
  analysis: ResumeAnalysis
  jobTitle: string
  fileName: string
  savedAt: string
}

function storageKey(userId: string): string {
  return `${KEY_PREFIX}.${userId}`
}

function isAnalysis(value: unknown): value is ResumeAnalysis {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  const ats = rec.ats as Record<string, unknown> | null
  const keywords = rec.keywords as Record<string, unknown> | null
  return (
    typeof rec.overallScore === 'number' &&
    typeof rec.summary === 'string' &&
    Array.isArray(rec.scoreBreakdown) &&
    Array.isArray(rec.keyStrengths) &&
    Array.isArray(rec.weaknesses) &&
    Array.isArray(rec.missingInformation) &&
    Array.isArray(rec.technicalSkills) &&
    Array.isArray(rec.softSkills) &&
    Array.isArray(rec.projectFeedback) &&
    Array.isArray(rec.experienceFeedback) &&
    Array.isArray(rec.suggestions) &&
    typeof ats === 'object' && ats !== null && Array.isArray(ats.issues) && Array.isArray(ats.suggestions) &&
    typeof keywords === 'object' && keywords !== null && Array.isArray(keywords.present) && Array.isArray(keywords.suggested)
  )
}

export function saveResumeAnalysis(
  userId: string,
  input: { analysis: ResumeAnalysis; jobTitle: string; fileName: string },
): void {
  if (!userId) return
  const record: StoredResume = { ...input, savedAt: new Date().toISOString() }
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(record))
  } catch {
    // Storage can be unavailable or full; the analysis is still shown on screen.
  }
}

export function loadResumeAnalysis(userId: string): StoredResume | null {
  if (!userId) return null
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const rec = parsed as Record<string, unknown>
    if (!isAnalysis(rec.analysis)) return null
    return {
      analysis: rec.analysis,
      jobTitle: typeof rec.jobTitle === 'string' ? rec.jobTitle : '',
      fileName: typeof rec.fileName === 'string' ? rec.fileName : '',
      savedAt: typeof rec.savedAt === 'string' ? rec.savedAt : '',
    }
  } catch {
    return null
  }
}
