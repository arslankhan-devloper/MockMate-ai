import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Lightbulb,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Terminal,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Card, TabBar } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import {
  createInterviewSession,
  newClientSessionId,
  runCodingRound,
  saveInterviewTurn,
  updateInterviewSession,
  type CodingRunResult,
} from '../lib/interviews'
import {
  CODING_ROUND_LANGUAGES,
  DEFAULT_CODING_ROUND_LANGUAGE,
  buildCodingQuestionText,
  buildCodingTurnAnswer,
  codingRoundLanguageLabel,
  codingRoundMonacoLanguage,
  codingStarterCode,
  firstExampleInput,
  isCodingRoundLanguage,
  selectCodingQuestions,
  type CodingRoundLanguageId,
} from '../lib/codingRound'
import type { InterviewConfig } from './InterviewSetup'

type Page = 'report' | 'interview-setup'
type OutputTab = 'output' | 'input'

interface CodingRoundInterviewProps {
  onNavigate: (p: Page, param?: string) => void
  config: InterviewConfig
}

interface RunState {
  result: CodingRunResult
  persisted: boolean
  warning?: string
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session expired. Sign in again and retry.'
    if (error.status === 403) return 'You do not have access to this Coding Round session.'
    if (error.status === 404) return 'This Coding Round session could not be found.'
    if (error.status === 429) return 'The code runner is busy right now. Wait a moment and run again.'
    if (error.status === 503) return 'Coding execution is not configured on the server yet.'
    if (error.status === 504) return 'The code runner timed out. Try a smaller input or run again.'
    if (error.status === 0) return 'Could not reach the MockMate server. Check your connection and retry.'
    return error.message
  }
  return 'Something went wrong. Please retry.'
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function CodingRoundInterview({ onNavigate, config }: CodingRoundInterviewProps) {
  const { session: authSession } = useAuth()
  const accessToken = authSession?.access_token ?? null

  const questions = useMemo(
    () =>
      selectCodingQuestions(
        (config.difficulty as 'Easy' | 'Medium' | 'Hard' | 'Mixed') ?? 'Mixed',
        config.questionCount ?? 5,
      ),
    [config.difficulty, config.questionCount],
  )

  const initialLanguage: CodingRoundLanguageId = isCodingRoundLanguage(config.codingLanguage)
    ? config.codingLanguage
    : DEFAULT_CODING_ROUND_LANGUAGE

  const [language, setLanguage] = useState<CodingRoundLanguageId>(initialLanguage)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [runs, setRuns] = useState<Record<number, RunState>>({})
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [tab, setTab] = useState<OutputTab>('output')
  const [saveWarning, setSaveWarning] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState('')
  const [timeLeft, setTimeLeft] = useState(() => (config.durationMinutes ?? 30) * 60)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [creating, setCreating] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const clientSessionIdRef = useRef<string | undefined>(newClientSessionId())
  const startedRef = useRef(false)
  const autoFinishedRef = useRef(false)
  const [editorTheme, setEditorTheme] = useState<'vs' | 'vs-dark'>(() =>
    typeof document !== 'undefined' && document.querySelector('.dark') ? 'vs-dark' : 'vs',
  )

  const question = questions[Math.min(questionIndex, questions.length - 1)]
  const codeKey = `${question.id}:${language}`
  const code = drafts[codeKey] ?? codingStarterCode(language, question)
  const input = inputs[questionIndex] ?? firstExampleInput(question)
  const run = runs[questionIndex] ?? null

  // Monaco theme follows the app's dark-mode wrapper.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setEditorTheme(document.querySelector('.dark') ? 'vs-dark' : 'vs')
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true })
    return () => observer.disconnect()
  }, [])

  const createSession = useCallback(async () => {
    if (!accessToken) return
    setCreating(true)
    setSessionError('')
    try {
      const session = await createInterviewSession(accessToken, {
        interviewType: 'coding',
        mode: 'coding',
        difficulty: config.difficulty,
        experience: config.experience,
        role: config.role,
        company: config.company,
        language: config.language,
        typeLabel: config.typeLabel,
        modeLabel: config.modeLabel,
        languageLabel: config.languageLabel,
        questionCount: questions.length,
        clientSessionId: clientSessionIdRef.current,
        codingLanguage: initialLanguage,
      })
      setSessionId(session.id)
      setCreating(false)
    } catch (error) {
      setCreating(false)
      setSessionError(describeError(error))
    }
  }, [
    accessToken,
    config.company,
    config.difficulty,
    config.experience,
    config.language,
    config.languageLabel,
    config.modeLabel,
    config.role,
    config.typeLabel,
    initialLanguage,
    questions.length,
  ])

  useEffect(() => {
    if (!accessToken || startedRef.current) return
    startedRef.current = true
    void createSession()
  }, [accessToken, createSession])

  useEffect(() => {
    const timer = window.setInterval(() => setTimeLeft((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const persistTurn = useCallback(
    async (index: number, runOverride?: RunState | null): Promise<boolean> => {
      if (!accessToken || !sessionId) return false
      const target = questions[index]
      if (!target) return false
      const key = `${target.id}:${language}`
      const targetCode = drafts[key] ?? codingStarterCode(language, target)
      const targetRun = runOverride ?? runs[index] ?? null
      try {
        await saveInterviewTurn(accessToken, sessionId, index, {
          questionText: buildCodingQuestionText(target),
          questionKey: `coding:${target.id}`,
          answerText: buildCodingTurnAnswer(language, target, targetCode, targetRun?.result ?? null),
          spokenSeconds: 0,
        })
        setSaveWarning('')
        return true
      } catch (error) {
        setSaveWarning(
          error instanceof ApiError && error.status === 401
            ? 'Your session expired, so this answer could not be saved.'
            : 'This answer could not be saved yet. Keep working — finish will retry the current question.',
        )
        return false
      }
    },
    [accessToken, drafts, language, questions, runs, sessionId],
  )

  const handleRun = useCallback(async () => {
    if (!sessionId || running) return
    if (!code.trim()) {
      setRunError('Write some code before running.')
      return
    }
    setRunning(true)
    setRunError('')
    setTab('output')
    try {
      const response = await runCodingRound(accessToken ?? '', sessionId, {
        language,
        code,
        input,
        timeLimit: 5,
        questionIndex,
      })
      const nextRun: RunState = {
        result: response.result,
        persisted: response.persisted,
        warning: response.warning,
      }
      setRuns((previous) => ({ ...previous, [questionIndex]: nextRun }))
      void persistTurn(questionIndex, nextRun)
    } catch (error) {
      setRunError(describeError(error))
    } finally {
      setRunning(false)
    }
  }, [accessToken, code, input, language, persistTurn, questionIndex, running, sessionId])

  const finish = useCallback(async () => {
    if (finishing) return
    setFinishing(true)
    setFinishError('')
    try {
      if (!accessToken || !sessionId) {
        setFinishError('The interview session is not ready yet. Retry in a moment.')
        return
      }
      const saved = await persistTurn(questionIndex)
      if (!saved) {
        setFinishError('Your current answer could not be saved. Check your connection and retry.')
        return
      }
      await updateInterviewSession(accessToken, sessionId, { status: 'completed' })
      onNavigate('report', sessionId)
    } catch (error) {
      setFinishError(describeError(error))
    } finally {
      setFinishing(false)
    }
  }, [accessToken, finishing, onNavigate, persistTurn, questionIndex, sessionId])

  useEffect(() => {
    if (timeLeft === 0 && !autoFinishedRef.current) {
      autoFinishedRef.current = true
      void finish()
    }
  }, [finish, timeLeft])

  const goToQuestion = (next: number) => {
    if (next < 0 || next >= questions.length || next === questionIndex) return
    void persistTurn(questionIndex)
    setQuestionIndex(next)
    setRunError('')
    setTab('output')
  }

  const changeLanguage = (next: CodingRoundLanguageId) => {
    if (next === language) return
    setLanguage(next)
    setRunError('')
    setTab('output')
  }

  const resetStarter = () => {
    setDrafts((previous) => ({ ...previous, [codeKey]: codingStarterCode(language, question) }))
    setRunError('')
  }

  if (creating && !sessionId) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Card className="p-8 text-center">
          <Loader2 size={28} className="mx-auto mb-3 text-[var(--accent-from)] animate-spin" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Preparing your Coding Round…</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Creating a saved interview session.</p>
        </Card>
      </div>
    )
  }

  if (sessionError && !sessionId) {
    return (
      <div className="h-full flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
        <Card className="p-6 max-w-md w-full">
          <div className="flex items-start gap-2 mb-4">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Could not start the Coding Round</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{sessionError}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onNavigate('interview-setup')}>
              <ArrowLeft size={14} /> Back to setup
            </Button>
            <Button onClick={() => { void createSession() }}>
              <RotateCcw size={14} /> Retry
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--surface-raised)]">
        <div className="mx-auto flex w-full max-w-[1500px] items-center gap-2 px-3 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => onNavigate('interview-setup')}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] cursor-pointer"
            aria-label="Back to interview setup"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-from)]">
              <Terminal size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">Coding Round</p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">
                {config.difficulty} · {config.questionCount ?? questions.length} questions · {codingRoundLanguageLabel(language)}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${timeLeft <= 60 ? 'border-red-500/30 bg-red-500/10 text-red-500' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]'}`}
            >
              <Clock size={12} /> {formatClock(timeLeft)}
            </span>
            <Button size="sm" onClick={() => { void finish() }} loading={finishing} disabled={creating}>
              <Send size={13} /> Finish
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(300px,38%)_1fr]">
          {/* Question panel */}
          <div className="space-y-3">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Question {questionIndex + 1} of {questions.length}
                </span>
                <Badge variant={question.difficulty === 'Hard' ? 'error' : question.difficulty === 'Medium' ? 'warning' : 'success'}>
                  {question.difficulty}
                </Badge>
              </div>
              <h1 className="text-lg font-extrabold text-[var(--text-primary)] mb-1">{question.title}</h1>
              <p className="text-[11px] text-[var(--text-muted)] mb-4 flex items-center gap-1">
                <ListChecks size={11} /> {question.topic}
              </p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{question.prompt}</p>

              <div className="mt-4 space-y-2">
                {question.examples.map((example, index) => (
                  <div key={index} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Example {index + 1}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Input</p>
                        <pre className="text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-words font-mono">{example.input.trimEnd() || '(empty)'}</pre>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Output</p>
                        <pre className="text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-words font-mono">{example.output.trimEnd() || '(empty line)'}</pre>
                      </div>
                    </div>
                    {example.explanation && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-2">{example.explanation}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
                  <Lightbulb size={11} /> Constraints
                </p>
                <ul className="space-y-1">
                  {question.constraints.map((constraint) => (
                    <li key={constraint} className="text-[11px] text-[var(--text-secondary)] flex gap-1.5">
                      <span className="text-[var(--accent-from)]">•</span> {constraint}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => goToQuestion(questionIndex - 1)} disabled={questionIndex === 0}>
                <ChevronLeft size={14} /> Previous
              </Button>
              <div className="flex flex-wrap gap-1.5 mx-auto">
                {questions.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goToQuestion(index)}
                    aria-label={`Go to question ${index + 1}`}
                    aria-current={index === questionIndex}
                    className={`h-6 w-6 rounded-full text-[10px] font-bold cursor-pointer ${index === questionIndex ? 'gradient-bg text-white' : runs[index] ? 'bg-emerald-500/15 text-emerald-600' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]'}`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <Button variant="secondary" size="sm" onClick={() => goToQuestion(questionIndex + 1)} disabled={questionIndex >= questions.length - 1}>
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>

          {/* IDE panel */}
          <div className="space-y-3">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-secondary)]">
                  <Code2 size={13} className="text-[var(--accent-from)]" /> IDE
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <label className="sr-only" htmlFor="coding-round-language">Language</label>
                  <select
                    id="coding-round-language"
                    value={language}
                    onChange={(event) => changeLanguage(event.target.value as CodingRoundLanguageId)}
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    {CODING_ROUND_LANGUAGES.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="sm" onClick={resetStarter} disabled={running}>
                    <RotateCcw size={12} /> Reset
                  </Button>
                  <Button size="sm" onClick={() => { void handleRun() }} loading={running} disabled={!sessionId || creating}>
                    <Play size={13} /> Run code
                  </Button>
                </div>
              </div>
              <div className="h-[330px] sm:h-[400px]">
                <Editor
                  height="100%"
                  language={codingRoundMonacoLanguage(language)}
                  theme={editorTheme}
                  value={code}
                  onChange={(value) => setDrafts((previous) => ({ ...previous, [codeKey]: value ?? '' }))}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    tabSize: ['python', 'c', 'cpp', 'java', 'go', 'rust'].includes(language) ? 4 : 2,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: 'on',
                    padding: { top: 10, bottom: 10 },
                  }}
                />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
                <TabBar tabs={['Output', 'Input']} active={tab === 'output' ? 'Output' : 'Input'} onChange={(next) => setTab(next === 'Input' ? 'input' : 'output')} />
                {run && (
                  <Badge variant={run.result.status === 'success' ? 'success' : 'error'} className="ml-auto">
                    {run.result.status === 'success' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                    {run.result.status === 'success' ? 'Success' : 'Error'}
                  </Badge>
                )}
              </div>

              {tab === 'input' ? (
                <div className="p-3">
                  <label htmlFor="coding-round-stdin" className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Standard input
                  </label>
                  <textarea
                    id="coding-round-stdin"
                    value={input}
                    onChange={(event) => setInputs((previous) => ({ ...previous, [questionIndex]: event.target.value }))}
                    spellCheck={false}
                    rows={5}
                    placeholder="Program input (stdin)"
                    className="mt-1.5 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-from)]"
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                    Prefilled with the first example. Edit it to try extra cases.
                  </p>
                </div>
              ) : (
                <div className="p-3 min-h-[150px]">
                  {runError && (
                    <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 p-3 mb-2" role="alert">
                      <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{runError}</p>
                    </div>
                  )}
                  {run ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                        <span>Exit code <strong className="text-[var(--text-primary)]">{run.result.exitCode}</strong></span>
                        {run.result.time && <span>Time <strong className="text-[var(--text-primary)]">{run.result.time}s</strong></span>}
                        {run.result.memory && <span>Memory <strong className="text-[var(--text-primary)]">{run.result.memory} KB</strong></span>}
                        {run.result.truncated && <Badge variant="warning">Output truncated</Badge>}
                      </div>
                      {run.result.output && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">stdout</p>
                          <pre className="max-h-56 overflow-auto rounded-[var(--radius-sm)] bg-[#0e0a1e] p-3 font-mono text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap break-words">
                            {run.result.output}
                          </pre>
                        </div>
                      )}
                      {run.result.error && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">stderr / compiler</p>
                          <pre className="max-h-56 overflow-auto rounded-[var(--radius-sm)] bg-[#0e0a1e] p-3 font-mono text-[11px] leading-relaxed text-red-300 whitespace-pre-wrap break-words">
                            {run.result.error}
                          </pre>
                        </div>
                      )}
                      {!run.result.output && !run.result.error && (
                        <p className="text-[11px] text-[var(--text-muted)]">The program ran without output.</p>
                      )}
                      {run.result.exitCode === 124 && (
                        <p className="text-[11px] text-amber-600">The time limit was reached. Aim for a more efficient solution.</p>
                      )}
                      {run.warning && <p className="text-[10px] text-amber-600">{run.warning}</p>}
                      {!run.persisted && !run.warning && (
                        <p className="text-[10px] text-[var(--text-muted)]">This run was not saved to attempt history.</p>
                      )}
                    </div>
                  ) : (
                    !runError && (
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Run your code to see stdout, stderr, the exit code and resource usage here.
                      </p>
                    )
                  )}
                </div>
              )}
            </Card>

            {saveWarning && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
                <AlertTriangle size={12} /> {saveWarning}
              </p>
            )}
            {finishError && (
              <p className="text-[11px] text-red-500 flex items-center gap-1.5" role="alert">
                <AlertTriangle size={12} /> {finishError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
