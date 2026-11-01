import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Upload, FileText, CheckCircle2, AlertTriangle, AlertCircle, Zap, Trash2, Briefcase, Target,
  RefreshCw, Sparkles, TrendingUp, Lightbulb, XCircle, ListChecks, Code2, Users, Mic,
} from 'lucide-react'
import { Card, Button, Badge, ProgressBar } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  analyzeResume,
  resumeFileError,
  RESUME_ACCEPT,
  type ImprovementSuggestion,
  type ResumeAnalysis as ResumeAnalysisResult,
} from '../lib/resume'
import { loadResumeAnalysis, saveResumeAnalysis } from '../lib/resumeStore'

type Page = 'job-portal' | 'roadmap' | 'interview-setup'

interface ResumeAnalysisProps {
  onNavigate: (p: Page) => void
}

type Status = 'idle' | 'analyzing' | 'done' | 'error'

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.'
    return err.message
  }
  return 'Something went wrong while analysing your resume. Please try again.'
}

const PRIORITY_VARIANT: Record<ImprovementSuggestion['priority'], 'error' | 'warning' | 'info'> = {
  high: 'error',
  medium: 'warning',
  low: 'info',
}

function scoreVariant(score: number): 'success' | 'warning' | 'error' {
  if (score >= 75) return 'success'
  if (score >= 50) return 'warning'
  return 'error'
}

function TagList({ items, variant = 'default' }: { items: string[]; variant?: 'default' | 'success' | 'warning' | 'info' }) {
  if (items.length === 0) return <p className="text-sm text-[var(--text-muted)]">None identified.</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => <Badge key={item} variant={variant}>{item}</Badge>)}
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-[var(--text-muted)]">Nothing to report.</p>
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent-from)] flex-shrink-0" />
          <span className="break-words">{item}</span>
        </li>
      ))}
    </ul>
  )
}

function SectionCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[var(--accent-from)]">{icon}</span>
        <h3 className="font-bold text-[var(--text-primary)]">{title}</h3>
      </div>
      {children}
    </Card>
  )
}

