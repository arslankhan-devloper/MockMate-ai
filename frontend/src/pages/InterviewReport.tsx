import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, BarChart3, Brain, CheckCircle2, ChevronRight, Clock,
  Eye, FileText, Gauge, Loader2, MessageSquareText, Mic, Move, RefreshCw, ScanFace,
  Sparkles, Target, Video, VideoOff,
} from 'lucide-react'
import { Card, Badge, Button, ProgressBar } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  evaluateInterviewTurn,
  getInterviewSession,
  listInterviewSessions,
  type InterviewEvaluation,
  type InterviewEvaluationStatus,
  type InterviewSession,
} from '../lib/interviews'
import {
  buildReportFromRemote,
  formatDuration,
  formatTimestamp,
  getReportHandoff,
  type InterviewReportData,
  type ReportStatus,
  type ReportTurn,
} from '../lib/interviewReport'
import {
  buildCorrectnessInsights,
  buildInterviewInsights,
  type CorrectnessInsights,
  type InterviewAnalysisSummary,
  type InterviewInsights,
  type MediaAccess,
} from '../lib/interviewAnalysis'

type Page = 'interview-setup' | 'dashboard' | 'report'
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

interface ReportProps {
  onNavigate: (p: Page, param?: string) => void
  sessionId: string | null
}

function describeLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session expired, so the report could not be loaded. Sign in again and retry.'
    if (err.status === 404) return 'This interview report was not found. It may belong to another account.'
    if (err.status === 0) return 'Could not reach the MockMate server. Check your connection and retry.'
    return `Could not load the report: ${err.message}`
  }
  return 'Could not load the report. Please retry.'
}

function describeEvaluateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session expired. Sign in again and retry the evaluation.'
    if (err.status === 404) return 'This answer could not be found on the server. Reload the report and retry.'
    if (err.status === 0) return 'Could not reach the MockMate server. Retry when you are back online.'
    return err.message
  }
  return 'The evaluation could not be requested. Please retry.'
}

function statusMeta(status: ReportStatus): { label: string; variant: BadgeVariant } {
  if (status === 'completed') return { label: 'Completed', variant: 'success' }
  if (status === 'abandoned') return { label: 'Ended early', variant: 'warning' }
  return { label: 'In progress', variant: 'info' }
}

function evalStatusMeta(status: InterviewEvaluationStatus): { label: string; variant: BadgeVariant } {
  if (status === 'evaluated') return { label: 'Evaluated', variant: 'success' }
  if (status === 'insufficient_information') return { label: 'Insufficient information', variant: 'warning' }
  if (status === 'unanswered') return { label: 'Unanswered', variant: 'default' }
  return { label: 'Evaluation failed', variant: 'error' }
}

function correctnessMeta(verdict: InterviewEvaluation['correctnessVerdict']): {
  label: string
  variant: BadgeVariant
} | null {
  if (verdict === 'correct') return { label: 'Correct', variant: 'success' }
  if (verdict === 'mostly_correct') return { label: 'Mostly correct', variant: 'success' }
  if (verdict === 'partially_correct') return { label: 'Partially correct', variant: 'warning' }
  if (verdict === 'incorrect') return { label: 'Incorrect', variant: 'error' }
  if (verdict === 'insufficient_information')
    return { label: 'Insufficient information', variant: 'default' }
  if (verdict === 'not_applicable') return { label: 'Correctness not applicable', variant: 'default' }
  return null
}

function correctnessScoreTone(score: number): string {
  return score >= 75 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-500'
}

function languageNote(language: string | null): string | null {
  if (language === 'hi') return 'Questions and feedback are generated in Hindi using Devanagari script - they are not machine-translated.'
  if (language === 'hi-en') return 'Questions and feedback are generated in Hinglish using Roman script - they are not machine-translated.'
  return null
}

function evaluatedScores(evaluations: Record<number, InterviewEvaluation>): number[] {
  return Object.values(evaluations)
    .filter(e => e.status === 'evaluated' && typeof e.score === 'number')
    .map(e => e.score as number)
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--text-primary)] text-right">{value && value.trim() ? value : '—'}</span>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <Icon size={11} /> {label}
      </div>
      <p className="text-sm font-extrabold text-[var(--text-primary)] mt-1">{value}</p>
    </div>
  )
}

function ScoreValue({ score }: { score: number }) {
  const tone = score >= 75 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-500'
  return (
    <span className={`text-sm font-extrabold ${tone}`} title="Score out of 100">
      {score}
      <span className="text-[10px] font-semibold text-[var(--text-muted)]"> /100</span>
    </span>
  )
}

function percentage(count: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((count / total) * 100)
}

