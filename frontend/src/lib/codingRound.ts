// Coding Round content and language metadata.
//
// This module belongs to the Interview module only. It is intentionally not
// imported by Problem Solving, which keeps its own adaptive question bank,
// hidden tests and submission flow.
//
// Language ids map 1:1 to `backend/src/utils/codingRoundLanguages.ts`. The
// backend owns the provider compiler id; the browser only sees a stable key.

export const CODING_ROUND_LANGUAGES = [
  { id: 'python', label: 'Python', monaco: 'python' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { id: 'typescript', label: 'TypeScript', monaco: 'typescript' },
  { id: 'c', label: 'C', monaco: 'c' },
  { id: 'cpp', label: 'C++', monaco: 'cpp' },
  { id: 'java', label: 'Java', monaco: 'java' },
  { id: 'go', label: 'Go', monaco: 'go' },
  { id: 'rust', label: 'Rust', monaco: 'rust' },
] as const

export type CodingRoundLanguageId = (typeof CODING_ROUND_LANGUAGES)[number]['id']

export const DEFAULT_CODING_ROUND_LANGUAGE: CodingRoundLanguageId = 'python'

export function isCodingRoundLanguage(value: unknown): value is CodingRoundLanguageId {
  return typeof value === 'string' && CODING_ROUND_LANGUAGES.some((language) => language.id === value)
}

export function codingRoundLanguageLabel(id: string): string {
  return CODING_ROUND_LANGUAGES.find((language) => language.id === id)?.label ?? id
}

export function codingRoundMonacoLanguage(id: CodingRoundLanguageId): string {
  return CODING_ROUND_LANGUAGES.find((language) => language.id === id)?.monaco ?? 'plaintext'
}

export type CodingQuestionDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Mixed'

export interface CodingExample {
  input: string
  output: string
  explanation?: string
}

export interface CodingQuestion {
  id: string
  title: string
  topic: string
  difficulty: Exclude<CodingQuestionDifficulty, 'Mixed'>
  prompt: string
  examples: CodingExample[]
  constraints: string[]
}

export const CODING_ROUND_QUESTIONS: CodingQuestion[] = [
  {
    id: 'reverse-words',
    title: 'Reverse the Words',
    topic: 'Strings',
    difficulty: 'Easy',
    prompt:
      'Read one line of text and print its words in reverse order. Words are separated by single spaces and the output must use single spaces too.',
    examples: [
      { input: 'mock mate interview round\n', output: 'round interview mate mock\n' },
      { input: 'hello world\n', output: 'world hello\n' },
    ],
    constraints: ['The line contains at most 10,000 characters.', 'Words contain printable ASCII characters only.'],
  },
  {
    id: 'fizzbuzz-range',
    title: 'FizzBuzz Range',
    topic: 'Loops',
    difficulty: 'Easy',
    prompt:
      'Read an integer n. For every number from 1 to n, print "Fizz" when it is divisible by 3, "Buzz" when divisible by 5, "FizzBuzz" when divisible by both, otherwise the number itself. Print one value per line.',
    examples: [
      { input: '5\n', output: '1\n2\nFizz\n4\nBuzz\n' },
      { input: '15\n', output: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n' },
    ],
    constraints: ['1 <= n <= 10,000.'],
  },
  {
    id: 'count-vowels',
    title: 'Count the Vowels',
    topic: 'Strings',
    difficulty: 'Easy',
    prompt:
      'Read one line and print how many vowels it contains. Count a, e, i, o, u in both uppercase and lowercase. Ignore every other character.',
    examples: [
      { input: 'MockMate AI\n', output: '4\n' },
      { input: 'rhythm\n', output: '0\n' },
    ],
    constraints: ['The line contains at most 10,000 characters.'],
  },
  {
    id: 'second-largest',
    title: 'Second Largest Distinct Value',
    topic: 'Arrays',
    difficulty: 'Easy',
    prompt:
      'Read n followed by n integers. Print the second largest distinct value, or -1 when it does not exist.',
    examples: [
      { input: '5\n4 9 9 2 7\n', output: '7\n' },
      { input: '3\n5 5 5\n', output: '-1\n' },
    ],
    constraints: ['1 <= n <= 100,000.', 'Values fit in a signed 32-bit integer.'],
  },
  {
    id: 'two-sum-indices',
    title: 'Two Sum Indices',
    topic: 'Arrays',
    difficulty: 'Medium',
    prompt:
      'Read n and a target, then n integers. Print the two 0-based indices i < j whose values add up to the target, separated by a space. Print -1 when no pair exists. Exactly one answer exists when a pair is possible.',
    examples: [
      { input: '4 9\n2 7 11 15\n', output: '0 1\n' },
      { input: '3 10\n1 2 3\n', output: '-1\n' },
    ],
    constraints: ['2 <= n <= 100,000.', 'Aim for O(n) time.'],
  },
  {
    id: 'longest-unique-substring',
    title: 'Longest Substring Without Repeats',
    topic: 'Sliding Window',
    difficulty: 'Medium',
    prompt:
      'Read one line and print the length of the longest contiguous substring that contains no repeated character.',
    examples: [
      { input: 'abcabcbb\n', output: '3\n', explanation: 'The answer is "abc".' },
      { input: 'bbbbb\n', output: '1\n' },
    ],
    constraints: ['The line contains at most 100,000 characters.'],
  },
  {
    id: 'merge-intervals',
    title: 'Merge the Intervals',
    topic: 'Sorting',
    difficulty: 'Medium',
    prompt:
      'Read n followed by n intervals (start end). Merge every overlapping interval and print the merged intervals in ascending order, one per line as "start end".',
    examples: [
      { input: '4\n1 3\n2 6\n8 10\n15 18\n', output: '1 6\n8 10\n15 18\n' },
      { input: '2\n1 4\n4 5\n', output: '1 5\n' },
    ],
    constraints: ['1 <= n <= 100,000.', 'Intervals with a shared endpoint overlap.'],
  },
  {
    id: 'valid-parentheses',
    title: 'Balanced Brackets',
    topic: 'Stacks',
    difficulty: 'Medium',
    prompt:
      'Read one line containing only (), [], and {} characters. Print YES when every bracket is closed in the correct order, otherwise NO.',
    examples: [
      { input: '{[()]}\n', output: 'YES\n' },
      { input: '([)]\n', output: 'NO\n' },
    ],
    constraints: ['The line contains at most 100,000 bracket characters.'],
  },
  {
    id: 'median-two-sorted',
    title: 'Median of Two Sorted Arrays',
    topic: 'Binary Search',
    difficulty: 'Hard',
    prompt:
      'Read two lines. The first line is n followed by n sorted integers; the second is m followed by m sorted integers. Print the median of all values with exactly 5 digits after the decimal point.',
    examples: [
      { input: '2 1 3\n1 2\n', output: '2.00000\n' },
      { input: '2 1 2\n2 3 4\n', output: '2.50000\n' },
    ],
    constraints: ['0 <= n, m <= 100,000 and n + m >= 1.', 'Aim for O(log(min(n, m))) time.'],
  },
  {
    id: 'trapping-rain-water',
    title: 'Trapping Rain Water',
    topic: 'Two Pointers',
    difficulty: 'Hard',
    prompt:
      'Read n followed by n non-negative heights representing bars of width 1. Print how many units of rainwater are trapped between them.',
    examples: [
      { input: '12\n0 1 0 2 1 0 1 3 2 1 2 1\n', output: '6\n' },
      { input: '6\n4 2 0 3 2 5\n', output: '9\n' },
    ],
    constraints: ['1 <= n <= 100,000.', '0 <= height <= 100,000.'],
  },
  {
    id: 'longest-increasing-subsequence',
    title: 'Longest Increasing Subsequence',
    topic: 'Dynamic Programming',
    difficulty: 'Hard',
    prompt:
      'Read n followed by n integers. Print the length of the longest strictly increasing subsequence.',
    examples: [
      { input: '8\n10 9 2 5 3 7 101 18\n', output: '4\n', explanation: 'One optimal subsequence is 2 3 7 101.' },
      { input: '6\n0 1 0 3 2 3\n', output: '4\n' },
    ],
    constraints: ['1 <= n <= 100,000.', 'Aim for O(n log n) time.'],
  },
  {
    id: 'minimum-window-substring',
    title: 'Minimum Window Substring',
    topic: 'Sliding Window',
    difficulty: 'Hard',
    prompt:
      'Read two lines: the source string s and the target string t. Print the shortest substring of s that contains every character of t (including duplicates), or an empty line when none exists. If several windows have the same length, print any one of them.',
    examples: [
      { input: 'ADOBECODEBANC\nABC\n', output: 'BANC\n' },
      { input: 'a\naa\n', output: '\n' },
    ],
    constraints: ['1 <= |s|, |t| <= 100,000.', 'Characters are printable ASCII.'],
  },
]

export function selectCodingQuestions(
  difficulty: CodingQuestionDifficulty,
  count: number,
): CodingQuestion[] {
  const limit = Math.max(1, Math.min(10, Math.trunc(count) || 5))
  const byDifficulty =
    difficulty === 'Mixed'
      ? CODING_ROUND_QUESTIONS
      : CODING_ROUND_QUESTIONS.filter((question) => question.difficulty === difficulty)
  const remainder = CODING_ROUND_QUESTIONS.filter((question) => !byDifficulty.includes(question))
  return [...byDifficulty, ...remainder].slice(0, limit)
}

export function firstExampleInput(question: CodingQuestion): string {
  return question.examples[0]?.input ?? ''
}

// Language-specific scaffolds. They read standard input but deliberately do not
// solve the task; the candidate writes the solution.
const STARTERS: Record<CodingRoundLanguageId, (title: string) => string> = {
  python: (title) => `import sys

# ${title}
def solve() -> None:
    data = sys.stdin.read().split()
    # TODO: implement
    _ = data

if __name__ == "__main__":
    solve()
`,
  javascript: (title) => `// ${title}
const fs = require('fs')

const input = fs.readFileSync(0, 'utf8')
// TODO: implement
void input
`,
  typescript: (title) => `// ${title}
const input = await new Response(Deno.stdin.readable).text()
// TODO: implement
void input
`,
  c: (title) => `/* ${title} */
#include <stdio.h>

int main(void) {
    /* TODO: implement */
    return 0;
}
`,
  cpp: (title) => `// ${title}
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // TODO: implement
    return 0;
}
`,
  java: (title) => `// ${title}
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        // TODO: implement
        scanner.close();
    }
}
`,
  go: (title) => `// ${title}
package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    _ = reader
    _ = fmt.Print
}
`,
  rust: (title) => `// ${title}
use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    // TODO: implement
    let _ = input;
}
`,
}

export function codingStarterCode(
  language: CodingRoundLanguageId,
  question: CodingQuestion,
): string {
  return STARTERS[language](question.title)
}

// The interview-turn answer column is capped at 8,000 characters by the
// backend. A coding answer includes the code and the last run summary, so trim
// each part predictably rather than letting the save fail.
export const MAX_CODING_TURN_ANSWER = 8_000

export interface CodingTurnRunSummary {
  output?: string
  error?: string
  exitCode?: number | null
}

function clip(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(0, limit - 14))}\n… [truncated]`
}

export function buildCodingQuestionText(question: CodingQuestion): string {
  const example = question.examples[0]
  const exampleText = example
    ? `\n\nExample input:\n${example.input.trimEnd()}\nExample output:\n${example.output.trimEnd()}`
    : ''
  return `${question.prompt}${exampleText}`.slice(0, 1_000)
}

export function buildCodingTurnAnswer(
  language: CodingRoundLanguageId,
  question: CodingQuestion,
  code: string,
  run?: CodingTurnRunSummary | null,
): string {
  const header = `[Coding Round] ${question.title} (${question.topic}, ${question.difficulty})\nLanguage: ${codingRoundLanguageLabel(language)}\n\n`
  const runLabel = run
    ? `\n\nLast run: exit ${run.exitCode ?? 'n/a'}${run.output ? `\nstdout:\n${clip(run.output, 600)}` : ''}${run.error ? `\nstderr:\n${clip(run.error, 600)}` : ''}`
    : ''
  const budget = MAX_CODING_TURN_ANSWER - header.length - runLabel.length
  return `${header}${clip(code, Math.max(200, budget))}${runLabel}`
}
