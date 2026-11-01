import {
  ArrowRight,
  BookOpenCheck,
  Calculator,
  Code2,
  GraduationCap,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Badge, Button, Card } from '../components/ui'
import {
  normalizePracticeBranch,
  practiceBranchLabel,
  practiceHubTarget,
  type PracticeHubCardId,
} from '../lib/practice'

interface PracticeHubProps {
  onNavigate: (page: 'practice' | 'coding-interview', param?: string) => void
  studentBranch: string
}

// The Problem Solving landing page: exactly three ways to practise. Overall
// analytics live on the main Dashboard, not here.
export default function PracticeHub({ onNavigate, studentBranch }: PracticeHubProps) {
  const branch = normalizePracticeBranch(studentBranch)
  const open = (card: PracticeHubCardId) => {
    const target = practiceHubTarget(card)
    onNavigate(target.page, target.param)
  }

  const cards = [
    {
      id: 'branch-mcq',
      icon: GraduationCap,
      title: 'Branch-wise MCQ Practice',
      description:
        'Subject- and topic-wise multiple-choice practice for your engineering branch, with easy, medium and hard filters.',
      points: [
        'Pick any branch — your profile branch is only the default',
        'Practice mode or an optional timed quiz',
        'Instant feedback, explanations and a session score',
      ],
      action: 'Open MCQ practice',
      onClick: () => open('branch-mcq'),
      accent: '#6366f1',
    },
    {
      id: 'dsa',
      icon: Code2,
      title: 'DSA & Coding Practice',
      description:
        'The existing adaptive coding workspace: AI-generated DSA problems across core data-structures and algorithms topics, with real execution and grading.',
      points: [
        'Monaco editor with Python and JavaScript',
        'Visible tests, hidden grading and submission history',
        'Topic progress and adaptive difficulty preserved',
      ],
      action: 'Open DSA practice',
      onClick: () => open('dsa'),
      accent: '#14b8a6',
    },
    {
      id: 'aptitude',
      icon: Calculator,
      title: 'Aptitude & Reasoning Practice',
      description:
        'Campus-placement aptitude sets covering quantitative, logical, verbal, data interpretation and puzzles.',
      points: [
        'Topic-wise questions with four options',
        'Practice mode or an optional timed test',
        'Correct-answer feedback and explanations',
      ],
      action: 'Open aptitude practice',
      onClick: () => open('aptitude'),
      accent: '#f59e0b',
    },
  ] as const

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="info">
              <Sparkles size={11} /> Placement preparation
            </Badge>
            <Badge variant="default">
              <GraduationCap size={11} /> {practiceBranchLabel(branch)}
            </Badge>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Practice Hub
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Three focused ways to prepare: branch MCQs, DSA coding and aptitude reasoning.
            Results are saved so the main Dashboard can show your progress later.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
          <ShieldCheck size={14} className="text-[var(--accent-from)]" />
          Private to your account
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.id} className="flex h-full flex-col p-5 sm:p-6">
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)]"
                style={{ background: `${card.accent}1a`, color: card.accent }}
              >
                <Icon size={21} />
              </div>
              <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                {card.title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                {card.description}
              </p>
              <ul className="mt-4 space-y-1.5">
                {card.points.map((point) => (
                  <li key={point} className="flex gap-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    <ListChecks size={12} className="mt-0.5 flex-shrink-0 text-[var(--accent-from)]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex-1" />
              <Button className="w-full" onClick={card.onClick}>
                {card.action}
                <ArrowRight size={14} className="ml-auto" />
              </Button>
            </Card>
          )
        })}
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <BookOpenCheck size={15} className="mt-0.5 flex-shrink-0 text-[var(--accent-from)]" />
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          MCQ and aptitude sections show an honest empty state when a branch, subject or
          topic has no verified questions yet. Interview Coding Round remains a separate
          feature inside Interview Setup.
        </p>
      </div>
    </div>
  )
}
