# Staging Security Verification Runbook

Scope:

- `20260111000000_sensitive_write_hardening.sql`
- `20260112000000_problem_submission_idempotency.sql`
- The backend service-role write paths for `job_applications`,
  `interview_sessions`, `interview_turns`, `interview_turn_evaluations`,
  `problem_sessions`, `problem_questions`, `problem_submissions` and
  `problem_topic_progress`.

Run this only against a dedicated staging Supabase project. Do not run it
against production or a shared staging project containing real user data.

Never place the service-role key, database password, user password, access
token, or a connection string containing a password in the repository, shell
history, documentation, screenshots, or logs.

## 1. Preconditions, backup, and deployment window

- Dedicated staging project with a project ref recorded out of band.
- Disposable student accounts A and B and a disposable placement officer.
- A disposable internal staging job with an application flow.
- Backend dependencies installed (`npm run install:backend`).
- Supabase CLI available through `npx`; verify with
  `npx supabase --version`.
- A staging service-role key stored only in the backend process environment or
  an uncommitted `backend/.env`.
- A current database backup/snapshot before any migration. Record the backup
  timestamp and restore point out of band. A schema/data dump is also useful;
  store it in an untracked temporary location and delete it after verification.
  Dumps can contain staging user data, so do not commit or attach them.

Plan a coordinated deployment window:

1. Configure the new backend code and service-role key.
2. Apply the database migrations.
3. Run the verification in this runbook.

The new backend cannot record Problem Solving submissions until
`20260112000000_problem_submission_idempotency.sql` exists. The old backend
must not keep performing direct writes after
`20260111000000_sensitive_write_hardening.sql` is applied. Expect a short
window where privileged writes fail rather than silently bypassing the new
controls.

## 2. Preflight checks before changing the database

Confirm the linked project is staging and inspect the pending migration list:

```powershell
npx supabase login
npx supabase link --project-ref <STAGING_PROJECT_REF>
npx supabase migration list
npx supabase db push --dry-run
```

Stop if the project ref is not the dedicated staging project, if unrelated
migrations are pending, or if the dry run would reset or destructively alter
anything.

Run these read-only checks in the staging SQL editor as
`postgres`/`supabase_admin`:

```sql
select to_regclass('public.problem_submissions') as submissions_table,
       to_regclass('public.problem_sessions') as sessions_table,
       to_regclass('public.problem_questions') as questions_table,
       to_regclass('public.problem_topic_progress') as progress_table;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'problem_submissions'
order by ordinal_position;

select count(*) as submission_rows
from public.problem_submissions;

select gen_random_uuid() as uuid_supported;

select rolname
from pg_roles
where rolname in ('anon', 'authenticated', 'service_role')
order by rolname;
```

Expected: all four tables exist, `uuid_supported` returns a UUID, and all three
roles exist. If any table is missing, stop and apply/resolve the earlier
Problem Solving migration first.

If a partial attempt already added `client_submission_id`, also check for nulls
and duplicate keys before retrying:

```sql
select count(*) filter (where client_submission_id is null) as null_keys,
       count(*) as total_rows
from public.problem_submissions;

select student_id, question_id, client_submission_id, count(*) as duplicates
from public.problem_submissions
where client_submission_id is not null
group by student_id, question_id, client_submission_id
having count(*) > 1;
```

The duplicate query must return no rows. Resolve any partial state before
retrying the migration; do not drop or rewrite production-like data without
explicit approval.

## 3. Apply the migrations

The migrations are additive to schema history and must run in filename order.
Obtain explicit approval from the staging owner before applying.

```powershell
npx supabase db push
```

Do not use `--include-all`, `db reset`, or any destructive command. If the
project was previously migrated outside the CLI, reconcile migration history
before pushing instead of resetting the database.

If CLI history is not authoritative, apply the SQL files manually in this order
and record both applications:

1. `20260111000000_sensitive_write_hardening.sql`
2. `20260112000000_problem_submission_idempotency.sql`

Do not apply only the second file after a partial first attempt.

## 4. Verify effective grants, policies, schema, and RPC privileges

Run `supabase/verification/sensitive_write_privileges.sql` in the staging SQL
editor as `postgres`/`supabase_admin`. It is read-only and runs inside a
read-only transaction.

Required results:

- Every row in the table-privilege matrix is `OK`.
- `anon`: no `SELECT`, `INSERT`, `UPDATE`, or `DELETE`.
- `authenticated`: `SELECT` only.
- `service_role`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- The column-privilege query returns no rows.
- `rls_enabled` is `true` for all eight tables.
- The policy list contains `SELECT` policies only, and
  `non_select_policy_count` is `0`.
