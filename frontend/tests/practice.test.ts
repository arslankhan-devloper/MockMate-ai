import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRACTICE_APTITUDE_CATEGORIES,
  PRACTICE_BRANCHES,
  PRACTICE_HUB_CARD_IDS,
  answeredQuestionCount,
  filterPracticeCategories,
  nextUnansweredQuestion,
  normalizePracticeBranch,
  practiceAccuracy,
  practiceBranchLabel,
  practiceDifficultyLabel,
  practiceErrorCopy,
  practiceHubTarget,
  practiceSelectionTotal,
  type PracticeCatalog,
  type PracticeCategoryCatalog,
  type PracticeQuestion,
  type PracticeSessionView,
} from '../src/lib/practiceCore.ts'

function category(
  name: string,
  topics: Array<{ name: string; easy: number; medium: number; hard: number }> = [],
): PracticeCategoryCatalog {
  const counts = topics.reduce(
    (sum, topic) => ({
      easy: sum.easy + topic.easy,
      medium: sum.medium + topic.medium,
      hard: sum.hard + topic.hard,
    }),
    { easy: 0, medium: 0, hard: 0 },
  )
  return {
    name,
    counts,
    total: counts.easy + counts.medium + counts.hard,
    topics: topics.map((topic) => ({
      name: topic.name,
      counts: { easy: topic.easy, medium: topic.medium, hard: topic.hard },
      total: topic.easy + topic.medium + topic.hard,
    })),
  }
}

function catalog(categories: PracticeCategoryCatalog[]): PracticeCatalog {
  return {
    kind: 'branch_mcq',
    branch: 'cse',
    total: categories.reduce((sum, entry) => sum + entry.total, 0),
    branches: PRACTICE_BRANCHES.map((branch) => ({
      id: branch.id,
      label: branch.label,
      short: branch.short,
      total: branch.id === 'cse' ? 10 : 0,
    })),
    categories,
  }
}

function question(overrides: Partial<PracticeQuestion> = {}): PracticeQuestion {
  return {
    id: 'q1',
    position: 0,
    category: 'DBMS',
    topic: 'Normalization',
    difficulty: 'medium',
    prompt: 'Prompt',
    options: ['A', 'B', 'C', 'D'],
    answer: null,
    ...overrides,
  }
}

function sessionView(questions: PracticeQuestion[]): PracticeSessionView {
  return {
    session: {
      id: 's1',
      kind: 'branch_mcq',
      branch: 'cse',
      category: 'DBMS',
      topic: null,
      difficulty: 'mixed',
      mode: 'practice',
      status: 'active',
      questionCount: questions.length,
      answeredCount: questions.filter((entry) => entry.answer).length,
      correctCount: 0,
      score: 0,
      accuracy: 0,
      timeLimitSeconds: null,
      expiresAt: null,
      remainingSeconds: null,
      expired: false,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
    },
    questions,
  }
}

const answer = {
  questionId: 'q1',
  selectedIndex: 1,
  correctIndex: 1,
  isCorrect: true,
  explanation: 'Because.',
  answeredAt: '2026-01-01T00:01:00.000Z',
}

test('the hub exposes exactly three primary cards with distinct destinations', () => {
  assert.equal(PRACTICE_HUB_CARD_IDS.length, 3)
  assert.deepEqual([...PRACTICE_HUB_CARD_IDS], ['branch-mcq', 'dsa', 'aptitude'])

  const targets = PRACTICE_HUB_CARD_IDS.map((card) => practiceHubTarget(card))
  assert.deepEqual(targets, [
    { page: 'practice', param: 'branch' },
    { page: 'coding-interview' },
    { page: 'practice', param: 'aptitude' },
  ])
  // Practice never links to a separate analytics dashboard.
  assert.equal(targets.some((target) => (target.page as string) === 'analytics'), false)
})

test('profile branch text maps to the canonical branches', () => {
  assert.equal(normalizePracticeBranch('Computer Science Engineering'), 'cse')
  assert.equal(normalizePracticeBranch('CSE'), 'cse')
  assert.equal(normalizePracticeBranch('Information Technology'), 'it')
  assert.equal(normalizePracticeBranch('Mechanical Engineering'), 'mechanical')
  assert.equal(normalizePracticeBranch('Civil'), 'civil')
  assert.equal(normalizePracticeBranch('Electrical Engineering'), 'electrical')
  assert.equal(normalizePracticeBranch('Electrical & Electronics'), 'electrical')
  assert.equal(normalizePracticeBranch('Electronics and Communication'), 'ece')
  assert.equal(normalizePracticeBranch('ECE'), 'ece')
  assert.equal(normalizePracticeBranch('AI & Data Science'), 'ai-ds')
  assert.equal(normalizePracticeBranch('Artificial Intelligence and Machine Learning'), 'ai-ds')
  assert.equal(normalizePracticeBranch('Other'), 'other')
  assert.equal(normalizePracticeBranch(''), null)
  assert.equal(normalizePracticeBranch('Astrology'), null)
})

test('branch labels are always safe for display', () => {
  assert.equal(practiceBranchLabel('cse'), 'Computer Science Engineering')
  assert.equal(practiceBranchLabel(null), 'Other Branches')
  assert.equal(practiceDifficultyLabel('hard'), 'Hard')
  assert.equal(practiceDifficultyLabel('mixed'), 'Mixed')
})

