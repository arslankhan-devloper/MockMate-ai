# MockMate — Project Status (audit)

_Audit date: 2026-10-19. This document is based on **repository evidence only**.
Anything requiring a live Supabase project or Git history is marked as needing
manual verification. No application code, database, env files, or packages were
changed during this audit._

Git: **not available** in this environment (no `git` on PATH, no `.git`
directory). Commit history could **not** be inspected.

---

## Problem submission idempotency update (2026-10-23)

Problem Solving submissions now require a client-generated UUID
(`idempotencyKey`). The database unique key
`(student_id, question_id, client_submission_id)` and the service-role-only
`record_problem_submission` RPC make the submission, topic-progress and
session-counter writes one transaction. Retries return the stored result;
reusing a key with different code returns `409 idempotency_conflict`; different
keys remain distinct submissions.

Local verification after this change:

- Backend typecheck/build: pass.
- Backend tests: **154 pass, 1 skipped** (the skipped test needs live
  `SUPABASE_TEST_*` credentials).
- Frontend tests: **74 pass**; frontend typecheck/build pass and the production
  bundle was rebuilt.
- Added migration `20260112000000_problem_submission_idempotency.sql` and
  migration contract tests, including assertions that later migrations do not
  restore client writes on hardened tables. **It is not applied to staging or
  production.**
- The browser idempotency key uses `crypto.randomUUID()` with a secure
  `crypto.getRandomValues()` fallback and is reused only for an identical
  pending question/language/code.
- Live unique-index, RPC-grant, transaction, concurrency and Piston behavior
  remain unverified because no staging credentials/tools or working sandbox are
  available.

---

## Roadmap update (2026-10-21)

The roadmap feature is now implemented in the working tree:

- Responsive two-column **Roadmap + Study Materials** UI, preserving the six
  curated domains and catalogue.
- AI plans are generated server-side with Groq and stored per student when the
  AI-plan migration is present; a generated plan is still usable without storage
  but is lost on refresh.
- AI task titles are matched deterministically to the 25 curated topics. Matched
  tasks show curated notes, a worked example, practice questions and safe
  external links. Unmatched tasks show their external resources and an explicit
  fallback message.
- Every curated topic supports AI-generated **video, roadmap, docs and practice**
  resources. Resources are persisted per student in
  `roadmap_topic_resources`, one row per type. The model never supplies a URL;
  the server builds and revalidates every link against a fixed HTTPS provider
  allowlist. Repeat generation upserts the same four slots, so it cannot create
  duplicate rows. The study panel covers loading, empty, storage-unavailable,
  API-failure and invalid/unverified-link states.
- Progress remains in `roadmap_topic_progress` through the existing API and
  optimistic hook. Matched tasks use the curated topic ID as their progress key,
  so completion survives plan regeneration. Unmatched/old completion rows are
  never deleted silently; the UI reports how many saved completions do not match
  the current checklist.
- Backend and frontend tests cover roadmap validation, normalisation, catalog
  mapping, task selection, progress retention/stale reporting, generation
  failure handling, four-type resource generation, duplicate prevention and
  unsafe/unverified resource URLs.
- `backend/dist` was rebuilt with `npm run build:backend`.

Verified at this update:

- Frontend typecheck: pass. Backend typecheck: pass.
- Backend tests: 29 pass. Frontend roadmap tests: 21 pass.
- Supabase REST checks with the public client key returned `HTTP 404 /
  PGRST205` for `roadmap_topic_progress`, `roadmap_ai_plans` and
  `roadmap_topic_resources`, so **the roadmap migrations are not applied to the
  configured cloud project**. Apply:
  `20260105000000_roadmap_topic_progress.sql`,
  `20260106000000_roadmap_ai_plans.sql` and
  `20260107000000_roadmap_topic_resources.sql` before using progress, persistent
  AI plans or persistent topic resources. No live end-to-end or Groq call was
  performed.

---

## 1. Audit summary (known recent work)