function percentageLabel(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function accessMeta(access: MediaAccess): { label: string; variant: BadgeVariant } {
  if (access === 'granted') return { label: 'Granted', variant: 'success' }
  if (access === 'denied') return { label: 'Denied', variant: 'error' }
  if (access === 'unsupported') return { label: 'Not supported', variant: 'warning' }
  return { label: 'Pending', variant: 'default' }
}

function faceModelLabel(model: InterviewAnalysisSummary['camera']['model']): string {
  if (model === 'running') return 'Ran'
  if (model === 'loading') return 'Loading'
  if (model === 'error') return 'Unavailable'
  if (model === 'unsupported') return 'Not supported'
  return 'Not started'
}

function DistributionRow({ label, count, total }: { label: string; count: number; total: number }) {
  const value = percentage(count, total)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--text-primary)]">
          {percentageLabel(value)}
          <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">({count})</span>
        </span>
      </div>
      <ProgressBar value={value ?? 0} size="sm" />
    </div>
  )
}

function FaceAnalysisCard({ analysis }: { analysis: InterviewAnalysisSummary | null }) {
  if (!analysis) {
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ScanFace size={15} className="text-[var(--accent-from)]" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Face &amp; camera analysis</p>
          <Badge variant="default" className="ml-auto">Not recorded</Badge>
        </div>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          This session predates saved on-device analysis, or no valid camera summary was stored. No face or camera
          metrics are shown rather than inventing values.
        </p>
      </Card>
    )
  }

  const camera = analysis.camera
  const access = accessMeta(camera.access)
  const detection = percentage(camera.faceDetected, camera.samples)
  const gazeAvailable = camera.eyeContact.onCamera + camera.eyeContact.away
  const gaze = percentage(camera.eyeContact.onCamera, gazeAvailable)
  const steady = percentage(camera.movement.still, camera.faceDetected)
  const modelVariant: BadgeVariant =
    camera.model === 'running' ? 'success' : camera.model === 'error' || camera.model === 'unsupported' ? 'error' : 'default'

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <ScanFace size={15} className="text-[var(--accent-from)]" />
        <p className="text-sm font-bold text-[var(--text-primary)]">Face &amp; camera analysis</p>
        <Badge variant="info" className="ml-auto">On-device estimates</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={camera.used ? Video : VideoOff} label="Camera" value={camera.used ? 'Used' : 'Not used'} />
        <Stat icon={ScanFace} label="Face detected" value={percentageLabel(detection)} />
        <Stat icon={Eye} label="Camera-facing" value={percentageLabel(gaze)} />
        <Stat icon={Move} label="Steady" value={percentageLabel(steady)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Badge variant={access.variant}>Camera access: {access.label}</Badge>
        <Badge variant={modelVariant}>Face model: {faceModelLabel(camera.model)}</Badge>
        <span className="text-[var(--text-muted)]">{camera.samples} on-device sample{camera.samples === 1 ? '' : 's'}</span>
      </div>

      {camera.samples > 0 && camera.samples < 10 && (
        <p className="text-[10px] text-amber-600 leading-relaxed">
          Only {camera.samples} sample{camera.samples === 1 ? '' : 's'} were captured, so these percentages are indicative
          only.
        </p>
      )}

      {camera.samples === 0 ? (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          {camera.used
            ? 'The camera was used, but no face samples were captured. The face model may not have started or the face was never visible.'
            : 'The camera was not used, so no face, head, eye-contact or movement estimates were captured.'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Framing</p>
              <DistributionRow label="Well framed" count={camera.framing.good} total={camera.samples} />
              <DistributionRow label="Too close" count={camera.framing['too-close']} total={camera.samples} />
              <DistributionRow label="Too far" count={camera.framing['too-far']} total={camera.samples} />
              <DistributionRow label="Off-center" count={camera.framing['off-center']} total={camera.samples} />
              <DistributionRow label="No face" count={camera.framing['no-face']} total={camera.samples} />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Head direction</p>
              <DistributionRow label="Centered" count={camera.head.center} total={camera.faceDetected} />
              <DistributionRow label="Turned left" count={camera.head.left} total={camera.faceDetected} />
              <DistributionRow label="Turned right" count={camera.head.right} total={camera.faceDetected} />
              <DistributionRow label="Unavailable" count={camera.head.unknown} total={camera.faceDetected} />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Eye contact (approx.)</p>
              <DistributionRow label="Camera-facing" count={camera.eyeContact.onCamera} total={camera.faceDetected} />
              <DistributionRow label="Looking away" count={camera.eyeContact.away} total={camera.faceDetected} />
              <DistributionRow label="Unavailable" count={camera.eyeContact.unavailable} total={camera.faceDetected} />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Movement</p>
              <DistributionRow label="Steady" count={camera.movement.still} total={camera.faceDetected} />
              <DistributionRow label="Moving" count={camera.movement.moving} total={camera.faceDetected} />
              <DistributionRow label="Unavailable" count={camera.movement.unknown} total={camera.faceDetected} />
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            Face, head and eye-contact values are approximate on-device estimates, not validated measurements. No camera
            frames or recordings are stored.
          </p>
        </>
      )}
    </Card>
  )
}

