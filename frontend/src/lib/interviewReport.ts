// Final interview report — derived from the persisted session + turns.
//
// This is a *view model*, not a second source of truth: it is built either from
// the persisted interview API (authoritative) or, as a recoverable fallback,
// from the in-memory copy of the interview the candidate just finished. It
// deliberately carries no scores, ratings or AI feedback — those belong to a
// later evaluation feature.

import type { InterviewEvaluation, InterviewSession, InterviewTurn } from './interviews'
import { parseAnalysisSummary, type InterviewAnalysisSummary } from './interviewAnalysis.ts'

export type ReportStatus = 'in_progress' | 'completed' | 'abandoned'

export interface ReportTurn {
  index: number
  question: string
  answer: string
  spokenSeconds: number
  answered: boolean
  source: 'static' | 'ai'
  difficulty: 'easy' | 'medium' | 'hard' | null
  topic: string | null
}

export interface InterviewReportData {
  id: string | null
  /** True when the session and its turns were confirmed saved on the server. */
  saved: boolean
  interviewType: string
  typeLabel: string
  mode: string | null
  modeLabel: string | null
  difficulty: string | null
  experience: string | null
  language: string | null
  languageLabel: string | null
  role: string | null
  company: string | null
  branch: string | null
  subject: string | null
  status: ReportStatus
  startedAt: string | null
  completedAt: string | null
  durationSeconds: number | null
  speakingSeconds: number
  answeredCount: number
  totalQuestions: number
  turns: ReportTurn[]
  // Bounded, on-device summary persisted with the session. Null for older
  // sessions that predate analysis capture or when no valid data was saved.
  analysis: InterviewAnalysisSummary | null
  // Per-answer evaluations, keyed by question index. Empty until an answer is
  // evaluated; never contains a fabricated score.
  evaluations: Record<number, InterviewEvaluation>
}

function configString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function diffSeconds(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const from = Date.parse(start)
  const to = Date.parse(end)
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  return Math.max(0, Math.round((to - from) / 1000))
}

// Build the report from the authoritative persisted session and turns.
export function buildReportFromRemote(
  session: InterviewSession,
  turns: InterviewTurn[],
  evaluations: InterviewEvaluation[] = [],
): InterviewReportData {
  const config = session.config ?? {}
  const ordered = [...turns].sort((a, b) => a.questionIndex - b.questionIndex)
  const reportTurns: ReportTurn[] = ordered.map((turn) => ({
    index: turn.questionIndex,
    question: turn.questionText || `Question ${turn.questionIndex + 1}`,
    answer: turn.answerText ?? '',
    spokenSeconds: turn.spokenSeconds ?? 0,
    answered: (turn.answerText ?? '').trim().length > 0,
    source: turn.questionSource === 'ai' ? 'ai' : 'static',
    difficulty: turn.questionDifficulty ?? null,
    topic: turn.questionTopic ?? (turn.questionSource === 'ai' ? turn.questionKey : null),
  }))

  const evaluationMap: Record<number, InterviewEvaluation> = {}
  for (const evaluation of evaluations) {
    evaluationMap[evaluation.questionIndex] = evaluation
  }

  return {
    id: session.id,
    saved: true,
    interviewType: session.interviewType,
    typeLabel: configString(config, 'typeLabel') ?? session.interviewType,
    mode: session.mode,
    modeLabel: configString(config, 'modeLabel'),
    difficulty: session.difficulty,
    experience: session.experience ?? configString(config, 'experience'),
    language: session.language,
    languageLabel: configString(config, 'languageLabel'),
    role: session.targetRole ?? configString(config, 'role'),
    company: session.targetCompany ?? configString(config, 'company'),
    branch: configString(config, 'branch'),
    subject: configString(config, 'subject'),
    status: session.status,
    startedAt: session.startedAt ?? null,
    completedAt: session.completedAt ?? null,
    durationSeconds: diffSeconds(session.startedAt ?? null, session.completedAt ?? null),
    speakingSeconds: reportTurns.reduce((sum, turn) => sum + turn.spokenSeconds, 0),
    answeredCount: reportTurns.filter((turn) => turn.answered).length,
    totalQuestions: reportTurns.length,
    turns: reportTurns,
    analysis: parseAnalysisSummary(config.analysis),
    evaluations: evaluationMap,
  }
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`
}

export function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

// In-memory hand-off from the interview screen to the report screen for the
// just-finished session. It is intentionally NOT persisted: when the server
// write succeeded the report reloads from the API; this copy only exists so a
// failed save still leaves a recoverable view that is clearly labelled unsaved.
let handoff: InterviewReportData | null = null

export function setReportHandoff(data: InterviewReportData | null): void {
  handoff = data
}

export function getReportHandoff(): InterviewReportData | null {
  return handoff
}
