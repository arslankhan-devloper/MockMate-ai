// Bounded, explainable adaptive difficulty for the Problem Solving workspace.
//
// One attempt never jumps more than one level. A single failure does not force
// the easiest level; a prerequisite step only happens after repeated failures
// in the same topic. Every decision carries a human-readable reason that the UI
// can show to the student.

import type { ProblemDifficulty, ProblemTest } from './problemGenerationValidation.js'

export type ProblemOutcome =
  | 'accepted'
  | 'partial'
  | 'wrong'
  | 'runtime_error'
  | 'compile_error'
  | 'time_limit_exceeded'

export type AdaptiveFocus =
  | 'harder'
  | 'same_topic'
  | 'edge_case'
  | 'prerequisite'
  | 'optimization'

export interface AdaptiveInput {
  currentDifficulty: ProblemDifficulty
  outcome: ProblemOutcome
  /** True when every server-side test passed. Never inferred from the client. */
  allTestsPassed: boolean
  /** Submissions for this specific problem, including the current one. */
  attemptsOnProblem: number
  /** Consecutive unsuccessful attempts in this topic, including the current one. */
  consecutiveFailures: number
  hintsUsed: number
  topic: string | null
  /**
   * Optional signal from a real measurement (for example a provider timeout
   * that still produced a correct answer). Left false unless evidence exists.
   */
  inefficient?: boolean
}

export interface AdaptiveDecision {
  difficulty: ProblemDifficulty
  topic: string | null
  focus: AdaptiveFocus
  reason: string
}

const ORDER: ProblemDifficulty[] = ['easy', 'medium', 'hard']

function step(difficulty: ProblemDifficulty, delta: number): ProblemDifficulty {
  const index = ORDER.indexOf(difficulty)
  return ORDER[Math.min(ORDER.length - 1, Math.max(0, index + delta))]
}

export function nextProblemDifficulty(
  current: ProblemDifficulty,
  direction: 'up' | 'down' | 'same',
): ProblemDifficulty {
  return step(current, direction === 'up' ? 1 : direction === 'down' ? -1 : 0)
}

function label(difficulty: ProblemDifficulty): string {
  return difficulty[0].toUpperCase() + difficulty.slice(1)
}

export function decideNextProblem(input: AdaptiveInput): AdaptiveDecision {
  const topic = input.topic && input.topic.trim() ? input.topic.trim() : null
  const where = topic ? ` on ${topic}` : ''
  const current = input.currentDifficulty
  const accepted = input.outcome === 'accepted' && input.allTestsPassed

  if (accepted) {
    if (input.inefficient) {
      return {
        difficulty: current,
        topic,
        focus: 'optimization',
        reason: `Staying at ${label(current)}${where} with a follow-up focused on time and space complexity.`,
      }
    }
    if (input.hintsUsed > 0) {
      return {
        difficulty: current,
        topic,
        focus: 'same_topic',
        reason: `Staying at ${label(current)}${where} to consolidate the idea after using ${input.hintsUsed} hint${input.hintsUsed === 1 ? '' : 's'}.`,
      }
    }
    if (input.attemptsOnProblem >= 2) {
      return {
        difficulty: current,
        topic,
        focus: 'same_topic',
        reason: `Keeping ${label(current)}${where} for another problem after solving this one across multiple attempts.`,
      }
    }
    const harder = nextProblemDifficulty(current, 'up')
    if (harder !== current) {
      return {
        difficulty: harder,
        topic,
        focus: 'harder',
        reason: `Moving to ${label(harder)} because your recent solution passed all tests without hints.`,
      }
    }
    return {
      difficulty: current,
      topic,
      focus: 'harder',
      reason: `Staying at Hard${where} and introducing a deeper related concept.`,
    }
  }

  if (input.outcome === 'partial') {
    return {
      difficulty: current,
      topic,
      focus: 'edge_case',
      reason: `Staying at ${label(current)}${where} with a related problem targeting the edge cases that failed.`,
    }
  }

  if (input.consecutiveFailures >= 2) {
    const easier = nextProblemDifficulty(current, 'down')
    return {
      difficulty: easier,
      topic,
      focus: 'prerequisite',
      reason:
        easier === current
          ? `Staying at ${label(current)}${where} with a foundational prerequisite problem after repeated attempts.`
          : `Dropping to ${label(easier)}${where} for a prerequisite problem after repeated unsuccessful attempts.`,
    }
  }

  return {
    difficulty: current,
    topic,
    focus: 'prerequisite',
    reason: `Staying at ${label(current)}${where} with a simpler related problem that rebuilds the missing concept.`,
  }
}

// Maps a grader verdict to the adaptive outcome and its pass signal. The client
// never chooses this value.
export function outcomeFromVerdict(
  verdict: 'accepted' | 'wrong_answer' | 'runtime_error' | 'compile_error' | 'time_limit_exceeded',
  passedTests: number,
  totalTests: number,
): { outcome: ProblemOutcome; allTestsPassed: boolean } {
  const allTestsPassed = totalTests > 0 && passedTests >= totalTests
  if (verdict === 'accepted' && allTestsPassed) {
    return { outcome: 'accepted', allTestsPassed: true }
  }
  if (verdict === 'wrong_answer') {
    return {
      outcome: passedTests > 0 ? 'partial' : 'wrong',
      allTestsPassed: false,
    }
  }
  return { outcome: verdict, allTestsPassed: false }
}

// Convenience for tests/prompts: describe what the grader actually observed
// without inventing complexity or timing claims.
export function describeOutcome(
  outcome: ProblemOutcome,
  passed: number,
  total: number,
): string {
  if (outcome === 'accepted') return `Accepted: ${passed}/${total} tests passed.`
  if (outcome === 'partial') return `Partially correct: ${passed}/${total} tests passed.`
  return `Not accepted (${outcome}): ${passed}/${total} tests passed.`
}

// Kept exported so callers do not need to duplicate the test shape.
export type HiddenTest = ProblemTest
