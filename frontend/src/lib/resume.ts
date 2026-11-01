// Client for the backend resume-analysis endpoint. The uploaded file is sent to
// the MockMate backend only; the Groq API key never touches the browser.

import { API_BASE_URL, ApiError } from './api'

export interface ScoreCriterion {
  criterion: string
  score: number
  maxScore: number
  comment: string
}

export interface ImprovementSuggestion {
  priority: 'high' | 'medium' | 'low'
  title: string
  detail: string
}

export interface JobMatch {
  matchScore: number
  matchedSkills: string[]
  missingSkills: string[]
  comment: string
}

export interface ResumeAnalysis {
  overallScore: number
  scoreBreakdown: ScoreCriterion[]
  summary: string
  keyStrengths: string[]
  weaknesses: string[]
  missingInformation: string[]
  technicalSkills: string[]
  softSkills: string[]
  projectFeedback: string[]
  experienceFeedback: string[]
  ats: { readability: string; issues: string[]; suggestions: string[] }
  keywords: { present: string[]; suggested: string[] }
  suggestions: ImprovementSuggestion[]
  jobMatch: JobMatch | null
}

export const RESUME_MAX_BYTES = 5 * 1024 * 1024
export const RESUME_ACCEPT = '.pdf,.docx'

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Client-side pre-check so obvious mistakes never hit the network. The backend
// re-validates everything.
export function resumeFileError(file: File): string | null {
  const name = file.name.toLowerCase()
  const typeOk =
    name.endsWith('.pdf') ||
    name.endsWith('.docx') ||
    file.type === PDF_MIME ||
    file.type === DOCX_MIME
  if (!typeOk) return 'Only PDF and DOCX resumes are supported.'
  if (file.size === 0) return 'That file appears to be empty.'
  if (file.size > RESUME_MAX_BYTES) return 'That file is larger than the 5MB limit.'
  return null
}

function asAnalysis(value: unknown): ResumeAnalysis | null {
  if (typeof value !== 'object' || value === null) return null
  const rec = value as Record<string, unknown>
  if (typeof rec.overallScore !== 'number') return null
  if (!Array.isArray(rec.scoreBreakdown) || !Array.isArray(rec.suggestions)) return null
  return value as ResumeAnalysis
}

export interface AnalyzeResumeInput {
  file: File
  jobTitle?: string
  jobDescription?: string
}

export async function analyzeResume(
  accessToken: string,
  input: AnalyzeResumeInput,
): Promise<ResumeAnalysis> {
  const form = new FormData()
  form.append('resume', input.file, input.file.name)
  if (input.jobTitle?.trim()) form.append('jobTitle', input.jobTitle.trim())
  if (input.jobDescription?.trim()) form.append('jobDescription', input.jobDescription.trim())

  let response: globalThis.Response
  try {
    response = await fetch(`${API_BASE_URL}/api/resume/analyze`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      body: form,
    })
  } catch {
    throw new ApiError(
      0,
      'network_error',
      'Could not reach the MockMate server. Make sure the backend is running.',
    )
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const p = (payload ?? {}) as { error?: unknown; code?: unknown }
    const message = typeof p.error === 'string' ? p.error : `Analysis failed (${response.status}).`
    const code = typeof p.code === 'string' ? p.code : `http_${response.status}`
    throw new ApiError(response.status, code, message)
  }

  const analysis = asAnalysis(payload)
  if (!analysis) {
    throw new ApiError(502, 'invalid_response', 'The analysis response could not be read. Please try again.')
  }
  return analysis
}
