import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_TEST_URL
const anonKey = process.env.SUPABASE_TEST_ANON_KEY
const email = process.env.SUPABASE_TEST_STUDENT_EMAIL
const password = process.env.SUPABASE_TEST_STUDENT_PASSWORD
const configured = Boolean(url && anonKey && email && password)

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

const missingId = '00000000-0000-4000-8000-000000000000'

test(
  'an authenticated browser session cannot write server-authoritative tables',
  { skip: configured ? false : 'Set SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_STUDENT_EMAIL and SUPABASE_TEST_STUDENT_PASSWORD to run.' },
  async () => {
    const client = createClient(url as string, anonKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const signIn = await client.auth.signInWithPassword({
      email: email as string,
      password: password as string,
    })
    assert.equal(signIn.error, null)
    assert.ok(signIn.data.user)

    for (const table of tables) {
      const insert = await client.from(table).insert({})
      assert.equal(insert.error?.code, '42501', `${table} insert should be denied`)

      const update = await client.from(table).update({}).eq('id', missingId)
      assert.equal(update.error?.code, '42501', `${table} update should be denied`)

      const remove = await client.from(table).delete().eq('id', missingId)
      assert.equal(remove.error?.code, '42501', `${table} delete should be denied`)
    }
  },
)