- `has_table_privilege` is used so inherited/`PUBLIC` privileges are included.
- `record_problem_submission` execute privilege is `false` for `anon` and
  `authenticated`, and `true` for `service_role`.
- The function row reports `security_definer = false`,
  `public_can_execute = false`, includes `search_path=public, pg_temp` in
  `configuration`, and returns `jsonb`.
- `client_submission_id` is `NOT NULL`, all idempotency columns exist, and
  `problem_submissions_client_key_uidx` is a unique index on
  `(student_id, question_id, client_submission_id)`.

If any matrix row is `FAIL`, any column write privilege is returned, the
function is `SECURITY DEFINER`, `PUBLIC` can execute it, or a write policy
exists, stop. Correct the ACL state before workflow testing.

Also attempt the RPC through PostgREST with a browser session. Do not log the
token.

```text
POST https://<STAGING_PROJECT_REF>.supabase.co/rest/v1/rpc/record_problem_submission
apikey: <staging publishable key>
Authorization: Bearer <student A access token>
Content-Type: application/json
```

Expected: `401`, `403`, or permission denied. A `200` response is a failure.

## 5. Run the gated direct-write integration test

Use the staging URL, public publishable key, and disposable student A:

```powershell
$env:SUPABASE_TEST_URL = 'https://<STAGING_PROJECT_REF>.supabase.co'
$env:SUPABASE_TEST_ANON_KEY = '<staging publishable key>'
$env:SUPABASE_TEST_STUDENT_EMAIL = '<disposable-student-a-email>'
$secureStudentPassword = Read-Host 'Student A password' -AsSecureString
$env:SUPABASE_TEST_STUDENT_PASSWORD = [System.Net.NetworkCredential]::new('', $secureStudentPassword).Password
Remove-Variable secureStudentPassword
npm test --prefix backend
```

The integration test signs in with student A and attempts direct `INSERT`,
`UPDATE`, and `DELETE` on all eight tables. Every operation must fail with
SQLSTATE `42501` (permission denied). The test remains skipped when any of the
four `SUPABASE_TEST_*` variables is absent.

## 6. Verify legitimate backend workflows

Use the backend API against staging with disposable accounts. Record the actual
HTTP status and response code for every step.

### Applications

1. Student A completes a profile and applies to an internal staging job.
2. Officer lists the application and moves it from `Applied` to
   `Under Review`, then `Shortlisted`.
3. Student A applies to a second job and withdraws that application.
4. Repeat the same application POST; expect `409 already_applied`, not a
   duplicate row.
5. Attempt a stale officer transition after another officer already changed the
   status; expect `409 application_changed`.

### Interviews

1. Student A starts an interview with a `client_session_id`.
2. Repeat the same create request; expect the same session, not a duplicate.
3. Save a turn twice at the same index; expect one row.
4. Evaluate the stored answer and, if Groq is configured, request the adaptive
   next question.
5. Re-evaluate or regenerate; expect an upsert, not duplicate turns or
   evaluations.

### Problem Solving and idempotency

1. Open the workspace; expect one active session per student.
2. With a second concurrent open request, confirm the unique active-session
   index prevents parallel sessions.
3. Reveal a hint, run visible tests, and submit.
4. Confirm the submission stores the server-computed verdict, not a
   request-body verdict. Confirm hidden-test inputs, hidden expected values and
   hidden outputs are absent from the response and stored result details.
5. Confirm progress, session difficulty and counts reflect the real result.
6. Repeat the exact submit request with the same `idempotencyKey`; expect the
   same submission id and the same result. Submission count, attempts, answered
   count and accepted count must not change.
7. Submit the same code with a new `idempotencyKey`; expect a second distinct
   submission row and exactly one additional attempt.
8. Reuse the same key with different code or language; expect
   `409 idempotency_conflict` and no new row or counter change.
9. Submit the same key concurrently from two requests. The unique index and
   session-lock RPC must produce one row and one counter increment. Both
   responses should identify that row.
10. Reuse the same key from student B on student B's own question; it must
    create a separate submission because ownership is part of the unique key.
11. Confirm student B cannot retrieve student A's submission by presenting A's
    question or submission id.
12. Simulate a lost response: send a submit request with a very short client
    timeout so the client does not receive the response, then retry the exact
    same body and key. Confirm the retry returns the original result and does
    not increment any counter again.
13. If Piston or `PROBLEM_TEST_SECRET` is unavailable, record the controlled
    `401`/`503`; do not mark the workflow verified.

### Atomic rollback

On dedicated staging only, optionally inject a temporary failure after the
submission insert to verify that submission, progress and session changes roll
back together. For example, add a temporary `BEFORE UPDATE` trigger on
`problem_sessions` that raises an exception for the disposable session, invoke
the RPC with a new key, confirm no submission or progress row was created and
the session counters did not change, then remove the trigger. Use a named
temporary function and drop both immediately. Never do this on a shared
staging project.