| # | Work item | Status | Evidence (repo) |
| - | --- | --- | --- |
| 1 | Express + TypeScript scaffold and health endpoint | **VERIFIED COMPLETE** | `backend/{package.json,tsconfig.json}`, `src/app.ts`, `src/server.ts`, `src/controllers/health.controller.ts`, `src/routes/health.routes.ts`, `src/routes/index.ts`; `/api/health` returns `{status:"ok",...}` |
| 2 | Supabase authentication middleware | **VERIFIED COMPLETE (code)** / **CANNOT VERIFY (live token)** | `backend/src/middleware/auth.ts` (`requireAuth` verifies via `supabase.auth.getUser(token)`, then loads `role`/`college_id` through a token-scoped client; `requireRole`, `requireCollegeMembership`); mounted on the profile router |
| 3 | Student Profile `GET`/`PATCH` API + frontend integration | **VERIFIED COMPLETE (code)** / **CANNOT VERIFY (end-to-end)** | backend `controllers/profile.controller.ts`, `services/profile.service.ts`, `utils/validation.ts`, `utils/http.ts`, `routes/profile.routes.ts`; frontend `lib/api.ts`, `lib/profile.ts`, `hooks/useMyProfile.ts`, wired in `App.tsx`, used by `pages/ProfileSetup.tsx` and `pages/Profile.tsx` |
| 4 | Migration `supabase/migrations/20260101000000_init_mockmate_schema.sql` | **VERIFIED COMPLETE (file)** / **CANNOT VERIFY (applied to cloud)** | File exists; defines 5 tables, RLS on all, triggers + SECURITY DEFINER helpers, 16 policies |
| 5 | UI cleanup: pricing removal, branding, fake/demo data removal | **PARTIALLY IMPLEMENTED** | No pricing/premium/plan references anywhere; branding is consistently "MockMate" (`frontend/.figma/make/site.json` title, UI copy). Demo-only features intentionally remain and are labelled ("Simulated · Demo Data"); no fake/seeded user records found |
| 6 | Persisted campus **jobs** API + officer CRUD | **VERIFIED COMPLETE (code)** / **CANNOT VERIFY (live)** | `backend/src/{routes,controllers,services}/jobs.*`, `utils/jobValidation.ts`; mounted at `/api/jobs`; server sets `college_id`/`posted_by` from the token, validates publish completeness and status transitions |
| 7 | Persisted **job applications** API + student/officer flows | **VERIFIED COMPLETE (code)** / **CANNOT VERIFY (live)** | `backend/src/{routes,controllers}/applications.*` + `services/jobs.service.ts`; `/api/applications`, `/api/applications/me`; server-side deadline/college/branch/duplicate checks |
| 8 | Frontend wiring to persisted jobs/applications | **VERIFIED COMPLETE (code)** / **CANNOT VERIFY (live)** | `frontend/src/lib/jobs.ts`, `hooks/useCampusJobs.ts`, updated `App.tsx`, `pages/JobPortal.tsx`, `pages/JobPosting.tsx`, `components/CampusJobForm.tsx`, `pages/PlacementCell.tsx`, `pages/Dashboard.tsx` |

Build/type checks during this audit (safe commands only):

- `npm --prefix backend run typecheck` → **pass**
- `npm --prefix frontend run typecheck` → **pass**

(`vite build` / `tsc build` were not re-run in this audit; they passed on the
previous change. See "Needs manual verification".)

---

## 2. Current project status

- **Stack:** React 19 + Vite 8 + Tailwind 4 frontend (`frontend/`); Express 5 +
  TypeScript backend (`backend/`); Supabase (Postgres + Auth) via a single SQL
  migration (`supabase/`). npm workspaces are **not** used; the root
  `package.json` proxies scripts with `--prefix`.
- **Auth:** Real Supabase auth in `frontend/src/lib/auth.tsx` (role read from
  `profiles`, never from UI). Backend verifies access tokens server-side.
- **Persistence:** Profiles, campus jobs and job applications are persisted
  (backend → Supabase). Interviews, analytics, reports and most settings remain
  in-memory demo surfaces and are labelled as such or show honest empty states.
- **Jobs/applications now use the UUID `college_id`** from `profiles` (not the
  old free-text college name). The secure model: the server derives college,
  poster and role from the verified token, and RLS is the final authority.
- **Cloud state:** A live project **cannot** be verified from here. The
  migration may or may not be applied. `frontend/.env` exists locally;
  `backend/.env` does **not**. No env values were read or printed.

---

## 3. Feature status

### Completed (verified in repo)
- Express + TS backend, health endpoint, error handler, 404 handler, CORS, JSON body limit.
- `requireAuth` / `requireRole` / `requireCollegeMembership` middleware.
- Profile API: `GET /api/profile`, `PATCH /api/profile` with per-role field
  allowlist, validation, consistent error shape
  (`{ error, code, fields? }`), 401/403/404/400/500/503 handling.
- RLS-scoped profile reads/writes via the caller's token. The service-role key is
  reserved for account deletion and authorized writes to server-authoritative tables.
- SQL migration with tables, indexes, `updated_at` triggers, signup
  provisioning trigger, immutable `role`/`college_id` trigger, RLS policies.
