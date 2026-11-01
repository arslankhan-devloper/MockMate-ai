import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Lightbulb,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Card, TabBar } from '../components/ui'
import { useAuth } from '../lib/auth'
import {
  describeProblemError,
  getNextProblem,
  openProblemSession,
  revealProblemHint,
  runProblemTests,
  submitProblem,
  type CodingLanguage,
  type ProblemDifficulty,
  type ProblemRunResult,
  type ProblemSubmitResult,
  type ProblemTopicProgress,
  type ProblemWorkspace,
} from '../lib/problemSolving'
import {
  browserSessionStorage,
  clearStoredSubmissionKey,
  fingerprintSubmissionCode,
  loadStoredSubmissionKey,
  resolveSubmissionIdempotencyKey,
  saveStoredSubmissionKey,
  type PendingSubmission,
} from '../lib/problemSubmissionKey'
import {
  createProblemDraft,
  initialDraftCodes,
  loadProblemDraft,
  saveProblemDraft,
  type DraftLanguage,
} from '../lib/problemDrafts'
import { browserPreferenceStorage, loadCodingPreferences } from '../lib/preferences'

interface CodingInterviewProps {
  onNavigate: (page: 'dashboard' | 'report' | 'interview-setup') => void
}

type PanelTab = 'Description' | 'Hints' | 'Progress' | 'Review'
type ConsoleTab = 'Test Cases' | 'Results'

const LANGUAGE_LABELS: Record<CodingLanguage, string> = {
  python: 'Python',
  javascript: 'JavaScript',
}

const MONACO_LANGUAGE: Record<CodingLanguage, string> = {
  python: 'python',
  javascript: 'javascript',
}

function difficultyVariant(difficulty: ProblemDifficulty): 'success' | 'warning' | 'error' {
  return difficulty === 'easy' ? 'success' : difficulty === 'medium' ? 'warning' : 'error'
}

function verdictVariant(verdict: string): 'success' | 'warning' | 'error' {
  return verdict === 'accepted' ? 'success' : verdict === 'wrong_answer' ? 'warning' : 'error'
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case 'accepted':
      return 'Accepted'
    case 'wrong_answer':
      return 'Wrong answer'
    case 'runtime_error':
      return 'Runtime error'
    case 'compile_error':
      return 'Compile error'
    case 'time_limit_exceeded':
      return 'Time limit exceeded'
    default:
      return verdict
  }
}

function testLabel(
  result: { hidden: boolean; index: number },
  all: Array<{ hidden: boolean; index: number }>,
): string {
  const group = all.filter((item) => item.hidden === result.hidden)
  const ordinal = group.findIndex((item) => item.index === result.index) + 1
  return `${result.hidden ? 'Hidden' : 'Visible'} test ${ordinal > 0 ? ordinal : result.index + 1}`
}

function formatValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

function mergeProgress(
  progress: ProblemTopicProgress[],
  update: ProblemTopicProgress,
): ProblemTopicProgress[] {
  const found = progress.some((row) => row.topic === update.topic)
  return found
    ? progress.map((row) => (row.topic === update.topic ? update : row))
    : [update, ...progress]
}

