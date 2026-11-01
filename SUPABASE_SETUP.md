# MockMate — Supabase Integration Setup

This guide covers the Supabase integration for the MockMate frontend: a reusable
client, the database schema and initial Row Level Security (RLS) policies, and
**real Supabase Authentication** (sign-up, sign-in, sign-out, session
restoration, and administrator-provisioned officer accounts).

> **Important:** The SQL in this repository is **schema preparation only**. It is
> **not** applied to any hosted project by these changes. You must run it
> yourself (step 4). Until you do, the auth pages show a clear "not configured"
> notice and no login is simulated.
>
> The authentication code requires the migration (it relies on the
> `profiles` table, the signup trigger, and the RLS policies).

---

## 1. Create a Supabase project

1. Sign in at <https://supabase.com> and create a new project.
2. Choose a region close to your users and set a strong **database password**
   (keep it private — it is not needed by the frontend).
3. Wait for the project to finish provisioning.

## 2. Find the Project URL and public client key

In the Supabase Dashboard go to **Project Settings → API**:

- **Project URL** → copy the `https://<project-ref>.supabase.co` value.
- **Public client key** → copy either:
  - the **publishable key** (newer projects), or
  - the **anon public** key (older projects).

These are safe to ship in the browser. **Never** copy the `service_role` /
secret key into the frontend — it bypasses all RLS.

## 3. Configure the frontend locally

From the repository root:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
```

Then edit `frontend/.env.local` and fill in:

```dotenv
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>          # or leave blank…
VITE_SUPABASE_PUBLISHABLE_KEY=<your publish key> # …and fill this instead
```

- Provide **either** `VITE_SUPABASE_ANON_KEY` **or**
  `VITE_SUPABASE_PUBLISHABLE_KEY` (the client prefers the publishable key).
- `.env.local` is git-ignored and must never be committed. `.env` and other
  `.env.*` files are ignored as well; only `.env.example` is tracked.
- If these variables are missing, the app still starts. In development you will
  see a `[MockMate] Supabase is not configured yet…` console warning, and
  `isSupabaseConfigured` is `false`.

## 4. Apply the SQL migrations

The migrations live in `supabase/migrations/` and must be applied in filename
order. The full feature set requires:

```
20260101000000_init_mockmate_schema.sql
20260102000000_guard_profile_managed_columns.sql
20260103000000_interview_session_persistence.sql
20260104000000_interview_turn_evaluations.sql
20260105000000_roadmap_topic_progress.sql
20260106000000_roadmap_ai_plans.sql
20260107000000_roadmap_topic_resources.sql
20260108000000_interview_adaptive_questions.sql
20260109000000_problem_solving.sql
20260110000000_account_deletion.sql
20260111000000_sensitive_write_hardening.sql
20260112000000_problem_submission_idempotency.sql
```

If an earlier migration is already applied, apply only the missing files. Do not
assume the cloud project has the roadmap tables: check the Table Editor or run
this query in the SQL Editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'colleges', 'profiles', 'campus_jobs', 'job_applications',
    'interview_sessions', 'roadmap_topic_progress', 'roadmap_ai_plans',
    'roadmap_topic_resources'
  )
order by tablename;
```

Every row should have `rowsecurity = true`. If any roadmap table is missing,
apply the corresponding migration.

The interview evaluation columns added by `20260108000000` must also exist, or
saved evaluations will retain only the base score:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'interview_turn_evaluations'
  and column_name in (
    'correctness_verdict', 'correctness_score', 'key_concepts_covered',
    'key_concepts_missing', 'factual_errors', 'expected_answer',
    'improvement_advice', 'confidence'
  )