- Frontend API client + `useMyProfile` hook with loading/saving/error states.
- Profile UI wired to the API (onboarding + Profile page); email and college are
  read-only (schema-correct).
- **Campus jobs + applications (persisted):** `GET/POST/PATCH /api/jobs`,
  `POST /api/jobs/:id/publish|close`, `GET/POST /api/jobs/:id/applications`,
  `GET /api/applications(/me)`, `PATCH/DELETE /api/applications/:id`. Officer
  create/edit/publish/close, applicant list + status workflow, student apply /
  my-applications / withdraw, dashboard + Placement Cell counts, and theme
  persistence are all wired in the UI.
- Server-side validation for job payloads (allowlist + protected fields), publish
  completeness, application eligibility (published / deadline / college / branch)
  and duplicate (`409`) mapping.

### Partially implemented / needs verification
- **Profile integration end-to-end**: code + types are complete; it has **never**
  been exercised against a real Supabase project. `PATCH` behavior, RLS, and the
  immutability trigger are unverified at runtime.
- **Migration applied?** Unknown — must be checked in the Supabase dashboard.
- **Branding**: user-facing title is "MockMate"; internal package name is still
  `figma-make-app` and `frontend/index.html` uses `figma:*` build placeholders
  (replaced at build time; not user-visible).
- **Profile persistence notes:** name, phone, course/role details and the officer
  profile edit form all persist to the backend profile API. `email` is read-only
  (owned by the auth account) and `college` is read-only (assigned by an
  administrator); neither is editable on any profile screen.

### Pending / not implemented
- Persisted **interviews/sessions**, **reports**, **analytics** (the
  `interview_sessions` table exists, but no real scoring is computed, so
  persisting it would fabricate data and is intentionally not done).
- CGPA/active-backlog eligibility enforcement (schema has no student CGPA/backlog
  columns; only branch is checked server-side).
- Password reset finalisation, account deletion, notifications (explicitly
  unavailable/demo).
- ~~Automated tests for backend or frontend.~~ **Update 2026-10-21:** backend
  `npm test` covers external jobs, roadmap progress and roadmap plans; frontend
  `npm run test:roadmap` covers the catalog, recommendations, mapping, progress
  and resource safety. All pass in the current tree.
- Git repository / version control (no `.git`).

---

## 4. Risks, broken integrations, misleading UI, fake data

### Security
- **No privileged secrets in the frontend.** The backend uses the public key +
  the caller's bearer token for reads, and a backend-only service-role key for
  account deletion and authorized writes to application, interview and
  problem-solving tables. Missing service-role configuration returns `503`
  rather than falling back to browser write privileges.
- Role/college are derived from the verified token + DB and are protected by both
  the API allowlist and the `profiles_enforce_immutable_fields` trigger.
- **Backend `.env` missing:** without it the backend cannot verify tokens
  (protected routes return `503`). This is a setup gap, not a code defect.
- **No version control:** the project is not a Git repo, so there is no commit
  history and no change tracking. `.gitignore` is correct (`.env`, `.env.*`,
  `!.env.example`, `node_modules/`, `dist/`, `.vite/`, etc.).
- Backend CORS defaults to `http://localhost:8443` when `FRONTEND_ORIGIN` is
  unset; set it explicitly for any non-local deployment.
- **Problem submissions are idempotent in code and in a new migration, but the
  migration is not live-verified.** A client UUID plus a unique key and a
  service-role RPC make submission/progress/session updates atomic and
  retry-safe. Local tests cover duplicate, concurrent, distinct-key and
  cross-user behavior; staging must still verify the actual unique index, RPC
  privileges and transaction behavior. See `STAGING_SECURITY_VERIFICATION.md`.

### Broken / risky integrations
- **Frontend → backend dependency:** the profile and jobs screens call
  `http://localhost:4000` by default. If the backend is not running, loads/saves
  fail (handled with clear error messages; onboarding can be skipped).
- **Jobs college scoping** now uses the admin-assigned `college_id` end-to-end
  (the old free-text college-name scoping has been removed). Officers without an
  assigned college cannot post jobs (server returns `403 no_college`).