test('catalog search filters subjects and topics without inventing entries', () => {
  const categories = [
    category('DBMS', [
      { name: 'Normalization', easy: 1, medium: 1, hard: 1 },
      { name: 'Indexing', easy: 0, medium: 2, hard: 0 },
    ]),
    category('Operating Systems', [
      { name: 'Deadlocks', easy: 2, medium: 1, hard: 0 },
    ]),
  ]

  assert.equal(filterPracticeCategories(categories, '').length, 2)

  const topicSearch = filterPracticeCategories(categories, 'deadlock')
  assert.equal(topicSearch.length, 1)
  assert.equal(topicSearch[0].name, 'Operating Systems')
  assert.equal(topicSearch[0].topics.length, 1)

  const subjectSearch = filterPracticeCategories(categories, 'dbms')
  assert.equal(subjectSearch.length, 1)
  assert.equal(subjectSearch[0].topics.length, 2)

  assert.deepEqual(filterPracticeCategories(categories, 'quantum'), [])
})

test('selection totals respect subject, topic and difficulty filters', () => {
  const value = catalog([
    category('DBMS', [
      { name: 'Normalization', easy: 1, medium: 1, hard: 0 },
      { name: 'Indexing', easy: 0, medium: 2, hard: 1 },
    ]),
    category('Operating Systems', [
      { name: 'Deadlocks', easy: 2, medium: 0, hard: 0 },
    ]),
  ])

  assert.equal(practiceSelectionTotal(value, '', '', 'mixed'), 7)
  assert.equal(practiceSelectionTotal(value, 'DBMS', '', 'mixed'), 5)
  assert.equal(practiceSelectionTotal(value, 'DBMS', '', 'hard'), 1)
  assert.equal(practiceSelectionTotal(value, 'DBMS', 'Normalization', 'mixed'), 2)
  assert.equal(practiceSelectionTotal(value, 'DBMS', 'Normalization', 'easy'), 1)
  assert.equal(practiceSelectionTotal(value, 'Missing', '', 'mixed'), 0)
  assert.equal(practiceSelectionTotal(null, '', '', 'mixed'), 0)
})

test('answer navigation skips answered questions and never exposes an answer', () => {
  const unanswered = question({ id: 'q2', position: 1 })
  const view = sessionView([
    question({ id: 'q1', position: 0, answer }),
    unanswered,
    question({ id: 'q3', position: 2 }),
  ])

  assert.equal(answeredQuestionCount(view), 1)
  assert.equal(nextUnansweredQuestion(view)?.id, 'q2')
  assert.equal(nextUnansweredQuestion(view)?.answer, null)
  assert.equal(nextUnansweredQuestion(null), null)
  assert.equal(answeredQuestionCount(null), 0)
})

test('accuracy is derived from answered questions only', () => {
  assert.equal(practiceAccuracy(0, 0), 0)
  assert.equal(practiceAccuracy(3, 4), 75)
  assert.equal(practiceAccuracy(2, 3), 66.7)
  assert.equal(practiceAccuracy(Number.NaN, 5), 0)
})

test('aptitude categories are the five documented ones', () => {
  assert.deepEqual([...PRACTICE_APTITUDE_CATEGORIES], [
    'Quantitative Aptitude',
    'Logical Reasoning',
    'Verbal Ability',
    'Data Interpretation',
    'Puzzles',
  ])
})

test('error copy reports generation problems without pretending success', () => {
  assert.match(
    practiceErrorCopy(503, 'ai_not_configured', 'Not configured'),
    /AI question generation is not configured/,
  )
  assert.match(
    practiceErrorCopy(429, 'ai_rate_limited', 'Busy'),
    /Question generation is busy/,
  )
  assert.match(
    practiceErrorCopy(429, 'practice_generation_rate_limited', 'Busy'),
    /Question generation is busy/,
  )
  assert.match(practiceErrorCopy(504, 'ai_timeout', 'Timeout'), /took too long/)
  assert.match(
    practiceErrorCopy(502, 'ai_invalid_response', 'Invalid'),
    /could not be validated/,
  )
  assert.match(
    practiceErrorCopy(502, 'ai_request_failed', 'Down'),
    /temporarily unavailable/,
  )
})

test('a session view can carry its generation summary without leaking answers', () => {
  const view = sessionView([question()])
  const withGeneration: PracticeSessionView = {
    ...view,
    generation: { requested: 3, reused: 2, generated: 3, stored: 3 },
  }
  assert.equal(withGeneration.generation?.stored, 3)
  assert.equal(withGeneration.questions.every((entry) => entry.answer === null), true)
  assert.equal(JSON.stringify(withGeneration.questions).includes('correctIndex'), false)
})
test('error copy is honest for empty banks, expiry and configuration gaps', () => {
  assert.match(
    practiceErrorCopy(409, 'practice_no_questions', 'No questions'),
    /No questions are available/,
  )
  assert.match(
    practiceErrorCopy(503, 'practice_not_configured', 'Not configured'),
    /not set up yet/,
  )
  assert.match(
    practiceErrorCopy(409, 'practice_session_expired', 'Expired'),
    /timed practice session has ended/,
  )
  assert.match(practiceErrorCopy(0, 'network', 'Failed'), /Could not reach/)
  assert.match(practiceErrorCopy(401, 'unauthorized', 'No'), /session expired/)
  assert.match(practiceErrorCopy(403, 'forbidden', 'No'), /student accounts only/)
  assert.match(practiceErrorCopy(429, 'rate_limited', 'Slow down'), /Slow down/)
})
