// Validation for the resume-analysis feature.
//
// Two responsibilities:
//   1. Validate the client-supplied optional job title / description.
//   2. Normalise the model's JSON response. The model is UNTRUSTED input: every
//      field is type-checked, clamped and length-limited before it is ever sent
//      back to the browser. Unexpected fields are dropped.

export type FieldErrors = Record<string, string>

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

export interface AtsAssessment {
  readability: string
  issues: string[]
  suggestions: string[]
}

export interface KeywordFeedback {
  present: string[]
  suggested: string[]
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
  ats: AtsAssessment
  keywords: KeywordFeedback
  suggestions: ImprovementSuggestion[]
  jobMatch: JobMatch | null
}

export const MAX_JOB_TITLE_LENGTH = 160
export const MAX_JOB_DESCRIPTION_LENGTH = 8000

export interface ResumeInputResult {
  ok: true
  jobTitle: string | null
  jobDescription: string | null
}

export type ResumeInputValidation =
  | ResumeInputResult
  | { ok: false; message: string; fields: FieldErrors }

function readOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// Validate the optional job title / description supplied alongside the upload.
export function validateResumeInputs(jobTitle: unknown, jobDescription: unknown): ResumeInputValidation {
  const fields: FieldErrors = {}

  if (jobTitle !== undefined && jobTitle !== null && typeof jobTitle !== 'string') {
    fields.jobTitle = 'Job title must be text.'
  }
  if (
    jobDescription !== undefined &&
    jobDescription !== null &&
    typeof jobDescription !== 'string'
  ) {
    fields.jobDescription = 'Job description must be text.'
  }

  if (typeof jobTitle === 'string' && jobTitle.trim().length > MAX_JOB_TITLE_LENGTH) {
    fields.jobTitle = `Job title must be at most ${MAX_JOB_TITLE_LENGTH} characters.`
  }
  if (typeof jobDescription === 'string' && jobDescription.trim().length > MAX_JOB_DESCRIPTION_LENGTH) {
    fields.jobDescription = `Job description must be at most ${MAX_JOB_DESCRIPTION_LENGTH} characters.`
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'One or more fields are invalid.', fields }
  }

  return {
    ok: true,
    jobTitle: readOptionalText(jobTitle),
    jobDescription: readOptionalText(jobDescription),
  }
}

// ── Model response normalisation ────────────────────────────────

function asTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = asTrimmedString(item, maxLength)
    if (text && !out.includes(text)) out.push(text)
    if (out.length >= maxItems) break
  }
  return out
}

function clampScore(value: unknown, max: number): number | null {
  const n = asNumber(value)
  if (n === null) return null
  return Math.max(0, Math.min(max, Math.round(n)))
}

function asBreakdown(value: unknown): ScoreCriterion[] {
  if (!Array.isArray(value)) return []
  const out: ScoreCriterion[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const criterion = asTrimmedString(rec.criterion ?? rec.name ?? rec.label, 80)
    const maxScoreRaw = asNumber(rec.maxScore ?? rec.max_score ?? rec.max) ?? 100
    const maxScore = Math.max(1, Math.min(100, Math.round(maxScoreRaw)))
    const score = clampScore(rec.score, maxScore)
    if (!criterion || score === null) continue
    const comment = asTrimmedString(rec.comment ?? rec.feedback ?? rec.detail, 400) ?? ''
    out.push({ criterion, score, maxScore, comment })
    if (out.length >= 12) break
  }
  return out
}

function asSuggestions(value: unknown): ImprovementSuggestion[] {
  if (!Array.isArray(value)) return []
  const out: ImprovementSuggestion[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const title = asTrimmedString(rec.title ?? rec.name ?? rec.action, 160)
    const detail = asTrimmedString(rec.detail ?? rec.description ?? rec.comment, 600)
    if (!title || !detail) continue
    const priorityRaw = typeof rec.priority === 'string' ? rec.priority.toLowerCase() : ''
    const priority: ImprovementSuggestion['priority'] =
      priorityRaw === 'high' || priorityRaw === 'medium' || priorityRaw === 'low'
        ? priorityRaw
        : 'medium'
    out.push({ priority, title, detail })
    if (out.length >= 12) break
  }
  return out
}