## 7. Verify forgery and cross-user isolation

Use student A and student B. Capture ids through the backend, then attempt the
following with B's token and B's Supabase session.

| Attack | Expected result |
| --- | --- |
| Direct PostgREST PATCH of A's `job_applications.status` | `42501` permission denied |
| Direct PostgREST PATCH/INSERT of A's interview score/evaluation | `42501` |
| Direct PostgREST INSERT of a problem submission/verdict/progress row | `42501` |
| Direct PostgREST execute of `record_problem_submission` | `401`/`403`/`42501` |
| Backend GET of A's interview session as B | `404` or empty, never A's data |
| Backend GET of A's application as B | `404`/empty |
| Backend Problem Solving request using A's session/question id as B | `404` |
| Backend status update for A's application by a different-college officer | `404`, not a mutation |
| Forged `student_id`, `session_id`, `status`, score, verdict, adaptive fields or hidden-test fields in a backend body | ignored or `400`; never trusted |

Also verify no unrelated rows changed. Compare these counts before and after
the workflow tests:

```sql
select 'job_applications' as table_name, count(*) from public.job_applications
union all
select 'interview_sessions', count(*) from public.interview_sessions
union all
select 'interview_turns', count(*) from public.interview_turns
union all
select 'interview_turn_evaluations', count(*) from public.interview_turn_evaluations
union all
select 'problem_sessions', count(*) from public.problem_sessions
union all
select 'problem_questions', count(*) from public.problem_questions
union all
select 'problem_submissions', count(*) from public.problem_submissions
union all
select 'problem_topic_progress', count(*) from public.problem_topic_progress;
```

Expected changes are only rows owned by the disposable test accounts.

## 8. Verify fail-closed behavior

Stop the backend. Start it with the privileged key explicitly empty so an
uncommitted `backend/.env` value is not used:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = ''
$env:SUPABASE_SECRET_KEY = ''
npm run dev:backend
```

With student A's token:

- `POST /api/jobs/:id/applications` -> `503 write_unavailable`.
- `POST /api/interviews` -> `503 write_unavailable`.
- `POST /api/problem-solving/sessions` -> `503 write_unavailable`.
- `POST /api/problem-solving/questions/:id/submit` -> `503 write_unavailable`,
  including a replay, because the handler requires the privileged writer.
- Reads that do not need a write still return their normal response.
- Confirm the table counts did not change.

Restore the staging key only for the running staging session; do not persist it
in shell profiles.

## 9. Rollback strategy and limitations

Prefer a forward fix if the new backend and migrations are partially deployed.
For a full staging rollback:

1. Stop test traffic and the staging backend.
2. Restore the verified pre-migration database snapshot.
3. Deploy the backend revision that matches the restored schema.
4. Reconcile the CLI migration history with the restored database state. Do not
   use `db reset`.
5. Re-run the preflight checks before any retry.

Important limitations:

- Restoring a snapshot loses all staging data created after the backup.
- The idempotency migration makes `client_submission_id` `NOT NULL`. An older
  backend that inserts submissions without a key will fail after this
  migration. A code rollback therefore requires either a matching snapshot
  restore or a purpose-built forward fix.
- Dropping the idempotency columns would discard stored result/adaptive data and
  is not a safe rollback for production.
- Rolling back `20260111000000_sensitive_write_hardening.sql` by restoring
  browser write grants or policies would reintroduce the vulnerability. Do not
  do that as a convenience rollback. Use a snapshot restore in dedicated
  staging or a reviewed forward fix.
- Treat the migrations as forward-only in production; plan rollback as a
  maintenance operation with a tested snapshot.

## 10. Cleanup and evidence

- Delete disposable test users through the account-deletion endpoint or the
  staging dashboard.
- Remove test jobs and their cascaded applications.
- Drop any temporary rollback-test triggers/functions.
- Clear `SUPABASE_TEST_*` variables and the service-role variable from the
  session.
- Delete untracked database dumps after verification.
- Do not delete data owned by anyone other than the disposable staging users.

Record, without secrets:

- Staging project ref, backup timestamp, and both migration versions applied.
- Output of the effective-privilege SQL matrix, function metadata check,
  column-privilege query, policy count, schema columns, and index definition.
- Integration test command and summary counts; never log tokens or keys.
- HTTP status/code for each legitimate and forged operation.
- Concurrent-submission results, retry results, and before/after counts.
- Any workflow blocked by missing Groq, Piston, `PROBLEM_TEST_SECRET`, or UI
  configuration.