export default function CodingInterview({ onNavigate }: CodingInterviewProps) {
  const { session: authSession, user } = useAuth()
  const accessToken = authSession?.access_token ?? null
  const userId = user?.id ?? null
  const codingPreferences = useMemo(
    () => loadCodingPreferences(browserPreferenceStorage(), userId),
    [userId],
  )

  const [workspace, setWorkspace] = useState<ProblemWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const [language, setLanguage] = useState<DraftLanguage>(codingPreferences.language)
  const [codes, setCodes] = useState<Record<DraftLanguage, string>>({ python: '', javascript: '' })
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)

  const [panelTab, setPanelTab] = useState<PanelTab>('Description')
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('Test Cases')
  const [selectedResult, setSelectedResult] = useState(0)

  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hintLoading, setHintLoading] = useState(false)
  const [nextLoading, setNextLoading] = useState(false)

  const [runResult, setRunResult] = useState<ProblemRunResult | null>(null)
  const [submitResult, setSubmitResult] = useState<ProblemSubmitResult | null>(null)
  const pendingSubmission = useRef<PendingSubmission | null>(null)
  const [editorTheme, setEditorTheme] = useState<'vs' | 'vs-dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
  )

  const question = workspace?.question ?? null
  const session = workspace?.session ?? null
  const latestSubmission = submitResult?.submission ?? workspace?.latestSubmission ?? null
  const review = submitResult?.review ?? workspace?.review ?? null
  const results = submitResult?.results ?? runResult?.results ?? []
  const currentCode = codes[language] ?? ''

  const panelTabs = useMemo<PanelTab[]>(
    () => (review ? ['Description', 'Hints', 'Progress', 'Review'] : ['Description', 'Hints', 'Progress']),
    [review],
  )

  useEffect(() => {
    const el = document.documentElement
    const update = () => setEditorTheme(el.classList.contains('dark') ? 'vs-dark' : 'vs')
    update()
    const observer = new MutationObserver(update)
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!accessToken) {
      setLoading(false)
      setError('Sign in to start an adaptive problem-solving session.')
      return
    }

    let active = true
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    openProblemSession(accessToken, controller.signal)
      .then((result) => {
        if (!active) return
        setWorkspace(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(describeProblemError(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, reloadNonce])

  useEffect(() => {
    if (!question || !userId) return
    let stored = null
    try {
      stored = loadProblemDraft(window.localStorage, userId, question.id)
    } catch {
      stored = null
    }
    const initial = initialDraftCodes(
      question.id,
      question.starterCode,
      stored,
      codingPreferences.language,
    )
    setLanguage(initial.language)
    setCodes(initial.codes)
    setDraftSavedAt(null)
    setRunResult(null)
    setSubmitResult(null)
    pendingSubmission.current = null
    setActionError(null)
    setSelectedResult(0)
    setConsoleTab('Test Cases')
    setPanelTab(workspace?.latestSubmission ? 'Review' : 'Description')
    // Only reinitialise when the problem changes, not when hints/session update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, userId])

  useEffect(() => {
    if (!question || !userId) return
    const timer = setTimeout(() => {
      try {
        const saved = saveProblemDraft(
          window.localStorage,
          userId,
          createProblemDraft({
            questionId: question.id,
            language,
            codes,
          }),
        )
        if (saved) setDraftSavedAt(new Date().toISOString())
      } catch {
        // Local storage can be unavailable (private mode); the editor still works.
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [question?.id, userId, language, codes])

  const updateQuestionHints = (hintsRevealed: number, hint: string | null) => {
    setWorkspace((previous) => {
      if (!previous?.question) return previous
      const hints = hint && !previous.question.hints.includes(hint)
        ? [...previous.question.hints, hint]
        : previous.question.hints
      return {
        ...previous,
        question: { ...previous.question, hintsRevealed, hints },
      }
    })
  }

  const handleRun = async () => {
    if (!accessToken || !question) return
    setRunning(true)
    setActionError(null)
    try {
      const result = await runProblemTests(accessToken, question.id, language, currentCode)
      setRunResult(result)
      setConsoleTab('Results')
      setSelectedResult(0)
    } catch (err) {
      setActionError(describeProblemError(err))
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = async () => {
    if (!accessToken || !question) return
    const pending = {
      questionId: question.id,
      language,
      code: currentCode,
    }
    const idempotencyKey = resolveSubmissionIdempotencyKey(
      pendingSubmission.current,
      pending,
    )
    pendingSubmission.current = { ...pending, idempotencyKey }
    setSubmitting(true)
    setActionError(null)
    try {
      const result = await submitProblem(
        accessToken,
        question.id,
        language,
        currentCode,
        idempotencyKey,
      )
      pendingSubmission.current = null
      setSubmitResult(result)
      setWorkspace((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          session: result.session,
          latestSubmission: result.submission,
          review: result.review,
          progress: mergeProgress(previous.progress, result.progress),
        }
      })
      setConsoleTab('Results')
      setSelectedResult(0)
      setPanelTab('Review')
    } catch (err) {
      setActionError(describeProblemError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleHint = async () => {
    if (!accessToken || !question) return
    setHintLoading(true)
    setActionError(null)
    try {
      const result = await revealProblemHint(accessToken, question.id)
      updateQuestionHints(result.hintsRevealed, result.hint)
    } catch (err) {
      setActionError(describeProblemError(err))
    } finally {
      setHintLoading(false)
    }
  }

  const handleNext = async () => {
    if (!accessToken || !session) return
    setNextLoading(true)
    setActionError(null)
    try {
      const result = await getNextProblem(accessToken, session.id)
      setWorkspace(result)
      setRunResult(null)
      setSubmitResult(null)
      setPanelTab('Description')
      setConsoleTab('Test Cases')
      setSelectedResult(0)
    } catch (err) {
      setActionError(describeProblemError(err))
    } finally {
      setNextLoading(false)
    }
  }

  const handleReset = () => {
    if (!question) return
    const starter = question.starterCode[language] ?? ''
    setCodes((previous) => ({ ...previous, [language]: starter }))
    setRunResult(null)
    if (!submitResult) setConsoleTab('Test Cases')
  }

  const handleLanguageChange = (next: CodingLanguage) => {
    if (next === language) return
    setLanguage(next)
    setRunResult(null)
    if (!submitResult) setConsoleTab('Test Cases')
  }

  if (loading) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center">
        <div className="w-14 h-14 rounded-[var(--radius-lg)] gradient-bg flex items-center justify-center text-white">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
        <div>
          <p className="text-lg font-bold text-[var(--text-primary)]">Preparing your workspace</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Generating an adaptive problem and restoring your progress.
          </p>
        </div>
      </div>
    )
  }

  if (error || !question || !session) {
    return (
      <div className="h-dvh flex flex-col bg-[var(--bg)]">
        <div className="p-4">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('dashboard')}>
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <Card className="max-w-lg w-full p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Could not open Problem Solving</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-2">{error ?? 'No problem is available yet.'}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              <Button onClick={() => setReloadNonce((value) => value + 1)}>
                <RefreshCw className="w-4 h-4" /> Try again
              </Button>
              <Button variant="ghost" onClick={() => onNavigate('dashboard')}>
                Back to dashboard
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const visibleExamples = question.visibleTests
  const selected = results[selectedResult] ?? null

  return (
    <div className="h-dvh flex flex-col bg-[var(--bg)] text-[var(--text-primary)]">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-raised)] px-3 sm:px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('dashboard')} aria-label="Back to dashboard">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold truncate">{question.title}</h1>
              <Badge variant={difficultyVariant(question.difficulty)}>
                {question.difficulty[0].toUpperCase() + question.difficulty.slice(1)}
              </Badge>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {question.topic} · Problem {question.sequence} · {LANGUAGE_LABELS[language]}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="hidden md:flex items-center gap-3 text-xs text-[var(--text-secondary)] mr-1">
              <span><strong className="text-[var(--text-primary)]">{session.answeredCount}</strong> attempted</span>
              <span><strong className="text-emerald-500">{session.acceptedCount}</strong> accepted</span>
            </div>
            <Button
              size="sm"
              onClick={handleNext}
              disabled={running || submitting || nextLoading}
              title="Generate another adaptive problem"
            >
              {nextLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="hidden sm:inline">Next problem</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto lg:overflow-hidden p-3 sm:p-4">
        <div className="grid gap-3 lg:gap-4 lg:grid-cols-[minmax(340px,42%)_1fr] lg:h-full min-h-0">
          <Card className="flex flex-col min-h-[58vh] lg:min-h-0 lg:h-full overflow-hidden">
            {submitResult ? (
              <div className="border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent-from)] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--accent-from)]">
                      Next up: {submitResult.adaptive.difficulty[0].toUpperCase() + submitResult.adaptive.difficulty.slice(1)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{submitResult.adaptive.reason}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="px-3 pt-3 shrink-0">
              <TabBar
                tabs={panelTabs}
                active={panelTab}
                onChange={(tab) => setPanelTab(tab as PanelTab)}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {panelTab === 'Description' ? (
                <div className="space-y-5">
                  {latestSubmission ? (
                    <div
                      className={`rounded-[var(--radius-md)] border px-3 py-2.5 ${
                        latestSubmission.verdict === 'accepted'
                          ? 'border-emerald-500/25 bg-emerald-500/10'
                          : 'border-amber-500/25 bg-amber-500/10'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {latestSubmission.verdict === 'accepted' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-amber-500" />
                        )}
                        <span>{verdictLabel(latestSubmission.verdict)}</span>
                        <span className="text-xs font-normal text-[var(--text-secondary)] ml-auto">
                          {latestSubmission.passedTests}/{latestSubmission.totalTests} tests
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {question.concepts.map((concept) => (
                        <Badge key={concept} variant="info">{concept}</Badge>
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">
                      {question.statement}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Input</p>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{question.inputFormat}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Output</p>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{question.outputFormat}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Constraints</p>
                    <ul className="space-y-1">
                      {question.constraints.map((constraint) => (
                        <li key={constraint} className="text-xs text-[var(--text-secondary)] flex gap-2">
                          <span className="text-[var(--accent-from)]">•</span>
                          <span className="font-mono">{constraint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Examples</p>
                    <div className="space-y-2">
                      {question.examples.map((example, index) => (
                        <div key={`${example.input}-${index}`} className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Example {index + 1}</p>
                          <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--text-primary)]">{example.input}</pre>
                          <pre className="text-xs font-mono whitespace-pre-wrap text-emerald-500 mt-1">{example.output}</pre>
                          {example.explanation ? (
                            <p className="text-xs text-[var(--text-secondary)] mt-2">{example.explanation}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Function contract</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Implement <code className="font-mono text-[var(--accent-from)]">{question.functionName}</code>
                      {'('}
                      {question.parameters.map((parameter) => `${parameter.name}: ${parameter.type}`).join(', ')}
                      {'): '}
                      {question.returnType}
                    </p>
                  </div>
                </div>
              ) : null}

              {panelTab === 'Hints' ? (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Hints are revealed one at a time. Using hints keeps the next problem at the same difficulty so you can consolidate the idea.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleHint}
                    loading={hintLoading}
                    disabled={question.hintsRevealed >= question.hintsTotal}
                  >
                    <Lightbulb className="w-4 h-4" />
                    {question.hintsRevealed >= question.hintsTotal
                      ? 'All hints revealed'
                      : question.hintsRevealed === 0
                        ? 'Reveal first hint'
                        : 'Reveal next hint'}
                  </Button>
                  {question.hintsRevealed === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">No hints revealed yet. Try the problem first.</p>
                  ) : (
                    <ol className="space-y-2">
                      {question.hints.slice(0, question.hintsRevealed).map((hint, index) => (
                        <li key={hint} className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
                          <span className="font-semibold text-[var(--text-primary)]">Hint {index + 1}. </span>
                          {hint}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : null}

              {panelTab === 'Progress' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
                      <p className="text-[11px] text-[var(--text-muted)]">Attempted</p>
                      <p className="text-xl font-bold">{session.answeredCount}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
                      <p className="text-[11px] text-[var(--text-muted)]">Accepted</p>
                      <p className="text-xl font-bold text-emerald-500">{session.acceptedCount}</p>
                    </div>
                  </div>
                  {workspace?.progress.length ? (
                    workspace.progress.map((row) => (
                      <div key={row.topic} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate">{row.topic}</p>
                          <Badge variant={difficultyVariant(row.currentDifficulty)}>
                            {row.currentDifficulty[0].toUpperCase() + row.currentDifficulty.slice(1)}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                          {row.accepted} accepted · {row.partial} partial · {row.wrong} unsuccessful · {row.hintsUsed} hints
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">
                          {row.attempts} attempt{row.attempts === 1 ? '' : 's'} · last outcome {row.lastOutcome ?? 'none'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">Submit a problem to start building topic progress.</p>
                  )}
                </div>
              ) : null}

              {panelTab === 'Review' ? (
                review ? (
                  <div className="space-y-4">
                    <div className="rounded-[var(--radius-md)] border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <p className="text-xs font-semibold text-emerald-500 mb-1">Expected approach</p>
                      <p className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{review.approach}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                      <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Expected complexity</p>
                      <p className="text-xs font-mono text-[var(--text-primary)]">{review.expectedComplexity}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">All hints</p>
                      <ul className="space-y-2">
                        {review.hints.map((hint, index) => (
                          <li key={hint} className="text-xs text-[var(--text-secondary)] rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
                            <span className="font-semibold text-[var(--text-primary)]">Hint {index + 1}. </span>{hint}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Hidden test inputs and expected outputs remain private. Only pass/fail status is shown.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <Lock className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-sm font-semibold">Review unlocks after you submit</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      You will see the expected approach, complexity and all hints after a real submission.
                    </p>
                  </div>
                )
              ) : null}
            </div>
          </Card>

          <div className="flex flex-col gap-3 min-h-0 lg:h-full">
            <Card className="flex flex-col overflow-hidden min-h-[45vh] lg:min-h-0 lg:flex-1">
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2 shrink-0">
                <div className="flex gap-1">
                  {(Object.keys(LANGUAGE_LABELS) as CodingLanguage[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleLanguageChange(value)}
                      className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-all-smooth ${
                        language === value
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-from)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {LANGUAGE_LABELS[value]}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {draftSavedAt ? (
                    <span className="hidden sm:inline text-[11px] text-[var(--text-muted)]">Draft saved locally</span>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={handleReset} title="Reset to starter code">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-[280px]">
                <Editor
                  height="100%"
                  language={MONACO_LANGUAGE[language]}
                  theme={editorTheme}
                  value={currentCode}
                  onChange={(value) => setCodes((previous) => ({ ...previous, [language]: value ?? '' }))}
                  options={{
                    minimap: { enabled: false },
                    fontSize: codingPreferences.fontSize,
                    tabSize: language === 'python' ? 4 : 2,
                    insertSpaces: true,
                    wordWrap: 'on',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-3 py-2.5 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRun}
                  loading={running}
                  disabled={running || submitting || !currentCode.trim()}
                >
                  <Play className="w-4 h-4" /> Run visible tests
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={running || submitting || !currentCode.trim()}
                >
                  <Send className="w-4 h-4" /> Submit
                </Button>
                <span className="text-[11px] text-[var(--text-muted)] ml-auto hidden sm:inline">
                  Code runs in an isolated sandbox. Hidden tests run only on submit.
                </span>
              </div>
            </Card>

            {actionError ? (
              <div className="rounded-[var(--radius-md)] border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs text-red-500 flex items-start gap-2 shrink-0" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            ) : null}

            <Card className="flex flex-col overflow-hidden min-h-[240px] lg:h-[38%] shrink-0">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
                <Terminal className="w-4 h-4 text-[var(--text-muted)]" />
                <TabBar
                  tabs={['Test Cases', 'Results']}
                  active={consoleTab}
                  onChange={(tab) => setConsoleTab(tab as ConsoleTab)}
                />
                {latestSubmission ? (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {LANGUAGE_LABELS[latestSubmission.language as CodingLanguage] ?? latestSubmission.language}
                    </span>
                    <Badge variant={verdictVariant(latestSubmission.verdict)}>
                      {verdictLabel(latestSubmission.verdict)}
                    </Badge>
                  </div>
                ) : null}
              </div>

              <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {consoleTab === 'Test Cases' ? (
                  <div className="space-y-2">
                    {visibleExamples.map((test, index) => (
                      <div key={index} className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-2.5">
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Visible test {index + 1}</p>
                        <div className="grid gap-1 sm:grid-cols-2">
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Args</p>
                            <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--text-secondary)]">{formatValue(test.args)}</pre>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Expected</p>
                            <pre className="text-xs font-mono whitespace-pre-wrap text-emerald-500">{formatValue(test.expected)}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                    {visibleExamples.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">This problem has no visible tests. Submit to run hidden tests.</p>
                    ) : null}
                  </div>
                ) : results.length === 0 && latestSubmission?.testSummary.length ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Restored from your last submission ({latestSubmission.passedTests}/{latestSubmission.totalTests} passed).
                      Run the visible tests again for full input and output details.
                    </p>
                    {latestSubmission.testSummary.map((result) => (
                      <div
                        key={`${result.hidden ? 'hidden' : 'visible'}-${result.index}`}
                        className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs"
                      >
                        {result.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span>{testLabel(result, latestSubmission.testSummary)}</span>
                        <span className={`ml-auto font-semibold ${result.passed ? 'text-emerald-500' : 'text-red-500'}`}>
                          {result.passed ? 'Passed' : 'Failed'}
                        </span>
                        {result.hidden ? <Lock className="w-3 h-3 text-[var(--text-muted)]" /> : null}
                      </div>
                    ))}
                  </div>
                ) : results.length === 0 ? (
                  <div className="text-center py-6">
                    <FlaskConical className="w-7 h-7 text-[var(--text-muted)] mx-auto mb-2" />
                    <p className="text-xs text-[var(--text-secondary)]">Run the visible tests or submit to see real results.</p>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                    <div className="space-y-1">
                      {results.map((result, index) => (
                        <button
                          key={`${result.hidden ? 'hidden' : 'visible'}-${result.index}`}
                          type="button"
                          onClick={() => setSelectedResult(index)}
                          className={`w-full flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-xs border transition-all-smooth ${
                            selectedResult === index
                              ? 'border-[var(--accent-from)] bg-[var(--accent-soft)]'
                              : 'border-[var(--border)] hover:bg-[var(--accent-soft)]/50'
                          }`}
                        >
                          {result.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          )}
                          <span className="truncate">
                            {testLabel(result, results)}
                          </span>
                          {result.hidden ? <Lock className="w-3 h-3 text-[var(--text-muted)] ml-auto" /> : null}
                        </button>
                      ))}
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 min-w-0">
                      {selected ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {selected.passed ? (
                              <Badge variant="success">Passed</Badge>
                            ) : (
                              <Badge variant="error">Failed</Badge>
                            )}
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {testLabel(selected, results)}
                            </span>
                          </div>
                          {selected.hidden ? (
                            <p className="text-xs text-[var(--text-secondary)]">
                              Inputs and expected output stay hidden. {selected.passed ? 'This case passed.' : 'This case did not pass.'}
                            </p>
                          ) : (
                            <>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Input</p>
                                <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--text-secondary)]">{formatValue(selected.input)}</pre>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Expected</p>
                                <pre className="text-xs font-mono whitespace-pre-wrap text-emerald-500">{formatValue(selected.expected)}</pre>
                              </div>
                              {selected.actual !== undefined ? (
                                <div>
                                  <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Your output</p>
                                  <pre className={`text-xs font-mono whitespace-pre-wrap ${selected.passed ? 'text-emerald-500' : 'text-red-500'}`}>{formatValue(selected.actual)}</pre>
                                </div>
                              ) : null}
                              {selected.stderr ? (
                                <div>
                                  <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Error</p>
                                  <pre className="text-xs font-mono whitespace-pre-wrap text-red-500">{selected.stderr}</pre>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
