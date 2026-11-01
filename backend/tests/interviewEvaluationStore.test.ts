import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BASE_EVALUATION_COLUMNS,
  EVALUATION_COLUMNS,
  upsertEvaluation,
} from '../src/services/interviews.service.js'

interface UpsertCall {
  patch: Record<string, unknown>
}

interface SelectCall {
  columns: string
}

function evaluationClient(
  responses: Array<{ data?: unknown; error?: { code: string; message: string } | null }>,
) {
  const upserts: UpsertCall[] = []
  const selects: SelectCall[] = []
  let attempt = 0

  const chain = {
    upsert(patch: Record<string, unknown>) {
      upserts.push({ patch })
      return chain
    },
    select(columns: string) {
      selects.push({ columns })
      return chain
    },
    async single() {
      const response = responses[Math.min(attempt, responses.length - 1)]
      attempt += 1
      return { data: response.data ?? null, error: response.error ?? null }
    },
  }

  const client = {
    from() {
      return chain
    },
  }

  return { client: client as unknown as SupabaseClient, upserts, selects }
}

function evaluationPatch(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'session-1',
    question_index: 2,
    status: 'evaluated',
    score: 84,
    summary: 'Good answer',
    strengths: ['clear'],
    improvements: ['detail'],
    suggested_answer: 'Better answer',
    criteria: [],
    model: 'test-model',
    answer_hash: 'hash-1',
    correctness_verdict: 'mostly_correct',
    correctness_score: 80,
    key_concepts_covered: ['concept'],
    key_concepts_missing: [],
    factual_errors: [],
    expected_answer: 'Expected',
    improvement_advice: 'Add detail',
    confidence: 0.8,
    evaluated_at: '2026-01-10T10:30:00.000Z',
    ...overrides,
  }
}

test('upsertEvaluation writes the full evaluation when all columns exist', async () => {
  const row = { id: 'evaluation-1', ...evaluationPatch() }
  const { client, upserts, selects } = evaluationClient([{ data: row, error: null }])

  const result = await upsertEvaluation(client, evaluationPatch())

  assert.equal(result.error, null)
  assert.equal(result.data, row)
  assert.equal(upserts.length, 1)
  assert.equal(upserts[0].patch.correctness_verdict, 'mostly_correct')
  assert.equal(selects[0].columns, EVALUATION_COLUMNS)
})

test('upsertEvaluation falls back to base columns when the adaptive migration is missing', async () => {
  const row = {
    id: 'evaluation-1',
    session_id: 'session-1',
    question_index: 2,
    status: 'evaluated',
    score: 84,
  }
  const { client, upserts, selects } = evaluationClient([
    {
      error: {
        code: '42703',
        message: 'column interview_turn_evaluations.correctness_verdict does not exist',
      },
    },
    { data: row, error: null },
  ])

  const result = await upsertEvaluation(client, evaluationPatch())

  assert.equal(result.error, null)
  assert.equal(result.data, row)
  assert.equal(upserts.length, 2)
  assert.equal(upserts[1].patch.score, 84)
  assert.equal(upserts[1].patch.answer_hash, 'hash-1')
  assert.equal(upserts[1].patch.correctness_verdict, undefined)
  assert.equal(upserts[1].patch.expected_answer, undefined)
  assert.equal(selects[1].columns, BASE_EVALUATION_COLUMNS)
})

test('upsertEvaluation does not retry when the evaluation table itself is missing', async () => {
  const { client, upserts } = evaluationClient([
    {
      error: {
        code: '42P01',
        message: 'relation "public.interview_turn_evaluations" does not exist',
      },
    },
  ])

  const result = await upsertEvaluation(client, evaluationPatch())

  assert.equal(result.error?.code, '42P01')
  assert.equal(upserts.length, 1)
})
