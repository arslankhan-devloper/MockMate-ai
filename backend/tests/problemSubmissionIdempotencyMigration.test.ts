import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(
    process.cwd(),
    '..',
    'supabase',
    'migrations',
    '20260112000000_problem_submission_idempotency.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n')

test('adds a database-enforced idempotency key unique per student and question', () => {
  assert.match(migration, /add column if not exists client_submission_id uuid/i)
  assert.match(migration, /alter column client_submission_id set not null/i)
  assert.match(
    migration,
    /create unique index if not exists problem_submissions_client_key_uidx\s+on public\.problem_submissions \(student_id, question_id, client_submission_id\);/i,
  )
})

test('records submission, progress and session updates in one service-role RPC', () => {
  const functionStart = migration.indexOf('create or replace function public.record_problem_submission')
  const functionEnd = migration.indexOf('$function$;', functionStart)
  assert.ok(functionStart >= 0)
  assert.ok(functionEnd > functionStart)
  const body = migration.slice(functionStart, functionEnd)

  assert.match(body, /security invoker/i)
  assert.doesNotMatch(body, /security definer/i)
  assert.match(body, /set search_path = public, pg_temp/i)
  assert.match(body, /for update of s;/i)
  assert.match(body, /insert into public\.problem_submissions/i)
  assert.match(body, /on conflict \(student_id, question_id, client_submission_id\) do nothing/i)
  assert.match(body, /insert into public\.problem_topic_progress/i)
  assert.match(body, /update public\.problem_sessions/i)
  assert.match(body, /language is distinct from p_language/i)
  assert.match(body, /code is distinct from p_code/i)
  assert.match(body, /raise exception 'idempotency_conflict'/i)
  assert.ok(body.indexOf('insert into public.problem_submissions') < body.indexOf('insert into public.problem_topic_progress'))
  assert.ok(body.indexOf('insert into public.problem_topic_progress') < body.indexOf('update public.problem_sessions'))
})

test('only the service role may execute the submission RPC', () => {
  assert.match(
    migration,
    /revoke all on function public\.record_problem_submission\([\s\S]*?\) from public, anon, authenticated;/i,
  )
  assert.match(
    migration,
    /grant execute on function public\.record_problem_submission\([\s\S]*?\) to service_role;/i,
  )
})

test('stores the idempotent response components needed to replay a submission', () => {
  for (const column of [
    'result_details',
    'all_passed',
    'adaptive_difficulty',
    'adaptive_focus',
    'adaptive_reason',
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`, 'i'))
  }
})
