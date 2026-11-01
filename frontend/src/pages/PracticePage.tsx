import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Card, ProgressBar } from '../components/ui'
import { useAuth } from '../lib/auth'
import {
  PRACTICE_APTITUDE_CATEGORIES,
  PRACTICE_BRANCHES,
  PRACTICE_QUESTION_COUNTS,
  answeredQuestionCount,
  completePracticeSession,
  createPracticeSession,
  describePracticeError,
  filterPracticeCategories,
  getActivePracticeSession,
  getPracticeCatalog,
  nextUnansweredQuestion,
  normalizePracticeBranch,
  practiceBranchLabel,
  practiceBranchShort,
  practiceDifficultyLabel,
  practiceSelectionTotal,
  submitPracticeAnswer,
  type PracticeBranchId,
  type PracticeCatalog,
  type PracticeDifficultyFilter,
  type PracticeKind,
  type PracticeMode,
  type PracticeQuestion,
  type PracticeQuestionCount,
  type PracticeSessionView,
} from '../lib/practice'
import type { PracticeGenerationSummary } from '../lib/practiceCore'

interface PracticePageProps {
  kind: PracticeKind
  studentBranch: string
  onNavigate: (page: 'problem-solving') => void
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function difficultyVariant(difficulty: string): 'success' | 'warning' | 'error' {
  return difficulty === 'hard' ? 'error' : difficulty === 'medium' ? 'warning' : 'success'
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D']

const GENERATION_STEPS = [
  'Checking the question bank for matching questions',
  'Writing any missing questions with AI',
  'Validating answers, explanations and duplicates',
  'Preparing your session',
]

export default function PracticePage({ kind, studentBranch, onNavigate }: PracticePageProps) {
  const { session: authSession } = useAuth()
  const accessToken = authSession?.access_token ?? null

  const [branch, setBranch] = useState<PracticeBranchId>(
    () => normalizePracticeBranch(studentBranch) ?? 'cse',
  )
  const [catalog, setCatalog] = useState<PracticeCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [catalogNonce, setCatalogNonce] = useState(0)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<PracticeDifficultyFilter>('mixed')
  const [mode, setMode] = useState<PracticeMode>('practice')
  const [count, setCount] = useState<PracticeQuestionCount>(10)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [generationStep, setGenerationStep] = useState(0)
  const [lastGeneration, setLastGeneration] = useState<PracticeGenerationSummary | null>(null)

  const [resume, setResume] = useState<PracticeSessionView | null>(null)
  const [resumeNonce, setResumeNonce] = useState(0)
  const [view, setView] = useState<PracticeSessionView | null>(null)
  const [result, setResult] = useState<PracticeSessionView | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [answerError, setAnswerError] = useState('')
  const [completing, setCompleting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const autoFinishedRef = useRef(false)

  // Reset the runner when the hub sends the student to the other practice kind.
  useEffect(() => {
    setView(null)
    setResult(null)
    setResume(null)
    setCurrentId(null)
    setSelected(null)
    setSearch('')
    setCategory('')
    setTopic('')
    setStartError('')
    setAnswerError('')
  }, [kind])

  useEffect(() => {
    if (!accessToken) {
      setCatalogLoading(false)
      setCatalogError('Sign in to load practice questions.')
      return
    }
    const controller = new AbortController()
    setCatalogLoading(true)
    setCatalogError('')
    getPracticeCatalog(
      accessToken,
      kind,
      kind === 'branch_mcq' ? branch : null,
      controller.signal,
    )
      .then((loaded) => {
        setCatalog(loaded)
        // A branch switch can remove the selected subject/topic.
        setCategory((current) =>
          current && loaded.categories.some((entry) => entry.name === current) ? current : '',
        )
        setTopic((current) => {
          if (!current) return ''
          return loaded.categories.some((entry) =>
            entry.topics.some((entryTopic) => entryTopic.name === current),
          )
            ? current
            : ''
        })
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setCatalogError(describePracticeError(err))
      })
      .finally(() => setCatalogLoading(false))
    return () => controller.abort()
  }, [accessToken, branch, catalogNonce, kind])

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    getActivePracticeSession(accessToken, kind, controller.signal)
      .then((loaded) => {
        if ('questions' in loaded && loaded.session) setResume(loaded)
        else setResume(null)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Restoring is optional; the catalog still works without it.
        setResume(null)
      })
    return () => controller.abort()
  }, [accessToken, kind, resumeNonce])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Honest staged progress while the request is in flight. The backend does the
  // real work; these stages describe that work, they are not a fake completion.
  useEffect(() => {
    if (!starting) return
    const timer = window.setInterval(() => {
      setGenerationStep((step) => Math.min(step + 1, GENERATION_STEPS.length - 1))
    }, 2500)
    return () => window.clearInterval(timer)
  }, [starting])

  const categories = useMemo(
    () => filterPracticeCategories(catalog?.categories ?? [], search),
    [catalog, search],
  )
  const matchingTotal = practiceSelectionTotal(catalog, category, topic, difficulty)
  const branchOptions = catalog?.branches ?? PRACTICE_BRANCHES.map((entry) => ({
    id: entry.id,
    label: entry.label,
    short: entry.short,
    total: 0,
  }))

  const currentQuestion: PracticeQuestion | null = useMemo(() => {
    if (!view) return null
    return (
      view.questions.find((question) => question.id === currentId) ??
      nextUnansweredQuestion(view) ??
      view.questions[0] ??
      null
    )
  }, [currentId, view])

  const remainingSeconds =
    view?.session.expiresAt
      ? Math.max(0, Math.floor((Date.parse(view.session.expiresAt) - now) / 1000))
      : null

  const beginSession = useCallback((sessionView: PracticeSessionView) => {
    const first = nextUnansweredQuestion(sessionView) ?? sessionView.questions[0] ?? null
    setView(sessionView)
    setResult(null)
    setCurrentId(first?.id ?? null)
    setSelected(first?.answer?.selectedIndex ?? null)
    setAnswerError('')
    setStartError('')
    setResume(null)
    autoFinishedRef.current = false
  }, [])

  const finish = useCallback(async (target?: PracticeSessionView) => {
    const active = target ?? view
    if (!accessToken || !active || completing) return
    setCompleting(true)
    setAnswerError('')
    try {
      const completed = await completePracticeSession(accessToken, active.session.id)
      setView(completed)
      setResult(completed)
      setResume(null)
      setResumeNonce((value) => value + 1)
    } catch (err) {
      const message = describePracticeError(err)
      setAnswerError(message)
      setStartError(message)
    } finally {
      setCompleting(false)
    }
  }, [accessToken, completing, view])

  useEffect(() => {
    if (
      view?.session.mode === 'timed' &&
      remainingSeconds === 0 &&
      !autoFinishedRef.current &&
      !completing
    ) {
      autoFinishedRef.current = true
      void finish()
    }
  }, [completing, finish, remainingSeconds, view?.session.mode])

  const canGenerate = kind === 'aptitude' ? Boolean(category) : Boolean(topic || category)
  const canStart = !catalogLoading && !starting && (matchingTotal > 0 || canGenerate)

  const startSession = async () => {
    if (!accessToken || starting) return
    if (matchingTotal === 0 && !canGenerate) {
      setStartError(
        kind === 'aptitude'
          ? 'Choose an aptitude category first. AI can then generate questions for it.'
          : 'Choose a subject or topic first. AI can then generate questions for it.',
      )
      return
    }
    setStarting(true)
    setStartError('')
    setGenerationStep(0)
    setLastGeneration(null)
    try {
      const created = await createPracticeSession(accessToken, {
        kind,
        branch: kind === 'branch_mcq' ? branch : null,
        category: category || null,
        topic: topic || null,
        difficulty,
        mode,
        count,
      })
      setLastGeneration(created.generation ?? null)
      beginSession(created)
    } catch (err) {
      setStartError(describePracticeError(err))
    } finally {
      setStarting(false)
    }
  }

  const submitAnswer = async () => {
    if (
      !accessToken ||
      !view ||
      !currentQuestion ||
      selected === null ||
      currentQuestion.answer ||
      submitting
    ) {
      return
    }
    setSubmitting(true)
    setAnswerError('')
    try {
      const response = await submitPracticeAnswer(
        accessToken,
        view.session.id,
        currentQuestion.id,
        selected,
      )
      setView((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          session: response.session,
          questions: previous.questions.map((question) =>
            question.id === currentQuestion.id
              ? { ...question, answer: response.answer }
              : question,
          ),
        }
      })
    } catch (err) {
      setAnswerError(describePracticeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const advance = () => {
    if (!view || !currentQuestion) return
    const index = view.questions.findIndex((question) => question.id === currentQuestion.id)
    const next =
      view.questions.slice(index + 1).find((question) => !question.answer) ??
      view.questions.find((question) => !question.answer) ??
      null
    if (!next) {
      void finish()
      return
    }
    setCurrentId(next.id)
    setSelected(next.answer?.selectedIndex ?? null)
    setAnswerError('')
  }

  const backToCatalog = () => {
    setView(null)
    setResult(null)
    setCurrentId(null)
    setSelected(null)
    setAnswerError('')
    setResumeNonce((value) => value + 1)
  }

  const heading = kind === 'aptitude' ? 'Aptitude & Reasoning' : 'Branch-wise MCQ Practice'

  // ── Result screen ───────────────────────────────────────────────
  if (result) {
    const { session, questions } = result
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <button
          type="button"
          onClick={() => onNavigate('problem-solving')}
          className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} /> Back to Practice Hub
        </button>

        <Card className="p-6 sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-from)]">
              <Trophy size={24} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[var(--text-primary)]">Session complete</h1>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {heading} · {practiceDifficultyLabel(session.difficulty)} ·{' '}
                {session.mode === 'timed' ? 'Timed' : 'Practice'} mode
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Score</p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--text-primary)]">
                {session.score}<span className="text-sm font-semibold text-[var(--text-muted)]">/{session.questionCount}</span>
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Accuracy</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-500">{session.accuracy}%</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Answered</p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--text-primary)]">
                {session.answeredCount}<span className="text-sm font-semibold text-[var(--text-muted)]">/{session.questionCount}</span>
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Correct</p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--text-primary)]">{session.correctCount}</p>
            </div>
          </div>

          {session.answeredCount < session.questionCount ? (
            <p className="mt-3 text-[11px] text-[var(--text-secondary)]">
              You ended early, so unanswered questions are not counted in accuracy.
            </p>
          ) : null}

          <div className="mt-6 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Review
            </p>
            {questions.map((question, index) => (
              <div
                key={question.id}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <div className="flex items-start gap-2">
                  {question.answer ? (
                    question.answer.isCorrect ? (
                      <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
                    )
                  ) : (
                    <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-[var(--text-muted)]" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {index + 1}. {question.prompt}
                    </p>
                    {question.answer ? (
                      <>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                          Your answer: {OPTION_LETTERS[question.answer.selectedIndex]}.{' '}
                          {question.options[question.answer.selectedIndex]}
                          {!question.answer.isCorrect ? (
                            <>
                              {' '}· Correct: {OPTION_LETTERS[question.answer.correctIndex]}.{' '}
                              {question.options[question.answer.correctIndex]}
                            </>
                          ) : null}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                          {question.answer.explanation}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">Not answered.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button className="sm:flex-1" onClick={backToCatalog}>
              <RotateCcw size={14} /> Practice again
            </Button>
            <Button variant="secondary" className="sm:flex-1" onClick={() => onNavigate('problem-solving')}>
              Back to hub
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ── Active session ──────────────────────────────────────────────
  if (view && currentQuestion) {
    const answer = currentQuestion.answer
    const answered = answeredQuestionCount(view)
    const progress = view.questions.length > 0
      ? Math.round((answered / view.questions.length) * 100)
      : 0

    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={backToCatalog}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={14} /> Leave session
          </button>
          <Badge variant="info" className="ml-auto">
            <Target size={11} /> {view.session.correctCount}/{view.session.answeredCount} correct
          </Badge>
          {lastGeneration && lastGeneration.stored > 0 ? (
            <Badge variant="success">
              <Sparkles size={11} /> {lastGeneration.stored} new
            </Badge>
          ) : null}
          {remainingSeconds !== null ? (
            <Badge variant={remainingSeconds <= 60 ? 'error' : 'warning'}>
              <Clock size={11} /> {formatClock(remainingSeconds)}
            </Badge>
          ) : (
            <Badge variant="default">Practice mode</Badge>
          )}
        </div>

        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {heading} · Question {view.questions.findIndex((question) => question.id === currentQuestion.id) + 1} of {view.questions.length}
            </p>
            <span className="text-[11px] text-[var(--text-muted)]">{progress}% answered</span>
          </div>
          <ProgressBar value={progress} size="sm" />
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant={difficultyVariant(currentQuestion.difficulty)}>
              {practiceDifficultyLabel(currentQuestion.difficulty)}
            </Badge>
            <Badge variant="default">{currentQuestion.category}</Badge>
            <Badge variant="default">{currentQuestion.topic}</Badge>
          </div>

          <p className="text-base font-semibold leading-relaxed text-[var(--text-primary)]">
            {currentQuestion.prompt}
          </p>

          <div className="mt-5 space-y-2" role="radiogroup" aria-label="Answer options">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selected === index
              const isCorrect = answer ? answer.correctIndex === index : false
              const isWrongSelection = Boolean(answer && isSelected && !answer.isCorrect)
              const tone = answer
                ? isCorrect
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : isWrongSelection
                    ? 'border-red-500/60 bg-red-500/10'
                    : 'border-[var(--border)] bg-[var(--surface)] opacity-70'
                : isSelected
                  ? 'border-[var(--accent-from)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent-from)]'
              return (
                <button
                  key={`${currentQuestion.id}-${index}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={Boolean(answer) || submitting}
                  onClick={() => setSelected(index)}
                  className={`flex w-full items-start gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-all-smooth ${tone} ${answer ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent-from)]">
                    {OPTION_LETTERS[index]}
                  </span>
                  <span className="text-sm leading-relaxed text-[var(--text-primary)]">{option}</span>
                  {answer && isCorrect ? (
                    <CheckCircle2 size={16} className="ml-auto flex-shrink-0 text-emerald-500" />
                  ) : null}
                  {isWrongSelection ? (
                    <XCircle size={16} className="ml-auto flex-shrink-0 text-red-500" />
                  ) : null}
                </button>
              )
            })}
          </div>

          {answerError ? (
            <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 p-3" role="alert">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{answerError}</p>
            </div>
          ) : null}

          {answer ? (
            <div
              className={`mt-4 rounded-[var(--radius-md)] border p-3 ${
                answer.isCorrect
                  ? 'border-emerald-500/25 bg-emerald-500/10'
                  : 'border-red-500/25 bg-red-500/10'
              }`}
            >
              <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                {answer.isCorrect ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-500" /> Correct
                  </>
                ) : (
                  <>
                    <XCircle size={16} className="text-red-500" /> Incorrect
                  </>
                )}
              </p>
              {!answer.isCorrect ? (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Correct answer: {OPTION_LETTERS[answer.correctIndex]}.{' '}
                  {currentQuestion.options[answer.correctIndex]}
                </p>
              ) : null}
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                {answer.explanation}
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {answer ? (
              <Button onClick={advance}>
                {view.questions.some((question) => !question.answer) ? 'Next question' : 'See results'}
                <Send size={14} className="ml-auto" />
              </Button>
            ) : (
              <Button
                onClick={() => { void submitAnswer() }}
                loading={submitting}
                disabled={selected === null}
              >
                <Send size={14} /> Submit answer
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => { void finish() }}
              loading={completing}
            >
              End session
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ── Catalog ─────────────────────────────────────────────────────
  const emptyBank = Boolean(catalog && catalog.total === 0)
  const noMatches = Boolean(catalog && catalog.total > 0 && matchingTotal === 0)
  const branchEmpty = Boolean(
    catalog &&
    kind === 'branch_mcq' &&
    (catalog.branches.find((entry) => entry.id === branch)?.total ?? 0) === 0,
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      {starting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="status" aria-live="polite">
          <Card className="w-full max-w-md p-6">
            <div className="mb-3 flex items-center gap-2">
              <Loader2 size={20} className="animate-spin text-[var(--accent-from)]" />
              <p className="text-sm font-extrabold text-[var(--text-primary)]">Generating questions…</p>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              Existing questions are reused first. Only missing questions are generated and
              validated before they are saved.
            </p>
            <ProgressBar value={((generationStep + 1) / GENERATION_STEPS.length) * 100} size="sm" />
            <ol className="mt-3 space-y-1.5">
              {GENERATION_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-2 text-[11px]">
                  {index < generationStep ? (
                    <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                  ) : index === generationStep ? (
                    <Loader2 size={13} className="mt-0.5 flex-shrink-0 animate-spin text-[var(--accent-from)]" />
                  ) : (
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--border)]" />
                  )}
                  <span className={index <= generationStep ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => onNavigate('problem-solving')}
        className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} /> Back to Practice Hub
      </button>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            {heading}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
            {kind === 'aptitude'
              ? 'Choose a topic, then practise with instant feedback and explanations.'
              : 'Choose your branch, subject and topic. Your profile branch is only the starting point.'}
          </p>
        </div>
        {kind === 'branch_mcq' ? (
          <Badge variant="info">
            <Sparkles size={11} /> Default: {practiceBranchShort(branch)}
          </Badge>
        ) : (
          <Badge variant="info">
            <Sparkles size={11} /> {PRACTICE_APTITUDE_CATEGORIES.length} categories
          </Badge>
        )}
      </div>

      {resume ? (
        <div className="mb-4 flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--accent-from)]/30 bg-[var(--accent-soft)] p-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--text-primary)]">Unfinished session</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              {resume.session.correctCount}/{resume.session.answeredCount} correct ·{' '}
              {resume.session.questionCount - resume.session.answeredCount} question(s) left
            </p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Button size="sm" onClick={() => beginSession(resume)}>
              <Play size={12} /> Resume
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { void finish(resume) }}>
              End it
            </Button>
          </div>
        </div>
      ) : null}

      {catalogError ? (
        <Card className="mb-4 p-5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={17} className="mt-0.5 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Could not load practice</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{catalogError}</p>
            </div>
          </div>
          <Button
            className="mt-4"
            variant="secondary"
            size="sm"
            onClick={() => setCatalogNonce((value) => value + 1)}
          >
            <RotateCcw size={13} /> Retry
          </Button>
        </Card>
      ) : null}

      {catalogLoading ? (
        <Card className="p-8 text-center">
          <Loader2 size={24} className="mx-auto mb-2 animate-spin text-[var(--accent-from)]" />
          <p className="text-xs text-[var(--text-muted)]">Loading the question catalog…</p>
        </Card>
      ) : null}

      {catalog && !catalogLoading ? (
        <>
          {emptyBank || branchEmpty ? (
            <Card className="mb-4 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-from)]">
                <ShieldCheck size={22} />
              </div>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {kind === 'aptitude'
                  ? 'No aptitude questions are available yet'
                  : `No questions are available for ${practiceBranchLabel(branch)} yet`}
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[var(--text-secondary)]">
                The bank has no stored questions for this selection yet. Pick a subject or topic
                and MockMate will generate validated questions with AI for it. Nothing is invented
                to fill the space.
              </p>
            </Card>
          ) : null}

          {kind === 'branch_mcq' ? (
            <Card className="mb-4 p-4 sm:p-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Branch
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {branchOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setBranch(option.id as PracticeBranchId)}
                    aria-pressed={branch === option.id}
                    className={`rounded-[var(--radius-md)] border px-3 py-2 text-left transition-all-smooth cursor-pointer ${
                      branch === option.id
                        ? 'border-[var(--accent-from)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent-from)]'
                    }`}
                  >
                    <span className="block text-xs font-bold text-[var(--text-primary)]">{option.short}</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                      {option.total} question{option.total === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_280px]">
            <Card className="p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {kind === 'aptitude' ? 'Category & topic' : 'Subject & topic'}
                </p>
                {category ? (
                  <Badge variant="info">{category}</Badge>
                ) : null}
                {topic ? <Badge variant="success">{topic}</Badge> : null}
                {(category || topic) ? (
                  <button
                    type="button"
                    onClick={() => { setCategory(''); setTopic('') }}
                    className="ml-auto text-[11px] font-semibold text-[var(--accent-from)] hover:underline"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="relative mb-3">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search subjects or topics"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-from)]"
                />
              </div>

              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {categories.length === 0 ? (
                  <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-4 text-center text-[11px] text-[var(--text-muted)]">
                    {emptyBank
                      ? 'The question catalog is empty.'
                      : 'No subjects or topics match your search.'}
                  </p>
                ) : (
                  categories.map((entry) => (
                    <div key={entry.name} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
                      <button
                        type="button"
                        onClick={() => { setCategory(entry.name); setTopic('') }}
                        className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left ${
                          category === entry.name && !topic ? 'bg-[var(--accent-soft)]' : ''
                        }`}
                      >
                        <span className="text-xs font-bold text-[var(--text-primary)]">{entry.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{entry.total}</span>
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1.5 px-1">
                        {entry.topics.length === 0 ? (
                          <span className="text-[10px] text-[var(--text-muted)]">No topics yet</span>
                        ) : (
                          entry.topics.map((entryTopic) => (
                            <button
                              key={entryTopic.name}
                              type="button"
                              onClick={() => { setCategory(entry.name); setTopic(entryTopic.name) }}
                              className={`rounded-full border px-2 py-0.5 text-[10px] transition-all-smooth ${
                                category === entry.name && topic === entryTopic.name
                                  ? 'border-[var(--accent-from)] bg-[var(--accent-from)] text-white'
                                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'
                              }`}
                            >
                              {entryTopic.name} · {entryTopic.total}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="h-fit p-4 sm:p-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Difficulty</p>
              <div className="mb-4 grid grid-cols-2 gap-1.5">
                {(['mixed', 'easy', 'medium', 'hard'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDifficulty(option)}
                    aria-pressed={difficulty === option}
                    className={`rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] font-bold transition-all-smooth ${
                      difficulty === option
                        ? 'gradient-bg text-white'
                        : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'
                    }`}
                  >
                    {practiceDifficultyLabel(option)}
                  </button>
                ))}
              </div>

              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Mode</p>
              <div className="mb-4 grid grid-cols-2 gap-1.5">
                {(['practice', 'timed'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    aria-pressed={mode === option}
                    className={`rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] font-bold capitalize transition-all-smooth ${
                      mode === option
                        ? 'gradient-bg text-white'
                        : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Questions</p>
              <div className="mb-4 grid grid-cols-3 gap-1.5">
                {PRACTICE_QUESTION_COUNTS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCount(option)}
                    aria-pressed={count === option}
                    className={`rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] font-bold transition-all-smooth ${
                      count === option
                        ? 'gradient-bg text-white'
                        : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent-from)]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <p className="mb-2 text-[11px] text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">{matchingTotal}</strong> question
                {matchingTotal === 1 ? '' : 's'} stored
                {topic ? ` in ${topic}` : category ? ` in ${category}` : ''}.
                {matchingTotal < count && canGenerate ? (
                  <>
                    {' '}
                    <span className="text-[var(--accent-from)]">
                      {Math.max(0, count - matchingTotal)} more generated with AI to fill {count}.
                    </span>
                  </>
                ) : null}
              </p>

              {startError ? (
                <div className="mb-3 flex items-start gap-1.5 rounded-[var(--radius-sm)] border border-red-500/20 bg-red-500/10 p-2">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-red-500" />
                  <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">{startError}</p>
                </div>
              ) : null}

              <Button
                className="w-full"
                onClick={() => { void startSession() }}
                loading={starting}
                disabled={!canStart}
              >
                <Play size={14} /> Start {mode === 'timed' ? 'timed test' : 'practice'}
              </Button>
              {noMatches ? (
                <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                  No stored questions match these filters yet. AI generation needs a subject or
                  topic selection.
                </p>
              ) : null}
            </Card>
          </div>

          <p className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <ShieldCheck size={12} /> Correct answers are checked on the server; scores cannot be
            edited in the browser.
          </p>
        </>
      ) : null}
    </div>
  )
}