function SpeechAnalysisCard({
  analysis,
  insights,
  answeredCount,
  totalQuestions,
}: {
  analysis: InterviewAnalysisSummary | null
  insights: InterviewInsights
  answeredCount: number
  totalQuestions: number
}) {
  const audio = analysis?.audio ?? null
  const access = audio ? accessMeta(audio.access) : null
  const micLabel = !audio
    ? 'Not recorded'
    : audio.used
      ? 'Used'
      : audio.access === 'granted'
        ? 'Not used'
        : accessMeta(audio.access).label
  const recognitionLabel = !audio
    ? 'Not recorded'
    : audio.speechRecognitionSupported
      ? 'Supported'
      : 'Not supported'
  const paceLabel = insights.wordsPerMinute === null ? '—' : `${insights.wordsPerMinute} wpm`

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Mic size={15} className="text-[var(--accent-from)]" />
        <p className="text-sm font-bold text-[var(--text-primary)]">Speech &amp; audio analysis</p>
        {audio && <Badge variant={access?.variant ?? 'default'} className="ml-auto">Mic: {micLabel}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Mic} label="Microphone" value={micLabel} />
        <Stat icon={MessageSquareText} label="Words captured" value={`${insights.wordCount}`} />
        <Stat icon={Clock} label="Speaking time" value={formatDuration(insights.speakingSeconds)} />
        <Stat icon={Gauge} label="Speaking pace" value={paceLabel} />
      </div>

      <div className="space-y-1.5">
        <Field label="Microphone access" value={access?.label ?? null} />
        <Field label="Speech recognition" value={recognitionLabel} />
        <Field
          label="Answer transcripts"
          value={`${answeredCount} of ${totalQuestions} answers contain text`}
        />
      </div>

      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        Word count, speaking time and pace come from saved answer text and measured speaking seconds. Pace is only shown
        when there are at least 10 words and 10 seconds of speech. Full transcripts appear in the question history below.
        {!audio && ' Live microphone status was not saved for this session.'}
        {audio?.speechRecognitionSupported === false && ' Speech recognition was not available in that browser.'}
      </p>
    </Card>
  )
}

