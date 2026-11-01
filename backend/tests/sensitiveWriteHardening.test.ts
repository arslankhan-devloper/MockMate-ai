import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(
    process.cwd(),
    '..',
    'supabase',
    'migrations',
    '20260111000000_sensitive_write_hardening.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n')

const tables = [
  'job_applications',
  'interview_sessions',
  'interview_turns',
  'interview_turn_evaluations',
  'problem_sessions',
  'problem_questions',
  'problem_submissions',
  'problem_topic_progress',
]

test('revokes every client write privilege on server-authoritative tables', () => {
  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table} from public, anon, authenticated;`,
      ),
      table,
    )
    assert.match(
      migration,
      new RegExp(`grant select on table public\\.${table} to authenticated;`),
      table,
    )
    assert.match(
      migration,
      new RegExp(
        `grant select, insert, update, delete on table public\\.${table} to service_role;`,
      ),
      table,
    )
  }
})

test('does not grant insert, update, or delete back to authenticated clients', () => {
  assert.doesNotMatch(
    migration,
    /grant[^;]*(insert|update|delete)[^;]*to (anon|authenticated)/i,
  )
})

test('drops every write policy declared for a hardened table in earlier migrations', () => {
  const directory = resolve(process.cwd(), '..', 'supabase', 'migrations')
  const earlierMigrations = readdirSync(directory)
    .filter((name) => /^\d+_.+\.sql$/.test(name) && name < '20260111')
    .sort()
    .map((name) => readFileSync(resolve(directory, name), 'utf8').replace(/\r\n/g, '\n'))

  const hardened = new Set(tables)
  let checked = 0
  for (const sql of earlierMigrations) {
    const policyPattern =
      /create policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(insert|update|delete)\b/gi
    for (const match of sql.matchAll(policyPattern)) {
      const [, policy, table] = match
      if (!hardened.has(table)) continue
      checked += 1
      assert.match(
        migration,
        new RegExp(`drop policy if exists ${policy}\\s+on public\\.${table};`),
        `${table}.${policy}`,
      )
    }
  }
  assert.ok(checked > 0)
})

test('later migrations do not restore client writes on hardened tables', () => {
  const directory = resolve(process.cwd(), '..', 'supabase', 'migrations')
  const hardened = new Set(tables)
  for (const name of readdirSync(directory).sort()) {
    if (!/^\d+_.+\.sql$/.test(name) || name < '20260112') continue
    const sql = readFileSync(resolve(directory, name), 'utf8')
    assert.doesNotMatch(sql, /create policy[\s\S]*?\bfor\s+(insert|update|delete)\b/i, name)

    const grantPattern =
      /grant[^;]*\b(insert|update|delete)\b[^;]*\bon\s+(?:table\s+)?public\.(\w+)[^;]*\bto\b[^;]*\b(anon|authenticated)\b/gi
    for (const match of sql.matchAll(grantPattern)) {
      assert.ok(!hardened.has(match[2]), `${name} grants ${match[1]} on ${match[2]}`)
    }
  }
})

test('removes client write policies as defence in depth', () => {
  assert.doesNotMatch(migration, /create policy \w+[\s\S]*? for (insert|update|delete)/i)
  for (const policy of [
    'job_applications_insert_student_self',
    'job_applications_update_officer_own_college',
    'job_applications_delete_own_student',
    'interview_sessions_insert_own_student',
    'interview_sessions_update_own_student',
    'interview_sessions_delete_own_student',
    'interview_turns_insert_own_student',
    'interview_turns_update_own_student',
    'interview_turns_delete_own_student',
    'interview_turn_evaluations_insert_own_student',
    'interview_turn_evaluations_update_own_student',
    'interview_turn_evaluations_delete_own_student',
    'problem_sessions_insert_own',
    'problem_sessions_update_own',
    'problem_questions_insert_own',
    'problem_questions_update_own',
    'problem_submissions_insert_own',
    'problem_topic_progress_insert_own',
    'problem_topic_progress_update_own',
  ]) {
    assert.match(migration, new RegExp(`drop policy if exists ${policy} `), policy)
  }
})