function asAts(value: unknown): AtsAssessment {
  const rec = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    readability: asTrimmedString(rec.readability ?? rec.summary ?? rec.assessment, 800) ?? '',
    issues: asStringArray(rec.issues ?? rec.problems, 12, 300),
    suggestions: asStringArray(rec.suggestions ?? rec.recommendations, 12, 300),
  }
}

function asKeywords(value: unknown): KeywordFeedback {
  const rec = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    present: asStringArray(rec.present ?? rec.found ?? rec.matched, 40, 60),
    suggested: asStringArray(rec.suggested ?? rec.recommended ?? rec.missing, 40, 60),
  }
}

function asJobMatch(value: unknown): JobMatch | null {
  if (typeof value !== 'object' || value === null) return null
  const rec = value as Record<string, unknown>
  const matchScore = clampScore(rec.matchScore ?? rec.score ?? rec.match, 100)
  const comment = asTrimmedString(rec.comment ?? rec.summary, 800) ?? ''
  const matchedSkills = asStringArray(rec.matchedSkills ?? rec.matched ?? rec.matches, 40, 60)
  const missingSkills = asStringArray(rec.missingSkills ?? rec.missing ?? rec.gaps, 40, 60)
  if (matchScore === null && !comment && matchedSkills.length === 0 && missingSkills.length === 0) {
    return null
  }
  return {
    matchScore: matchScore ?? 0,
    matchedSkills,
    missingSkills,
    comment,
  }
}

// Turn an untrusted parsed JSON value into a safe ResumeAnalysis.
// Returns null when the response is too incomplete to be shown as a real result.
export function normalizeAnalysis(raw: unknown): ResumeAnalysis | null {
  if (typeof raw !== 'object' || raw === null) return null
  const rec = raw as Record<string, unknown>

  const breakdown = asBreakdown(rec.scoreBreakdown ?? rec.score_breakdown ?? rec.criteria)
  const summary = asTrimmedString(rec.summary ?? rec.overview, 1200) ?? ''
  const suggestions = asSuggestions(rec.suggestions ?? rec.improvements ?? rec.recommendations)

  // These three carry the substance of the analysis. If they are missing the
  // response is treated as a failure rather than showing an empty result.
  if (!summary || breakdown.length === 0 || suggestions.length === 0) return null

  const sumScore = breakdown.reduce((total, item) => total + item.score, 0)
  const overall = clampScore(rec.overallScore ?? rec.overall_score ?? rec.score, 100)

  return {
    overallScore: overall ?? Math.min(100, sumScore),
    scoreBreakdown: breakdown,
    summary,
    keyStrengths: asStringArray(rec.keyStrengths ?? rec.strengths, 12, 300),
    weaknesses: asStringArray(rec.weaknesses, 12, 300),
    missingInformation: asStringArray(rec.missingInformation ?? rec.missing_information, 12, 300),
    technicalSkills: asStringArray(rec.technicalSkills ?? rec.technical_skills ?? rec.skills, 40, 60),
    softSkills: asStringArray(rec.softSkills ?? rec.soft_skills, 40, 60),
    projectFeedback: asStringArray(rec.projectFeedback ?? rec.projects ?? rec.project_feedback, 12, 400),
    experienceFeedback: asStringArray(rec.experienceFeedback ?? rec.experience ?? rec.experience_feedback, 12, 400),
    ats: asAts(rec.ats ?? rec.atsFeedback ?? rec.ats_feedback),
    keywords: asKeywords(rec.keywords ?? rec.keywordFeedback ?? rec.keyword_feedback),
    suggestions,
    jobMatch: asJobMatch(rec.jobMatch ?? rec.job_match),
  }
}