function AnswerQualityCard({
  data,
  evaluations,
  insights,
  scores,
}: {
  data: InterviewReportData
  evaluations: Record<number, InterviewEvaluation>
  insights: InterviewInsights
  scores: number[]
}) {
  const average = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const highest = scores.length > 0 ? Math.max(...scores) : null
  const lowest = scores.length > 0 ? Math.min(...scores) : null
  const evaluated = Object.values(evaluations).filter(item => item.status === 'evaluated')
  const correctnessScores = evaluated
    .map(item => item.correctnessScore)
    .filter((value): value is number => typeof value === 'number')
  const averageCorrectness =
    correctnessScores.length > 0
      ? Math.round(correctnessScores.reduce((a, b) => a + b, 0) / correctnessScores.length)
      : null
  const correctCount = evaluated.filter(item => item.correctnessVerdict === 'correct').length
  const mostlyCount = evaluated.filter(item => item.correctnessVerdict === 'mostly_correct').length
  const partialCount = evaluated.filter(item => item.correctnessVerdict === 'partially_correct').length
  const incorrectCount = evaluated.filter(item => item.correctnessVerdict === 'incorrect').length

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BarChart3 size={15} className="text-[var(--accent-from)]" />
        <p className="text-sm font-bold text-[var(--text-primary)]">Answer quality</p>
        <Badge variant={scores.length > 0 ? 'success' : 'default'} className="ml-auto">
          {scores.length} evaluated
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={BarChart3} label="Average score" value={average === null ? '—' : `${average}/100`} />
        <Stat icon={CheckCircle2} label="Evaluated answers" value={`${scores.length} / ${data.answeredCount}`} />
        <Stat icon={Target} label="Highest" value={highest === null ? '—' : `${highest}/100`} />
        <Stat icon={AlertTriangle} label="Lowest" value={lowest === null ? '—' : `${lowest}/100`} />
      </div>

      {correctnessScores.length > 0 && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Technical correctness</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5">
            <span className={`font-bold ${averageCorrectness === null ? '' : correctnessScoreTone(averageCorrectness)}`}>
              {averageCorrectness === null ? '—' : `${averageCorrectness}%`} average
            </span>
            <span className="text-[var(--text-secondary)]">{correctCount} correct</span>
            <span className="text-[var(--text-secondary)]">{mostlyCount} mostly correct</span>
            <span className="text-[var(--text-secondary)]">{partialCount} partial</span>
            <span className="text-[var(--text-secondary)]">{incorrectCount} incorrect</span>
          </div>
        </div>
      )}

      {scores.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          No answer has a valid evaluation score yet. Use{' '}
          <span className="font-semibold text-[var(--text-secondary)]">Evaluate answer</span> in the question history below
          to request real feedback. No score or feedback is shown until a valid evaluation exists.
        </p>
      )}

      {data.turns.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Answer-by-answer results</p>
          <ul className="space-y-1.5">
            {data.turns.map((turn) => {
              const evaluation = evaluations[turn.index]
              const meta = evaluation ? evalStatusMeta(evaluation.status) : null
              const correctness = evaluation ? correctnessMeta(evaluation.correctnessVerdict) : null
              return (
                <li
                  key={turn.index}
                  className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2 text-[11px]"
                >
                  <span className="font-bold text-[var(--text-muted)]">Q{turn.index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{turn.question}</span>
                  <Badge variant={turn.answered ? 'success' : 'default'}>
                    {turn.answered ? 'Answered' : 'Unanswered'}
                  </Badge>
                  {evaluation && meta ? (
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  ) : (
                    <span className="text-[var(--text-muted)]">Not evaluated</span>
                  )}
                  {correctness ? <Badge variant={correctness.variant}>{correctness.label}</Badge> : null}
                  {evaluation?.status === 'evaluated' && typeof evaluation.score === 'number' ? (
                    <ScoreValue score={evaluation.score} />
                  ) : null}
                  {typeof evaluation?.correctnessScore === 'number' ? (
                    <span className={`text-[11px] font-bold ${correctnessScoreTone(evaluation.correctnessScore)}`}>
                      {evaluation.correctnessScore}% correct
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {insights.strengths.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Strengths from evaluations</p>
          <ul className="space-y-1">
            {insights.strengths.map((strength, i) => (
              <li key={`${strength}-${i}`} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {insights.improvements.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Improvement areas from evaluations</p>
          <ul className="space-y-1">
            {insights.improvements.map((improvement, i) => (
              <li key={`${improvement}-${i}`} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{improvement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function CorrectnessSummaryCard({ summary }: { summary: CorrectnessInsights }) {
  if (summary.evaluatedCount === 0 && summary.recommendedTopics.length === 0) return null
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Target size={15} className="text-[var(--accent-from)]" />
        <p className="text-sm font-bold text-[var(--text-primary)]">Technical correctness</p>
        <Badge variant="info" className="ml-auto">
          {summary.evaluatedCount} scored
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Target} label="Correctness scored" value={`${summary.evaluatedCount}`} />
        <Stat
          icon={AlertTriangle}
          label="Weak topics"
          value={summary.weakTopics.length > 0 ? String(summary.weakTopics.length) : 'None detected'}
        />
      </div>

      {summary.weakTopics.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Topics to revisit
          </p>
          <div className="flex flex-wrap gap-1.5">
            {summary.weakTopics.map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.recommendedTopics.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Recommended topics to practise
          </p>
          <div className="flex flex-wrap gap-1.5">
            {summary.recommendedTopics.map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        Correctness is scored against each question's rubric. It is separate from communication,
        delivery and camera-analysis metrics.
      </p>
    </Card>
  )
}

function InterviewSummaryCard({
  insights,
  hasEvaluations,
  hasAnalysis,
}: {
  insights: InterviewInsights
  hasEvaluations: boolean
  hasAnalysis: boolean
}) {
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles size={15} className="text-[var(--accent-from)]" />
        <p className="text-sm font-bold text-[var(--text-primary)]">Interview summary</p>
        <Badge variant="info" className="ml-auto">From your data</Badge>
      </div>

      {!hasEvaluations && !hasAnalysis && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          No saved evaluation or live-analysis data is available for this session. Recommendations below are limited to
          the recorded answers and session details.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Key strengths</p>
          {insights.strengths.length > 0 ? (
            <ul className="space-y-1">
              {insights.strengths.map((strength, i) => (
                <li key={`${strength}-${i}`} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{strength}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-[var(--text-muted)]">No strengths have been recorded from evaluations yet.</p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Areas to improve</p>
          {insights.improvements.length > 0 ? (
            <ul className="space-y-1">
              {insights.improvements.map((improvement, i) => (
                <li key={`${improvement}-${i}`} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{improvement}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-[var(--text-muted)]">No improvement areas have been recorded from evaluations yet.</p>
          )}
        </div>
      </div>

      <div className="space-y-1 border-t border-[var(--border)] pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Actionable recommendations</p>
        {insights.recommendations.length > 0 ? (
          <ul className="space-y-1">
            {insights.recommendations.map((recommendation, i) => (
              <li key={`${recommendation}-${i}`} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <Target size={12} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{recommendation}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">No specific recommendations can be derived from the available data.</p>
        )}
      </div>

      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        Derived from saved answers, answer evaluations and on-device estimates. This is not an additional AI score.
      </p>
    </Card>
  )
}

interface EvaluationPanelProps {
  turn: ReportTurn
  evaluation: InterviewEvaluation | undefined
  evaluating: boolean
  canEvaluate: boolean
  onEvaluate: (index: number, force: boolean) => void
}

function EvaluationPanel({ turn, evaluation, evaluating, canEvaluate, onEvaluate }: EvaluationPanelProps) {
  if (!turn.answered) {
    return (
      <div className="pl-6">
        <p className="text-[11px] text-[var(--text-muted)]">No answer was recorded, so there is nothing to evaluate.</p>
      </div>
    )
  }

  if (!canEvaluate) {
    return (
      <div className="pl-6">
        <p className="text-[11px] text-[var(--text-muted)]">
          Answer evaluation is available for interviews saved to your account.
        </p>
      </div>
    )
  }

  if (evaluating && !evaluation) {
    return (
      <div className="pl-6 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <Loader2 size={12} className="animate-spin" /> Evaluating this answer…
      </div>
    )
  }

  if (!evaluation) {
    return (
      <div className="pl-6 flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="secondary" onClick={() => onEvaluate(turn.index, false)} disabled={evaluating}>
          {evaluating ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />} Evaluate answer
        </Button>
        <span className="text-[10px] text-[var(--text-muted)]">Not evaluated yet.</span>
      </div>
    )
  }

  const meta = evalStatusMeta(evaluation.status)
  const showScore = evaluation.status === 'evaluated' && typeof evaluation.score === 'number'
  const retryLabel = evaluation.status === 'failed' ? 'Retry evaluation' : 'Re-evaluate'
  const correctness = correctnessMeta(evaluation.correctnessVerdict)
  const hasCorrectnessDetail = Boolean(
    correctness ||
      typeof evaluation.correctnessScore === 'number' ||
      evaluation.keyConceptsCovered.length > 0 ||
      evaluation.keyConceptsMissing.length > 0 ||
      evaluation.factualErrors.length > 0 ||
      evaluation.expectedAnswer ||
      evaluation.improvementAdvice,
  )

  return (
    <div className="pl-6 space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        {showScore && <ScoreValue score={evaluation.score as number} />}
        {evaluation.persisted === false && (
          <span className="text-[10px] text-[var(--text-muted)]">Not saved — shown for this session only.</span>
        )}
        <span className="flex-1" />
        <button
          onClick={() => onEvaluate(turn.index, true)}
          disabled={evaluating}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent-from)] hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {evaluating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} {retryLabel}
        </button>
      </div>

      {evaluation.status === 'failed' && (
        <div className="flex items-start gap-2">
          <AlertCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            {evaluation.note || 'The evaluation could not be completed.'}
            {evaluation.retryable === false ? ' This is not retryable right now.' : ' You can retry — your answer is saved.'}
          </p>
        </div>
      )}

      {hasCorrectnessDetail && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Target size={13} className="text-[var(--accent-from)]" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Correctness</p>
            {correctness ? <Badge variant={correctness.variant}>{correctness.label}</Badge> : null}
            {typeof evaluation.correctnessScore === 'number' ? (
              <span className={`text-[11px] font-bold ${correctnessScoreTone(evaluation.correctnessScore)}`}>
                {evaluation.correctnessScore}% correct
              </span>
            ) : null}
            {typeof evaluation.confidence === 'number' ? (
              <span className="text-[10px] text-[var(--text-muted)]">
                Confidence {Math.round(evaluation.confidence * 100)}%
              </span>
            ) : null}
          </div>

          {evaluation.correctnessVerdict === 'partially_correct' && (
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Your answer contains some of the required ideas, but not enough to be counted as fully correct.
            </p>
          )}
          {evaluation.correctnessVerdict === 'incorrect' && (
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Your answer does not contain the key facts or reasoning required for this question.
            </p>
          )}
          {evaluation.correctnessVerdict === 'not_applicable' && (
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              This is a behavioural question, so it is assessed on answer quality rather than technical correctness.
            </p>
          )}

          {evaluation.keyConceptsCovered.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Key concepts you included</p>
              <div className="flex flex-wrap gap-1.5">
                {evaluation.keyConceptsCovered.map((concept, i) => (
                  <span
                    key={`covered-${concept}-${i}`}
                    className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {evaluation.keyConceptsMissing.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Key concepts missing</p>
              <div className="flex flex-wrap gap-1.5">
                {evaluation.keyConceptsMissing.map((concept, i) => (
                  <span
                    key={`missing-${concept}-${i}`}
                    className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {evaluation.factualErrors.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Factual errors</p>
              <ul className="space-y-1">
                {evaluation.factualErrors.map((error, i) => (
                  <li key={`${error}-${i}`} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0 text-red-500" />
                    <span className="leading-relaxed">{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.improvementAdvice && (
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              <span className="font-semibold text-[var(--text-primary)]">To improve: </span>
              {evaluation.improvementAdvice}
            </p>
          )}

          {evaluation.expectedAnswer && (
            <div className="space-y-1 border-t border-[var(--border)] pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Key points a correct answer should include</p>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{evaluation.expectedAnswer}</p>
            </div>
          )}
        </div>
      )}

      {evaluation.status === 'evaluated' && !hasCorrectnessDetail && (
        <p className="text-[10px] text-[var(--text-muted)]">
          Correctness details are not available for this older evaluation. Re-evaluate to check technical accuracy.
        </p>
      )}

      {evaluation.summary && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{evaluation.summary}</p>
      )}

      {evaluation.criteria.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--border)] pt-2">
          {evaluation.criteria.map((c, i) => (
            <div key={`${c.criterion}-${i}`} className="flex items-start justify-between gap-3 text-[11px]">
              <div className="flex-1">
                <span className="font-semibold text-[var(--text-primary)]">{c.criterion}</span>
                {c.feedback ? <p className="text-[var(--text-muted)] leading-relaxed mt-0.5">{c.feedback}</p> : null}
              </div>
              <span className="font-bold text-[var(--text-secondary)] flex-shrink-0">
                {c.score !== null ? c.score : '—'}{c.maxScore !== null ? `/${c.maxScore}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {evaluation.strengths.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Strengths</p>
          <ul className="space-y-1">
            {evaluation.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.improvements.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Improvements</p>
          <ul className="space-y-1">
            {evaluation.improvements.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.suggestedAnswer && (
        <div className="space-y-1 border-t border-[var(--border)] pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Suggested example answer — not your answer
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{evaluation.suggestedAnswer}</p>
        </div>
      )}
    </div>
  )
}

interface TurnRowProps {
  turn: ReportTurn
  evaluation: InterviewEvaluation | undefined
  evaluating: boolean
  canEvaluate: boolean
  onEvaluate: (index: number, force: boolean) => void
}

function TurnRow({ turn, evaluation, evaluating, canEvaluate, onEvaluate }: TurnRowProps) {
  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5 flex-shrink-0">Q{turn.index + 1}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{turn.question}</p>
          {(turn.source === 'ai' || turn.difficulty || turn.topic) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {turn.source === 'ai' && <Badge variant="info">Adaptive follow-up</Badge>}
              {turn.difficulty && (
                <span className="text-[10px] font-semibold capitalize text-[var(--text-muted)]">{turn.difficulty}</span>
              )}
              {turn.topic && <span className="text-[10px] text-[var(--text-muted)]">{turn.topic}</span>}
            </div>
          )}
        </div>
        <Badge variant={turn.answered ? 'success' : 'default'} className="flex-shrink-0">
          {turn.answered ? 'Answered' : 'Unanswered'}
        </Badge>
      </div>
      {turn.answered ? (
        <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed pl-6">{turn.answer}</p>
      ) : (
        <p className="text-xs text-[var(--text-muted)] italic pl-6">No answer was recorded for this question.</p>
      )}
      {turn.spokenSeconds > 0 && (
        <p className="text-[10px] text-[var(--text-muted)] pl-6">≈ {formatDuration(turn.spokenSeconds)} speaking</p>
      )}
      <EvaluationPanel
        turn={turn}
        evaluation={evaluation}
        evaluating={evaluating}
        canEvaluate={canEvaluate}
        onEvaluate={onEvaluate}
      />
    </li>
  )
}

interface ReportViewProps {
  data: InterviewReportData
  source: 'remote' | 'local'
  canEvaluate: boolean
  evaluations: Record<number, InterviewEvaluation>
  evaluating: Set<number>
  onEvaluate: (index: number, force: boolean) => void
}

function ReportView({ data, source, canEvaluate, evaluations, evaluating, onEvaluate }: ReportViewProps) {
  const status = statusMeta(data.status)
  const unanswered = data.totalQuestions - data.answeredCount
  const scores = evaluatedScores(evaluations)
  const average = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const langNote = languageNote(data.language)
  const insights = buildInterviewInsights(Object.values(evaluations), data.turns, data.analysis)
  const correctness = buildCorrectnessInsights(
    Object.entries(evaluations).map(([index, evaluation]) => ({
      index: Number(index),
      status: evaluation.status,
      correctnessVerdict: evaluation.correctnessVerdict,
      correctnessScore: evaluation.correctnessScore,
      keyConceptsMissing: evaluation.keyConceptsMissing,
    })),
    data.turns.map((turn) => ({ index: turn.index, topic: turn.topic, question: turn.question })),
  )

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart3 size={15} className="text-[var(--accent-from)]" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Interview overview</p>
          <Badge variant={status.variant} className="ml-auto">{status.label}</Badge>
        </div>

        {source === 'local' && (
          <div className={`flex items-start gap-2 p-3 rounded-[var(--radius-md)] border ${data.saved ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <AlertTriangle size={14} className={`flex-shrink-0 mt-0.5 ${data.saved ? 'text-amber-600' : 'text-red-500'}`} />
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {data.saved
                ? 'This session was saved to your account, but it could not be reloaded just now — you are viewing a local copy.'
                : 'This result was not saved to your account. It exists only on this screen and will be lost when you leave.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <Field label="Domain" value={data.typeLabel} />
          <Field label="Mode" value={data.modeLabel ?? data.mode} />
          <Field label="Difficulty" value={data.difficulty} />
          <Field label="Experience" value={data.experience} />
          <Field label="Language" value={data.languageLabel ?? data.language} />
          <Field label="Target role" value={data.role} />
          <Field label="Company" value={data.company} />
          {data.branch ? <Field label="Branch" value={data.branch} /> : null}
          {data.subject ? <Field label="Subject" value={data.subject} /> : null}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border)] sm:grid-cols-4">
          <Stat icon={FileText} label="Questions completed" value={`${data.totalQuestions}`} />
          <Stat icon={CheckCircle2} label="Answered" value={`${data.answeredCount} / ${data.totalQuestions}`} />
          <Stat icon={Clock} label="Session duration" value={formatDuration(data.durationSeconds)} />
          <Stat icon={Mic} label="Speaking time" value={formatDuration(data.speakingSeconds)} />
        </div>

        <div className="text-[11px] text-[var(--text-muted)] space-y-0.5 pt-1">
          <p>Started: {formatTimestamp(data.startedAt)}</p>
          <p>{data.status === 'completed' ? 'Completed' : 'Last updated'}: {formatTimestamp(data.completedAt)}</p>
          {data.id ? <p className="font-mono break-all">Session ID: {data.id}</p> : null}
        </div>
      </Card>

      <FaceAnalysisCard analysis={data.analysis} />

      <SpeechAnalysisCard
        analysis={data.analysis}
        insights={insights}
        answeredCount={data.answeredCount}
        totalQuestions={data.totalQuestions}
      />

      <AnswerQualityCard data={data} evaluations={evaluations} insights={insights} scores={scores} />

      <CorrectnessSummaryCard summary={correctness} />

      <InterviewSummaryCard
        insights={insights}
        hasEvaluations={Object.keys(evaluations).length > 0}
        hasAnalysis={data.analysis !== null}
      />

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText size={15} className="text-[var(--accent-from)]" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Question history</p>
          <Badge variant="info" className="ml-auto">{data.totalQuestions} question{data.totalQuestions === 1 ? '' : 's'}</Badge>
        </div>

        {scores.length > 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">
            Average of {scores.length} evaluated answer{scores.length === 1 ? '' : 's'}:{' '}
            <span className="font-bold text-[var(--text-secondary)]">{average}/100</span>. Each score is the sum of four
            criteria on a 0–100 scale.
          </p>
        )}
        {langNote && scores.length > 0 && <p className="text-[11px] text-[var(--text-muted)]">{langNote}</p>}

        {data.turns.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No questions were recorded for this session.</p>
        ) : (
          <ol className="space-y-3">
            {data.turns.map(turn => (
              <TurnRow
                key={turn.index}
                turn={turn}
                evaluation={evaluations[turn.index]}
                evaluating={evaluating.has(turn.index)}
                canEvaluate={canEvaluate}
                onEvaluate={onEvaluate}
              />
            ))}
          </ol>
        )}

        {unanswered > 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">
            {unanswered} question{unanswered === 1 ? '' : 's'} left unanswered. Nothing has been invented to fill these in.
          </p>
        )}
      </Card>
    </div>
  )
}

function SessionCard({ item, onOpen }: { item: InterviewSession; onOpen: () => void }) {
  const status = statusMeta(item.status)
  const cfg = item.config ?? {}
  const typeLabel = typeof cfg.typeLabel === 'string' && cfg.typeLabel.trim() ? cfg.typeLabel : item.interviewType

  return (
    <Card className="p-4 hover:bg-[var(--accent-soft)] transition-all-smooth cursor-pointer" onClick={onOpen}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-[var(--text-primary)]">{typeLabel}</span>
        {item.difficulty ? <Badge variant="default">{item.difficulty}</Badge> : null}
        <Badge variant={status.variant} className="ml-auto">{status.label}</Badge>
        <ChevronRight size={14} className="text-[var(--text-muted)]" />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] mt-1.5 flex-wrap">
        <span>{formatTimestamp(item.startedAt)}</span>
        {item.targetRole ? <span>· {item.targetRole}</span> : null}
        {item.language ? <span>· {item.language.toUpperCase()}</span> : null}
      </div>
    </Card>
  )
}

export default function InterviewReport({ onNavigate, sessionId }: ReportProps) {
  const { session } = useAuth()
  const token = session?.access_token ?? null

  const [report, setReport] = useState<InterviewReportData | null>(null)
  const [source, setSource] = useState<'remote' | 'local' | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Evaluation state is held separately from the loaded report so a live
  // evaluation can be shown without reloading the whole report. `evaluating`
  // tracks in-flight requests per question to block duplicate clicks.
  const [evaluations, setEvaluations] = useState<Record<number, InterviewEvaluation>>({})
  const [evaluating, setEvaluating] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setError('')
    setEvaluating(new Set())
    const handoff = getReportHandoff()

    if (sessionId) {
      setReport(null)
      setSource(null)
      setSessions(null)
      setEvaluations({})
      if (!token) {
        setError('Sign in again to open your saved interview report.')
        return
      }
      setLoading(true)
      try {
        const data = await getInterviewSession(token, sessionId)
        const built = buildReportFromRemote(data.session, data.turns, data.evaluations)
        setReport(built)
        setEvaluations(built.evaluations)
        setSource('remote')
      } catch (err) {
        if (handoff && handoff.id === sessionId) {
          setReport(handoff)
          setSource('local')
        }
        setError(describeLoadError(err))
      } finally {
        setLoading(false)
      }
      return
    }

    // List mode: the most recent local (unsaved) result, if any, plus the
    // caller's own saved sessions. A successfully-saved hand-off is skipped
    // here because it already appears (and reloads) in the saved list below.
    const localOnly = handoff && !handoff.saved ? handoff : null
    setReport(localOnly)
    setSource(localOnly ? 'local' : null)
    setEvaluations({})
    if (!token) {
      setSessions([])
      return
    }
    setLoading(true)
    try {
      setSessions(await listInterviewSessions(token))
    } catch (err) {
      setError(describeLoadError(err))
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [sessionId, token])

  useEffect(() => {
    void load()
  }, [load])

  // Evaluate (or re-evaluate) one answer. Duplicate clicks are blocked both by
  // the per-index in-flight set and by the `force` flag on the request.
  const handleEvaluate = useCallback(
    async (index: number, force: boolean) => {
      if (!token || !sessionId) return
      let alreadyRunning = false
      setEvaluating(prev => {
        if (prev.has(index)) {
          alreadyRunning = true
          return prev
        }
        const next = new Set(prev)
        next.add(index)
        return next
      })
      if (alreadyRunning) return

      try {
        const result = await evaluateInterviewTurn(token, sessionId, index, { force })
        setEvaluations(prev => ({ ...prev, [index]: result }))
        if (result.persisted !== false) {
          window.dispatchEvent(new Event('mockmate:interview-updated'))
        }
      } catch (err) {
        const failed: InterviewEvaluation = {
          sessionId,
          questionIndex: index,
          status: 'failed',
          score: null,
          summary: '',
          strengths: [],
          improvements: [],
          suggestedAnswer: '',
          criteria: [],
          correctnessVerdict: null,
          correctnessScore: null,
          keyConceptsCovered: [],
          keyConceptsMissing: [],
          factualErrors: [],
          expectedAnswer: '',
          improvementAdvice: '',
          confidence: null,
          model: null,
          evaluatedAt: null,
          updatedAt: null,
          persisted: false,
          retryable: true,
          note: describeEvaluateError(err),
        }
        setEvaluations(prev => ({ ...prev, [index]: failed }))
      } finally {
        setEvaluating(prev => {
          const next = new Set(prev)
          next.delete(index)
          return next
        })
      }
    },
    [token, sessionId],
  )

  const openSession = (id: string) => onNavigate('report', id)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Interview Report</h1>
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Brain size={13} />
            <span>{report ? report.typeLabel : 'Your saved interviews'}</span>
          </div>
        </div>
        {source === 'remote' && <Badge variant="success"><CheckCircle2 size={11} /> Saved</Badge>}
        {source === 'local' && (
          <Badge variant={report?.saved ? 'warning' : 'error'}>
            <AlertTriangle size={11} /> {report?.saved ? 'Saved · local copy' : 'Not saved'}
          </Badge>
        )}
        {!sessionId && source === null && <Badge variant="info">Your sessions</Badge>}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</p>
            <button onClick={() => void load()} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:underline cursor-pointer">
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Detail mode */}
      {sessionId ? (
        loading && !report ? (
          <Card className="p-10 flex flex-col items-center text-center gap-3">
            <Loader2 size={22} className="animate-spin text-[var(--accent-from)]" />
            <p className="text-sm text-[var(--text-muted)]">Loading your saved report…</p>
          </Card>
        ) : report ? (
          <>
            <ReportView
              data={report}
              source={source ?? 'remote'}
              canEvaluate={source === 'remote'}
              evaluations={evaluations}
              evaluating={evaluating}
              onEvaluate={(index, force) => void handleEvaluate(index, force)}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" onClick={() => onNavigate('report')}>View all reports</Button>
              <Button variant="ghost" onClick={() => onNavigate('interview-setup')}><Mic size={14} /> Practice again</Button>
            </div>
          </>
        ) : (
          <Card className="p-10 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] flex items-center justify-center">
              <BarChart3 size={26} className="text-[var(--accent-from)]" />
            </div>
            <div>
              <h3 className="font-extrabold text-[var(--text-primary)] mb-1">Report unavailable</h3>
              <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed">
                This interview report could not be loaded. Try again, or open it from your saved interviews.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <Button onClick={() => void load()}><RefreshCw size={14} /> Retry</Button>
              <Button variant="secondary" onClick={() => onNavigate('report')}>View all reports</Button>
            </div>
          </Card>
        )
      ) : (
        <>
          {report && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Most recent result — this device only</p>
              <ReportView
                data={report}
                source={source ?? 'local'}
                canEvaluate={false}
                evaluations={{}}
                evaluating={new Set()}
                onEvaluate={() => {}}
              />
              <p className="text-[11px] text-[var(--text-muted)]">This copy is held in memory and is not part of your saved interviews.</p>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Saved interviews</p>
            {loading && sessions === null ? (
              <Card className="p-8 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-[var(--accent-from)]" />
                <span className="text-sm text-[var(--text-muted)]">Loading your interviews…</span>
              </Card>
            ) : sessions && sessions.length > 0 ? (
              <div className="space-y-3">
                {sessions.map(item => (
                  <SessionCard key={item.id} item={item} onOpen={() => openSession(item.id)} />
                ))}
              </div>
            ) : (
              <Card className="p-10 flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] flex items-center justify-center">
                  <BarChart3 size={26} className="text-[var(--accent-from)]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-[var(--text-primary)] mb-1">No saved reports yet</h3>
                  <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed">
                    Complete an interview and its question-by-question report will appear here.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <Button onClick={() => onNavigate('interview-setup')}><Mic size={14} /> Practice an Interview</Button>
                  <Button variant="secondary" onClick={() => onNavigate('dashboard')}><Target size={14} /> Go to Dashboard</Button>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