### Misleading UI / fake data
- **No fake/seeded records** were found. Dashboards/analytics/reports show honest
  empty states; simulated results are labelled "Simulated · Demo Data". Jobs and
  applications now come from the database (real users' rows) and show empty/loading
  states.
- Dashboard, profile and officer-profile screens now show honest "Signed in" /
  "saved to your account" copy; no session-only wording remains.
- `AIInterview`/`CodingInterview` contain curated question banks — legitimate
  static content, not fake user data. Interview results are deliberately **not**
  scored or persisted.

---

## 5. Exact manual steps to perform in Supabase

> Do these in the Supabase dashboard / SQL editor. Never paste secrets into the
> repo. Replace placeholders. Use the **service role** only for admin steps.

1. **Have a project** and copy its **Project URL** + **public** key (publishable
   or anon). Keep the service-role key private.
2. **Apply all migrations in order** from `supabase/migrations/`, including
   `20260111000000_sensitive_write_hardening.sql`. Use the Supabase CLI
   (`supabase db push`) or the SQL editor. For a staging security pass, follow
   `STAGING_SECURITY_VERIFICATION.md`; do not apply to production without
   explicit approval.
3. **Verify** the result: tables `colleges, profiles, campus_jobs,
   job_applications, interview_sessions`; RLS enabled on all 5; triggers
   `on_auth_user_created`, `profiles_set_updated_at`,
   `profiles_enforce_immutable_fields`; functions `handle_new_user`,
   `current_profile_role`, `current_college_id`, `is_placement_officer`,
   `college_of`, `enforce_profile_immutable_fields`.
4. **Provision colleges** (admin, service role):
   ```sql
   insert into public.colleges (name, slug)
   values ('Your College Name', 'your-college-slug')
   on conflict (slug) do nothing;
   ```
5. **Assign a user's college** (admin, service role):
   ```sql
   update public.profiles
   set college_id = (select id from public.colleges where slug = 'your-college-slug')
   where id = '<user-uuid>';
   ```
6. **Promote a placement officer** (admin, service role):
   ```sql
   update public.profiles set role = 'placement-officer' where id = '<user-uuid>';
   ```
   (Both step 5/6 bypass RLS and the immutability trigger only when run as the
   service role — that is intended.)
7. **Local env files** (not committed): set `frontend/.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_PUBLISHABLE_KEY`,
   optional `VITE_API_BASE_URL`) and create `backend/.env` from
   `backend/.env.example` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`/`ANON_KEY`,
   `PORT`, `FRONTEND_ORIGIN`).
8. Confirm the Auth **email confirmation** setting matches your intent (if on,
   users must confirm before a session is issued).

---

## 6. Needs manual verification (cannot be confirmed from the repo)

- Whether the migration is **applied** to the cloud project.
- Whether `frontend/.env` / `backend/.env` hold **valid** credentials.
- Runtime behavior of `requireAuth`, `GET/PATCH /api/profile`, the jobs /
  applications endpoints, RLS, and the immutability trigger against a real project.
- Local builds were re-run during this update: `npm run typecheck`,
  `npm run build` (frontend), `npm run typecheck:backend` and
  `npm run build:backend` all pass. A live run still requires `backend/.env`.
- Git history / commit provenance (no Git available).

---

## 7. Single safest and most useful next task

**End-to-end verification of the persisted jobs + applications flow against a
real Supabase project** (no new feature code):

1. Apply the migration (steps above) and create `backend/.env`; confirm
   `frontend/.env`.
2. Run `npm run dev:backend` and `npm run dev:frontend`.
3. As an **officer** (assigned a college), create a draft, edit it, publish it,
   and close it; confirm another college's officer gets `404`/`403`.
4. As a **student** of the same college, apply to an In-Campus job, confirm
   `409 already_applied` on a repeat, view it in *My Applications*, and withdraw.
5. As the officer, open *Applicants* and move the application through
   `Under Review → Shortlisted`; confirm the student sees the new status.
6. Confirm the profile `PATCH` rejects `role`/`collegeId` (`400`) and the trigger
   blocks forced changes.

**Prerequisites:** Supabase project with SQL-editor and service-role access;
`backend/.env` created; backend and frontend installed (`npm run install:backend`,
`npm run install:frontend`).

After that passes, the natural next feature is migrating **campus jobs**
(persist `campus_jobs` + `job_applications` and replace the demo college-name
scoping with the assigned `college_id`).

---

## 8. Previous tasks that cannot be confirmed

Conversation history is **not available**, and there is **no Git history**. The
following can only be inferred from repository evidence, and their original
prompt text/names cannot be confirmed:

- "Pricing removal" — **outcome** confirmable (no pricing references exist);
  original task name/prompt not confirmable.
- "Branding cleanup" — **outcome** mostly confirmable (UI/docs say "MockMate");
  original task name/prompt not confirmable.
- "Removal of fake/demo data" — **outcome** largely confirmable (no seeded
  records); original task name/prompt and exact scope not confirmable.
- The precise ordering/numbering of all prior tasks (the items above are assumed
  numbered 1–5 per the audit request) cannot be confirmed.
- Any tasks whose results left **no** repository trace cannot be confirmed at all.