order by column_name;
```

Choose **one** of the following.

### Option A — Supabase SQL Editor (quickest, no tools)

1. Open the **SQL Editor** in your project.
2. Paste the entire contents of the migration file.
3. Run it. All statements are written to be run top-to-bottom once.

### Option B — Supabase CLI

```powershell
npm install -g supabase          # or use npx
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                 # applies files in supabase/migrations/
```

After applying, verify in the dashboard under **Table Editor** that these tables
exist: `colleges`, `profiles`, `campus_jobs`, `job_applications`,
`interview_sessions`, `roadmap_topic_progress`, `roadmap_ai_plans`,
`roadmap_topic_resources`, `problem_sessions`, and
`account_deletion_requests`, each with **RLS enabled**.

You can also check the roadmap tables through the REST API using the public
client key. A `PGRST205` / 404 response means the table is missing from the
project schema cache; a 200 response with an empty array means the table exists
and RLS is protecting the rows.

> Re-running the migrations is safe for the tables/triggers/functions
> (`if not exists` / `drop ... if exists` / `create or replace`). Policies are
> recreated unconditionally as part of the schema definition.

## 5. Run the frontend locally

```powershell
# from the repository root
npm install                # installs workspace-level scripts
npm run install:frontend   # installs frontend deps (incl. @supabase/supabase-js)
npm run dev                # starts Vite (http://localhost:8443)
```

Useful checks:

```powershell
npm run typecheck          # tsc --noEmit
npm run build              # production build
```

## 5b. Run the backend locally (Express + TypeScript)

The backend lives in `backend/` and reuses the same Supabase project. It verifies
Supabase access tokens on the server and derives role/college from the database
(never from request bodies). Implemented so far: `GET /api/health`, the
authenticated profile endpoints `GET /api/profile` / `PATCH /api/profile`, and
the student-only roadmap endpoints:

- `GET/PUT /api/roadmap/progress`
- `GET/POST /api/roadmap/resources/:domainId/:topicId`
- `GET/POST /api/roadmap/plan`

AI plan and resource generation both need `GROQ_API_KEY` on the backend. See
[`backend/README.md`](backend/README.md) for the full details, including the
manual database steps (apply the migrations before the profile or roadmap APIs
will work).

```powershell
# from the repository root
npm run install:backend            # install backend deps
Copy-Item backend/.env.example backend/.env   # then fill in SUPABASE_URL + public key
npm run dev:backend                # starts the API (http://localhost:4000)
```

Useful checks:

```powershell
npm run typecheck:backend          # tsc --noEmit
npm run build:backend              # tsc -> backend/dist
```

## 5c. Roadmap setup

The roadmap uses the existing Supabase auth session and requires these additive
migrations:

| Migration | Purpose |
| --- | --- |
| `20260105000000_roadmap_topic_progress.sql` | Stores completed catalog topics per student. |
| `20260106000000_roadmap_ai_plans.sql` | Stores the latest AI-generated plan as JSONB. |
| `20260107000000_roadmap_topic_resources.sql` | Stores four AI resource slots per student and curated topic. |

All three tables are student-owned and protected by RLS. Without the first table,
progress reads fail. Without the AI-plan table, the API still returns generated
plans but reports `storageAvailable: false` / `persisted: false`, so the plan is
lost on refresh. Without the resources table, generated suggestions are still
returned for the current visit but report `storageAvailable: false` /
`persisted: false`.

The resource table has one row per `(student_id, domain_id, topic_id,
resource_type)`, where type is `video`, `roadmap`, `docs` or `practice`. The
server upserts those four slots, so repeated generation replaces them instead of
creating duplicates. The AI provider chooses a provider key and search query;
the server builds every URL from a fixed HTTPS allowlist and never accepts a
model-supplied link.

The API always derives the student from the verified token; `student_id` is
never accepted from the browser. The curated catalog and the task-to-topic
mapping live in `frontend/src/data/roadmap/`, so applying these migrations does
not require seeding catalog content.

After applying them, verify:

- `roadmap_topic_progress`, `roadmap_ai_plans` and `roadmap_topic_resources`
  exist with RLS enabled.
- A student can save a plan and reload it.
- A student can generate resources for a curated topic, refresh, and see the
  same four resource types without duplicate rows.
- A placement officer receives `403` from `/api/roadmap/*`.
- Regenerating a plan does not remove old completion rows or resources.

## 5d. Problem Solving setup (standalone module)

Problem Solving is an independent coding-practice module. It uses its own API
namespace (`/api/problem-solving`) and its own tables, and does not create,
modify or read interview sessions, interview reports or interview analytics.
Applying this migration does not alter any existing interview table.

Apply the additive migration:

| Migration | Purpose |
| --- | --- |
| `20260109000000_problem_solving.sql` | Stores active sessions, AI questions (including encrypted hidden tests), submissions and per-topic adaptive progress. |

The four tables are student-owned and protected by RLS; placement officers have
no access. Hidden test inputs/expected outputs and the private reference
approach are encrypted with the backend-only `PROBLEM_TEST_SECRET`
(AES-256-GCM). The API never returns hidden tests or the approach before
grading, and a direct PostgREST read only exposes ciphertext.

The four tables are read-only to browser sessions after
`20260111000000_sensitive_write_hardening.sql`. All session, question,
submission, hint and progress writes are performed by the backend with the
service-role client after it verifies the caller owns the session/question. The
RLS select policies still scope reads to the student.

Problem Solving also requires a Piston-compatible code-execution sandbox. User
code is never executed inside the Express process. Configure `CODE_EXECUTION_URL`
in `backend/.env`; the default is the public `https://emkc.org/api/v2/piston`.
The public endpoint may require `CODE_EXECUTION_API_KEY`; a missing key currently
causes execution requests to fail with `401`. For production, point this at a
self-hosted Piston instance and set a dedicated `PROBLEM_TEST_SECRET` (see
`backend/.env.example`).

After applying the migration, verify:

- `problem_sessions`, `problem_questions`, `problem_submissions` and
  `problem_topic_progress` exist with RLS enabled.
- `authenticated` has only `select` on the four problem tables; `anon` has no
  table privileges. `service_role` has the required write grants, but that key
  is backend-only and must never reach a browser bundle.
- A direct PostgREST insert, update or delete returns `42501` (permission
  denied) for every table covered by the hardening migration.
- `POST /api/problem-solving/sessions` returns one generated problem and calling
  it again restores the same active session.
- Running visible tests and submitting return real sandbox results; hidden test
  inputs and the reference approach are never present in responses before grading.
- Repeated calls do not create a second active session.
- A placement officer receives `403` from `/api/problem-solving/*`.
- If the sandbox URL cannot be reached, the API reports an explicit unavailable
  error instead of showing a fabricated verdict.

## 5e. Account deletion setup

Settings → Data and privacy → Delete account calls the authenticated backend
endpoint `DELETE /api/account`. The backend re-verifies the current password and
deletes owned rows before deleting the Supabase Auth user. The frontend never
receives a privileged key and cannot choose which user id to delete.

Apply the additive migration:

| Migration | Purpose |
| --- | --- |
| `20260110000000_account_deletion.sql` | Service-role-only deletion status/audit table with 30-day retention metadata. |

Then add a backend-only privileged key to `backend/.env` (never a `VITE_*`
variable):

```powershell
SUPABASE_SERVICE_ROLE_KEY=<service_role or secret key>
```

`SUPABASE_SECRET_KEY` is also accepted. Without either key the endpoint returns
`503 account_deletion_unavailable`; it never reports a deletion that did not
happen. The same backend-only key is required for writes to the
server-authoritative application, interview and problem-solving tables. Missing
it makes those writes return `503 write_unavailable` rather than falling back to
browser privileges.

Deletion behavior:

- Deletes job applications, interview sessions/turns/evaluations/reports,
  roadmap progress/plans/resources, problem sessions/questions/submissions/
  progress, and finally the Auth user (which cascades the profile).
- Preserves institution-owned `colleges` and `campus_jobs`. A placement
  officer's job postings remain in the college's records, but `posted_by` is
  cleared by the foreign key.
- Resume files are processed in memory and are not stored in a Supabase Storage
  bucket. Resume analysis and problem drafts are removed from browser storage
  for the deleted user only.
- Provider backups, authentication logs and operational logs can retain copies
  until their own retention windows expire. The pseudonymous deletion/audit row
  has a 30-day `retain_until` target, but no automatic purge is scheduled by the
  migration. Run this periodically with the service role (or add a scheduled
  job) or the row will remain:
  `delete from public.account_deletion_requests where retain_until < now();`.
  The app cannot promise immediate erasure from provider backups.
- The endpoint is authenticated, requires the exact confirmation text, is
  rate-limited per user, and ignores any user id in the request body.
- A failed deletion is marked in the status table and can be retried. The Auth
  user is deleted last, so a partial failure does not leave an orphaned login
  that still owns data. If the final audit update fails after a successful Auth
  deletion, the API reports `trackingComplete: false` rather than a false
  failure.

After applying the migration and key, verify with a disposable test account:
wrong password returns `403` and deletes nothing; the exact phrase is required;
the session is invalid after success; owned data and the profile are gone; and
college job postings remain. Do not run this test against production data.

### Sensitive write hardening

Apply `20260111000000_sensitive_write_hardening.sql` after the account-deletion
migration. It revokes every browser `insert`/`update`/`delete` privilege on
`job_applications`, `interview_sessions`, `interview_turns`,
`interview_turn_evaluations`, `problem_sessions`, `problem_questions`,
`problem_submissions` and `problem_topic_progress`, drops the obsolete write
policies, and grants writes only to `service_role`. Existing owner/officer
`select` policies remain in place.

The backend still uses the caller-scoped client for reads and ownership checks.
Only the final write uses the service-role client, so a forged request body
cannot set application status, interview scores, hidden-test verdicts or
adaptive progress.

For the full safe staging sequence - applying the migration, checking effective
table/column privileges and RLS, running the gated integration test, and testing
legitimate and forged workflows - follow
[`STAGING_SECURITY_VERIFICATION.md`](STAGING_SECURITY_VERIFICATION.md). Do not
paste the service-role key or test passwords into shell history.

The integration test asserts direct inserts, updates and deletes return `42501`
for every hardened table. It is skipped when the `SUPABASE_TEST_*` variables are
absent.

### Idempotent problem submissions

Apply `20260112000000_problem_submission_idempotency.sql` after the hardening
migration. It adds `problem_submissions.client_submission_id` plus stored
response/adaptive fields and a unique index on
`(student_id, question_id, client_submission_id)`.

`POST /api/problem-solving/questions/:id/submit` requires a client-generated
UUID in the JSON body:

```json
{
  "language": "python",
  "code": "def solve(): pass",
  "idempotencyKey": "11111111-1111-4111-8111-111111111111"
}
```

The frontend reuses the key while retrying the same unchanged code and creates a
new key for a new logical attempt. The backend records the submission, topic
progress and session counters inside the service-role-only
`record_problem_submission` RPC, in one database transaction. Repeating a key
returns the stored result without grading again or incrementing counters;
reusing a key with different code or language returns `409 idempotency_conflict`.

## 6. Keep secrets private

- **Never** commit `frontend/.env` or `frontend/.env.local`.
- **Never** put the database password or the `service_role` / secret key in any
  `VITE_*` variable — Vite inlines those into the client bundle.
- Keep administrator actions (see below) to server-side tools that use the
  service-role key; do not perform them from the browser.

---

## What was implemented (and what was not)

### Client module

`frontend/src/lib/supabase.ts` exports:

- `isSupabaseConfigured` — whether URL + public key are present.
- `getSupabaseClient()` / default export — the client, or `null` if unconfigured.
- `requireSupabaseClient()` — the client, throwing if unconfigured.

Supabase Auth is now wired through `frontend/src/lib/auth.tsx` (see
[Authentication](#authentication-implemented-in-this-task)). Jobs, applications,
reports, dashboards and analytics are still in-memory and not migrated.

### Database schema

| Table | Purpose | Links |
| --- | --- | --- |
| `colleges` | Institutions that own In-Campus drives | — |
| `profiles` | One row per Auth user (role + college) | `id → auth.users.id`, `college_id → colleges` |
| `campus_jobs` | Campus placement drives | `college_id → colleges`, `posted_by → profiles` |
| `job_applications` | Student applications to jobs | `job_id → campus_jobs`, `student_id → profiles` |
| `interview_sessions` | Mock-interview / assessment results | `student_id → profiles` |
| `roadmap_topic_progress` | Completed curated roadmap topics | `student_id → profiles` |
| `roadmap_ai_plans` | Latest AI roadmap per student | `student_id → profiles` |
| `roadmap_topic_resources` | Four AI resource types per student/topic | `student_id → profiles` |

Core tables use UUID primary keys; `campus_jobs` uses a `(status)`, `job_type`,
job columns matching the frontend unions; `job_applications` has a
`unique (job_id, student_id)` constraint. `roadmap_topic_progress` uses
`(student_id, domain_id, topic_id)` and `roadmap_topic_resources` uses
`(student_id, domain_id, topic_id, resource_type)` as their ownership keys.

### RLS policies (summary)

- **`colleges`** — `select` for members of the college; officers may read the
  directory. No write policies (provisioning is administrative).
- **`profiles`** — `select` self (and, for an officer, students in the same
  college); `insert` only your own row as `student` with no college; `update`
  only your own row. A trigger freezes `role` and `college_id`.
- **`campus_jobs`** — `select` published Off-Campus jobs (all) or In-Campus jobs
  of your college; officers additionally see their own college's jobs;
  `insert`/`update`/`delete` only by an officer within their own college.
- **`job_applications`** — `select` your own (officers: applications to their
  college's jobs). Browser `insert`/`update`/`delete` are revoked; the backend
  performs apply, withdraw and status changes with the service role after
  authorization.
- **`interview_sessions`**, **`interview_turns`** and
  **`interview_turn_evaluations`** — `select` your own (officers: students in
  their college). Browser writes are revoked; the backend persists sessions,
  answers and evaluations with the service role.
- **Problem Solving tables** — `select` your own; browser writes are revoked.
  The backend owns session creation, generated questions, hints, submissions,
  verdicts and adaptive progress.
- **`roadmap_topic_progress`** — students only: `select`/`insert`/`delete` their
  own completed-topic rows. No update policy is needed because completion is an
  idempotent insert and un-completion is a delete.
- **`roadmap_ai_plans`** — students only: `select`/`insert`/`update` their own
  single saved plan. Regeneration updates that row; there is no delete policy.
- **`roadmap_topic_resources`** — students only: `select`/`insert`/`update` their
  own resource rows. The composite primary key includes the resource type, so
  regeneration upserts four slots instead of adding duplicates.

Role/college checks go through `SECURITY DEFINER` helper functions
(`current_profile_role`, `current_college_id`, `is_placement_officer`,
`college_of`) so policies read membership **without recursive RLS** and without
trusting a client-supplied role or college id.

---

## Authentication (implemented in this task)

### Files

- `frontend/src/lib/auth.tsx` — `AuthProvider` + `useAuth()`. Restores the
  session with `getSession()` and subscribes to `onAuthStateChange`; exposes
  `signIn`, `signUp`, `signOut`, `sendPasswordReset`, `refreshProfile`. The
  role is read from the `profiles` table, never from UI state.
- `frontend/src/pages/Auth.tsx` — the `login` / `signup` / `forgot` forms call
  the real Supabase methods and show loading, validation, error and
  email-confirmation states.
- `frontend/src/pages/OfficerLogin.tsx` — signs in, then verifies the DB role.
  A non-officer account is immediately signed out and told that officer access
  is administrator-granted.
- `frontend/src/App.tsx` — derives `role` from the profile, gates app routes on
  the restored session, and renders loading / profile-error screens.
- `frontend/src/main.tsx` — wraps the app in `<AuthProvider>`.

### How it behaves

- **Session restoration:** on load the client restores the stored session and
  then loads the linked `profiles` row. `autoRefreshToken` keeps it fresh; an
  expired/unrefreshable session emits `SIGNED_OUT`, which clears the profile and
  routes back to Landing.
- **Role source:** `profiles.role`. `student` is the default; only the database
  can grant `placement-officer`.
- **Route guards:** app pages are only reachable when a session exists. Local
  React state is never treated as proof of authentication.
- **Unconfigured build:** if `VITE_SUPABASE_URL` / public key are missing, the
  app still starts, the auth pages show a clear "not configured" notice, and the
  submit buttons are disabled. No login is simulated.

### How new users receive a student profile

On signup, the `public.handle_new_user()` trigger inserts a `profiles` row with
`role = 'student'` and `college_id = null`. The client has a matching fallback
that creates the same minimal row if it is missing. No names, colleges or
officer roles are fabricated.

### How placement officers are approved and assigned (administrator workflow)

There is deliberately **no** self-service officer path.

1. Create the college (admin, service role):

   ```sql
   insert into public.colleges (name, slug)
   values ('Example Institute of Technology', 'example-institute')
   on conflict (slug) do nothing;
   ```

2. Have the officer sign up normally (they start as `student`).

3. Promote and assign the college. Run this with the **service role** (SQL
   Editor or a trusted server job) — never from the browser:

   ```sql
   update public.profiles
   set role = 'placement-officer',
       college_id = (select id from public.colleges where slug = 'example-institute')
   where id = (select id from auth.users where email = 'officer@college.edu');
   ```

4. The officer can now sign in through the Officer Portal. Students cannot
   promote themselves: the RLS insert policy forces `role = 'student'` and a
   null `college_id`, and the `enforce_profile_immutable_fields` trigger rejects
   any `role` / `college_id` change by a non-service-role caller.

### Password recovery status

- "Forgot password" calls `resetPasswordForEmail` and shows a confirmation
  screen. **This is implemented but not yet verified against a live project.**
- Completing recovery — the "choose a new password" screen shown after the user
  clicks the emailed link (via `updateUser`) — is **not implemented** in this
  task.

### Still required (manual / later work)

1. Provision colleges and officers using the admin workflow above.
2. Replace free-text student college entry with a verified enrollment flow
   (students cannot set their own `college_id`).
3. Add and verify the password-recovery completion screen.
4. **No cloud project was created or migrated by this change**, and none of the
   auth flows have been exercised against a live Supabase project.
5. Jobs, applications, interview reports, dashboards and analytics remain
   in-memory (explicitly out of scope for this task).

> **Authentication is not production-ready yet.** Account provisioning, access
> control, password recovery and the RLS policies have been implemented/defined
> here, but they have not been verified end-to-end against a provisioned
> Supabase project. Do not treat this as production-ready until that
> verification is completed.
