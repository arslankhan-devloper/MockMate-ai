// Persistence for Coding Round runs.
//
// One row per execution attempt, scoped to the owning interview session and the
// authenticated student. Rows are append-only: re-running code never overwrites
// an earlier attempt, so the report can show what actually ran. A pre-migration
// environment (table absent) must not break execution: the run still returns its
// result with `persisted: false` and a warning.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CodingRoundLanguageId } from '../utils/codingRoundLanguages.js'
import { compilerForLanguage } from '../utils/codingRoundLanguages.js'
import type { CodingRunResult } from './onlineCompiler.service.js'

export const CODING_ATTEMPT_COLUMNS =
  'id, session_id, student_id, question_index, language, compiler_id, code, stdin, ' +
  'stdout, stderr, exit_code, status, signal, truncated, time_seconds, total_seconds, ' +
  'memory_kb, provider, created_at'

export interface CodingAttemptRow {
  id: string
  session_id: string
  student_id: string
  question_index: number
  language: string
  compiler_id: string
  code: string
  stdin: string
  stdout: string
  stderr: string
  exit_code: number | null
  status: string
  signal: number | null
  truncated: boolean
  time_seconds: number | string | null
  total_seconds: number | string | null
  memory_kb: number | string | null
  provider: string
  created_at: string
}

export interface CodingAttemptResponse {
  id: string
  sessionId: string
  questionIndex: number
  language: string
  compilerId: string
  code: string
  input: string
  output: string
  error: string
  exitCode: number | null
  status: string
  signal: number | null
  truncated: boolean
  timeSeconds: number | null
  totalSeconds: number | null
  memoryKb: number | null
  provider: string
  createdAt: string
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function decimalOrNull(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function mapCodingAttemptRow(row: CodingAttemptRow): CodingAttemptResponse {
  return {
    id: row.id,
    sessionId: row.session_id,
    questionIndex: row.question_index,
    language: row.language,
    compilerId: row.compiler_id,
    code: row.code,
    input: row.stdin,
    output: row.stdout,
    error: row.stderr,
    exitCode: numberOrNull(row.exit_code),
    status: row.status,
    signal: numberOrNull(row.signal),
    truncated: row.truncated,
    timeSeconds: numberOrNull(row.time_seconds),
    totalSeconds: numberOrNull(row.total_seconds),
    memoryKb: numberOrNull(row.memory_kb),
    provider: row.provider,
    createdAt: row.created_at,
  }
}

export function isMissingCodingAttemptTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist/i.test(error.message ?? '')
}

export interface InsertCodingAttemptInput {
  sessionId: string
  studentId: string
  questionIndex: number
  language: CodingRoundLanguageId
  code: string
  input: string
  result: CodingRunResult
}

export async function insertCodingAttempt(
  client: SupabaseClient,
  attempt: InsertCodingAttemptInput,
): Promise<{ data: CodingAttemptRow | null; error: { code?: string; message?: string } | null }> {
  return client
    .from('interview_coding_attempts')
    .insert({
      session_id: attempt.sessionId,
      student_id: attempt.studentId,
      question_index: attempt.questionIndex,
      language: attempt.language,
      compiler_id: compilerForLanguage(attempt.language),
      code: attempt.code,
      stdin: attempt.input,
      stdout: attempt.result.output,
      stderr: attempt.result.error,
      exit_code: attempt.result.exitCode,
      status: attempt.result.status,
      signal: attempt.result.signal,
      truncated: attempt.result.truncated,
      time_seconds: decimalOrNull(attempt.result.time),
      total_seconds: decimalOrNull(attempt.result.total),
      memory_kb: decimalOrNull(attempt.result.memory),
      provider: attempt.result.provider,
    })
    .select(CODING_ATTEMPT_COLUMNS)
    .single()
}

export async function listCodingAttempts(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
) {
  return client
    .from('interview_coding_attempts')
    .select(CODING_ATTEMPT_COLUMNS)
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
}