export default function ResumeAnalysis({ onNavigate }: ResumeAnalysisProps) {
  const { session, user } = useAuth()
  const accessToken = session?.access_token ?? null

  // Restore the last analysis stored on this device so the report survives a
  // page change and can feed the resume-based interview.
  const storedResume = useMemo(
    () => (user?.id ? loadResumeAnalysis(user.id) : null),
    [user?.id],
  )

  const [status, setStatus] = useState<Status>(() => (storedResume ? 'done' : 'idle'))
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [jobTitle, setJobTitle] = useState(() => storedResume?.jobTitle ?? '')
  const [jobDescription, setJobDescription] = useState('')
  const [fileError, setFileError] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [analysis, setAnalysis] = useState<ResumeAnalysisResult | null>(() => storedResume?.analysis ?? null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFile = (f?: File | null) => {
    if (!f) return
    const error = resumeFileError(f)
    if (error) {
      setFileError(error)
      setSelectedFile(null)
      return
    }
    setFileError('')
    setSelectedFile(f)
  }

  const runAnalysis = async () => {
    if (!selectedFile) return
    if (!accessToken) {
      setErrorMessage('You need to be signed in to analyse a resume.')
      setStatus('error')
      return
    }
    setStatus('analyzing')
    setErrorMessage('')
    try {
      const result = await analyzeResume(accessToken, { file: selectedFile, jobTitle, jobDescription })
      setAnalysis(result)
      setStatus('done')
      if (user?.id) {
        saveResumeAnalysis(user.id, {
          analysis: result,
          jobTitle: jobTitle.trim(),
          fileName: selectedFile.name,
        })
      }
    } catch (err) {
      setErrorMessage(describeError(err))
      setStatus('error')
    }
  }

  const reset = () => {
    setStatus('idle')
    setSelectedFile(null)
    setJobTitle('')
    setJobDescription('')
    setFileError('')
    setErrorMessage('')
    setAnalysis(null)
  }

  // ── Idle: upload + optional job details ────────────────────────
  if (status === 'idle') {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Resume Analysis</h1>
            <p className="text-sm text-[var(--text-secondary)]">Upload your resume for an AI ATS score, skill extraction, gap analysis and prioritised improvement tips.</p>
          </div>
          <Badge variant="info"><Sparkles size={11} /> AI-powered</Badge>
        </div>

        <div
          className="border-2 border-dashed border-[var(--border)] rounded-[var(--radius-xl)] p-16 text-center cursor-pointer hover:border-[var(--accent-from)] hover:bg-[var(--accent-soft)] transition-all-smooth group"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault() }}
          onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]) }}
        >
          <input ref={fileRef} type="file" className="hidden" accept={RESUME_ACCEPT} onChange={e => pickFile(e.target.files?.[0])} />
          <div className="w-16 h-16 rounded-[var(--radius-lg)] gradient-bg-soft border border-[var(--border)] flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-all-smooth">
            <Upload size={28} className="text-[var(--accent-from)]" />
          </div>
          <h3 className="font-bold text-[var(--text-primary)] mb-2">Drop your resume here</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">Supports PDF and DOCX · Max 5MB</p>
          <Button>Browse File</Button>
        </div>

        {fileError && (
          <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-red-500/5 border border-red-500/15">
            <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-500">{fileError}</p>
          </div>
        )}

        {selectedFile && (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                <FileText size={16} className="text-[var(--accent-from)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{selectedFile.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to analyze</p>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                aria-label="Remove file"
                className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 transition-all-smooth cursor-pointer flex-shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </Card>
        )}

        <Card className="p-5 space-y-4">
          <div>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Target job (optional)</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">Add a role and description to get a job-match score and missing-skill feedback.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Job title</label>
            <input
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              maxLength={160}
              placeholder="e.g. Software Engineer"
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent-from)] focus:ring-2 focus:ring-[var(--accent-from)]/20 transition-all-smooth"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Job description</label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              maxLength={8000}
              rows={5}
              placeholder="Paste the job description to check how well your resume matches it."
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent-from)] focus:ring-2 focus:ring-[var(--accent-from)]/20 transition-all-smooth resize-y"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={runAnalysis} disabled={!selectedFile}><Zap size={13} /> Analyze Resume</Button>
            {selectedFile && <Button variant="ghost" onClick={() => setSelectedFile(null)}>Clear</Button>}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">What we analyze</p>
          <div className="grid grid-cols-2 gap-2">
            {['ATS Compatibility Score', 'Keyword Match %', 'Skill Gap Analysis', 'Grammar & Tone', 'Format & Readability', 'Industry Alignment'].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // ── Analyzing ──────────────────────────────────────────────────
  if (status === 'analyzing') {
    return (
      <div className="p-6 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-20 h-20 rounded-[var(--radius-xl)] gradient-bg-soft border border-[var(--border)] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full animate-spin border-2 border-[var(--accent-from)] border-t-transparent" />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-[var(--text-primary)] mb-1">Analysing your resume…</h3>
          <p className="text-sm text-[var(--text-muted)]">Extracting text, scoring against ATS criteria and identifying skill gaps. This can take a few seconds.</p>
        </div>
        <div className="space-y-2 text-sm text-[var(--text-muted)] text-center">
          {['Reading document text…', 'Scoring resume sections…', 'Generating improvement tips…'].map(s => (
            <p key={s} className="flex items-center justify-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-500" /> {s}
            </p>
          ))}
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card className="p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <XCircle size={26} className="text-red-500" />
          </div>
          <h2 className="text-xl font-extrabold text-[var(--text-primary)] mb-2">Analysis failed</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 break-words">{errorMessage}</p>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            {selectedFile && <Button onClick={runAnalysis}><RefreshCw size={14} /> Retry</Button>}
            <Button variant="secondary" onClick={reset}>Choose another file</Button>
          </div>
        </Card>
      </div>
    )
  }

  // ── Results ────────────────────────────────────────────────────
  if (!analysis) {
    // Defensive: 'done' should always carry an analysis.
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card className="p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-4">No analysis is available.</p>
          <Button onClick={reset}>Start over</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Resume Analysis</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <FileText size={13} className="text-[var(--text-muted)]" />
            <span className="text-sm text-[var(--text-muted)]">{selectedFile?.name ?? storedResume?.fileName ?? 'Your resume'}</span>
            <Badge variant={scoreVariant(analysis.overallScore)}>{analysis.overallScore}/100</Badge>
          </div>
        </div>
        <Button size="sm" onClick={reset}><Upload size={13} /> Analyze another</Button>
      </div>

      {/* Overall score + transparent criteria */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex flex-col items-center justify-center w-full sm:w-40 flex-shrink-0">
            <div className="text-5xl font-extrabold text-[var(--text-primary)]">{analysis.overallScore}</div>
            <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Overall score</div>
            <Badge variant={scoreVariant(analysis.overallScore)} className="mt-2">
              {analysis.overallScore >= 75 ? 'Strong' : analysis.overallScore >= 50 ? 'Needs work' : 'Weak'}
            </Badge>
          </div>
          <div className="flex-1 w-full space-y-3">
            {analysis.scoreBreakdown.map(item => (
              <div key={item.criterion}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{item.criterion}</span>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{item.score}/{item.maxScore}</span>
                </div>
                <ProgressBar value={(item.score / item.maxScore) * 100} size="sm" />
                {item.comment && <p className="text-xs text-[var(--text-muted)] mt-1">{item.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <SectionCard icon={<FileText size={16} />} title="Summary">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{analysis.summary}</p>
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard icon={<Sparkles size={16} />} title="Key strengths">
          <BulletList items={analysis.keyStrengths} />
        </SectionCard>
        <SectionCard icon={<AlertTriangle size={16} />} title="Weaknesses">
          <BulletList items={analysis.weaknesses} />
        </SectionCard>
        <SectionCard icon={<AlertCircle size={16} />} title="Missing information">
          <BulletList items={analysis.missingInformation} />
        </SectionCard>
        <SectionCard icon={<Code2 size={16} />} title="Technical skills">
          <TagList items={analysis.technicalSkills} />
        </SectionCard>
        <SectionCard icon={<Users size={16} />} title="Soft skills">
          <TagList items={analysis.softSkills} />
        </SectionCard>
        <SectionCard icon={<TrendingUp size={16} />} title="Project feedback">
          <BulletList items={analysis.projectFeedback} />
        </SectionCard>
        <SectionCard icon={<Briefcase size={16} />} title="Experience feedback">
          <BulletList items={analysis.experienceFeedback} />
        </SectionCard>
      </div>

      {/* ATS + keywords */}
      <SectionCard icon={<ListChecks size={16} />} title="ATS readability & keywords">
        {analysis.ats.readability && (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">{analysis.ats.readability}</p>
        )}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">ATS issues</p>
            <BulletList items={analysis.ats.issues} />
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">ATS suggestions</p>
            <BulletList items={analysis.ats.suggestions} />
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Keywords present</p>
            <TagList items={analysis.keywords.present} variant="success" />
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Suggested keywords</p>
            <TagList items={analysis.keywords.suggested} variant="warning" />
          </div>
        </div>
      </SectionCard>

      {/* Job match (only when a target job was provided) */}
      {analysis.jobMatch && (
        <SectionCard icon={<Target size={16} />} title="Job description match">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-3xl font-extrabold text-[var(--text-primary)]">{analysis.jobMatch.matchScore}%</div>
            <div className="flex-1">
              <ProgressBar value={analysis.jobMatch.matchScore} size="sm" />
            </div>
          </div>
          {analysis.jobMatch.comment && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">{analysis.jobMatch.comment}</p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Matched skills</p>
              <TagList items={analysis.jobMatch.matchedSkills} variant="success" />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Missing skills</p>
              <TagList items={analysis.jobMatch.missingSkills} variant="warning" />
            </div>
          </div>
        </SectionCard>
      )}

      {/* Prioritised suggestions */}
      <SectionCard icon={<Lightbulb size={16} />} title="Improvement suggestions">
        <div className="space-y-3">
          {analysis.suggestions.map(suggestion => (
            <div key={`${suggestion.title}-${suggestion.detail}`} className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
              <Badge variant={PRIORITY_VARIANT[suggestion.priority]} className="capitalize flex-shrink-0">{suggestion.priority}</Badge>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] break-words">{suggestion.title}</p>
                <p className="text-sm text-[var(--text-secondary)] break-words">{suggestion.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => onNavigate('interview-setup')}><Mic size={13} /> Practice Resume-Based Interview</Button>
        <Button size="sm" variant="secondary" onClick={() => onNavigate('job-portal')}><Briefcase size={13} /> View Job Portal</Button>
        <Button size="sm" variant="secondary" onClick={() => onNavigate('roadmap')}><Target size={13} /> View Learning Path</Button>
      </div>
    </div>
  )
}
