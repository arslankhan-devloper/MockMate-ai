# MockMate Backend

Express + TypeScript API for MockMate. It provides health, profile, campus jobs,
job-applications, interviews and the student roadmap endpoints (catalog progress,
AI-generated plans and AI topic learning resources).

## Requirements

- Node.js 20+ (developed against Node 24)
- npm

## Setup

```powershell
# from the repository root
npm run install:backend

# create the local env file and fill in the values
Copy-Item backend/.env.example backend/.env
```

Required variables in `backend/.env` (all public — see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the API listens on (default `4000`). |
| `FRONTEND_ORIGIN` | Comma-separated allowed browser origins. |
| `SUPABASE_URL` | Supabase project URL (same as `VITE_SUPABASE_URL`). |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` | Supabase public client key (same as the frontend). |

Ordinary user requests do not require a privileged key. Account deletion is the
one exception: it needs a backend-only privileged Supabase key to delete the
Auth user and update the deletion audit table. Never expose this key through
`VITE_*` or send it to the browser.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | Backend-only privileged key for `DELETE /api/account`. When unset, the endpoint returns `503` instead of pretending deletion succeeded. |

Apply `supabase/migrations/20260110000000_account_deletion.sql` before enabling
Delete Account.

Optional AI variables:

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Groq API key (secret, backend only). Required for resume analysis, interview evaluation, AI roadmap generation, topic learning resources and coding-problem generation. |
| `GROQ_MODEL` | Optional model override. Defaults to `openai/gpt-oss-120b`. |
| `GROQ_API_URL` | Optional Groq-compatible base URL. Defaults to `https://api.groq.com/openai/v1`. |

Problem Solving / Practice Hub variables:

| Variable | Purpose |
| --- | --- |
| `CODE_EXECUTION_URL` | Piston-compatible sandbox base URL. Defaults to the public `https://emkc.org/api/v2/piston`; use a self-hosted instance in production. User code is never executed inside the API process. |
| `CODE_EXECUTION_API_KEY` | Optional bearer token for a protected sandbox. The public Piston endpoint may also require one. |
| `CODE_EXECUTION_TIMEOUT_MS` | Per-request sandbox timeout (default `15000`, clamped to 1000-60000). |
| `CODE_EXECUTION_PYTHON_VERSION` | Python runtime version understood by the sandbox (default `3.10.0`). |
| `CODE_EXECUTION_JAVASCRIPT_VERSION` | JavaScript runtime version understood by the sandbox (default `18.15.0`). |
| `PROBLEM_TEST_SECRET` | Secret used to encrypt hidden tests and reference approaches at rest (AES-256-GCM). Set a dedicated random value in production; when unset it falls back to the Groq key. Rotating it makes existing hidden tests and approaches unreadable. |

Apply `supabase/migrations/20260109000000_problem_solving.sql` before using the
Problem Solving endpoints, `20260111000000_sensitive_write_hardening.sql` to
remove browser write access to server-authoritative tables, then
`20260112000000_problem_submission_idempotency.sql` for idempotent submissions.
Branch-wise MCQ and aptitude practice additionally require
`20260114000000_practice_hub.sql`. That migration creates the bank and session
tables but inserts **no** questions; practice endpoints return `503
practice_not_configured` until it is applied and `409 practice_no_questions`
until verified questions are added. The ordered staging procedure is in
`STAGING_SECURITY_VERIFICATION.md`.

Optional external-jobs variables:

| Variable | Purpose |
| --- | --- |
| `HIMALAYAS_API_KEY` | Himalayas API key (secret, backend only). Optional: without it the API uses keyless access with lower rate limits. |

Jobicy's public jobs API is also integrated and needs no key. Both sources return
normalized listings through the same external-jobs endpoint. No placeholder jobs
are returned when a provider is unavailable or rate-limited.

## Scripts

Run from `backend/` or via the root wrappers.

| Backend script | Root wrapper | Description |
| --- | --- | --- |
| `npm run dev` | `npm run dev:backend` | Start with hot reload (`tsx watch`). |
| `npm run build` | `npm run build:backend` | Compile to `backend/dist`. |
| `npm run start` | `npm run start:backend` | Run the compiled server. |
| `npm run typecheck` | `npm run typecheck:backend` | `tsc --noEmit`. |
| `npm test` | — | External jobs, roadmap, interview, problem-solving (including idempotent submissions), branch/aptitude practice, hardening and account-deletion tests via `tsx --test`. |

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | none | Liveness probe. Returns status, uptime, and whether Supabase is configured. |
| `GET` | `/api/profile` | bearer | The caller's own profile. `404 profile_not_found` if no row exists yet. |
| `PATCH` | `/api/profile` | bearer | Update the caller's own, role-approved fields. Returns the updated profile. |
| `GET` | `/api/roadmap/progress` | student | The caller's completed curated roadmap topics. |
| `PUT` | `/api/roadmap/progress/:domainId/:topicId` | student | Idempotently set `{ completed: boolean }` for one topic. |
| `GET` | `/api/roadmap/resources/:domainId/:topicId` | student | The caller's saved video, roadmap, docs and practice resources for one curated topic. |
| `POST` | `/api/roadmap/resources/:domainId/:topicId` | student | Generate four AI resource suggestions and upsert them into the caller's type slots. |
| `GET` | `/api/roadmap/plan` | student | The caller's latest saved AI plan, or `plan: null` with `storageAvailable: false` if the table is missing. |
| `POST` | `/api/roadmap/plan` | student | Generate and, when possible, save a plan from profile, resume context and evaluated interview history. |
| `POST` | `/api/problem-solving/sessions` | student | Open or restore the caller's one active adaptive session and return the current problem. |
| `GET` | `/api/problem-solving/sessions/active` | student | Restore the active workspace without creating a new session. |
| `POST` | `/api/problem-solving/sessions/:id/next-question` | student | Generate another adaptive problem at any time. Skipping is not recorded as an attempt; difficulty follows the last real submission. |
| `POST` | `/api/problem-solving/questions/:id/hint` | student | Reveal one hint and record that it was used. |
| `POST` | `/api/problem-solving/questions/:id/run` | student | Run visible tests only in the sandbox. Not persisted. |
| `POST` | `/api/problem-solving/questions/:id/submit` | student | Run visible + hidden tests, persist the real verdict and update adaptive progress. Requires a UUID `idempotencyKey`; retries return the stored result. |
| `GET` | `/api/problem-solving/progress` | student | The caller's per-topic attempts, accepted count, hints and current difficulty. |
| `GET` | `/api/practice/catalog` | student | Branch/category/topic/difficulty counts for `?kind=branch_mcq&branch=…` or `?kind=aptitude`. |
| `GET` | `/api/practice/sessions/active` | student | The caller's latest unfinished practice session, or `session: null`. |
| `GET` | `/api/practice/sessions/history` | student | The caller's own recent practice sessions (optional `?kind=`). |
| `POST` | `/api/practice/sessions` | student | Start a bounded (1–30 question) branch or aptitude session in `practice` or `timed` mode. |
| `GET` | `/api/practice/sessions/:id` | student | One owned session. Correct answers and explanations are included only for answered questions. |
| `POST` | `/api/practice/sessions/:id/answers` | student | Record `{ questionId, selectedIndex }`. Correctness and score are server-derived; duplicate submissions return the stored answer. |
| `POST` | `/api/practice/sessions/:id/complete` | student | Finalize an owned session and return its server-derived score and accuracy. |
| `GET` | `/api/jobs` | bearer | Students: published jobs. Officers: all jobs of their own college. |
| `GET` | `/api/jobs/external` | bearer | Read-only listings aggregated from external providers. Supports `query`, `country`, `employmentType`, `seniority` and `page` (1–5). |
| `GET` | `/api/jobs/:id` | bearer | One job, if RLS makes it visible to the caller. |
| `POST` | `/api/jobs` | officer | Create a job (`status: "draft" \| "published"`). College/poster are set server-side. |
| `PATCH` | `/api/jobs/:id` | officer | Edit a job in the caller's college. Cannot change `status`, college or poster. |
| `POST` | `/api/jobs/:id/publish` | officer | Validate completeness and publish a draft/closed job. |
| `POST` | `/api/jobs/:id/close` | officer | Close a job so it stops accepting applications. |
| `GET` | `/api/jobs/:id/applications` | officer | Applicants for a job in the caller's college. |
| `POST` | `/api/jobs/:id/applications` | student | Apply to an internal (non-external-link) published job. |
| `GET` | `/api/applications` | officer | Every application for the caller's college, with a job summary. |
| `GET` | `/api/applications/me` | student | The caller's own applications, with a job summary. |
| `PATCH` | `/api/applications/:id` | officer | Move an application between allowed statuses. |
| `DELETE` | `/api/applications/:id` | student | Withdraw the caller's own application. |
| `DELETE` | `/api/account` | bearer | Permanently delete the caller's account. Requires `{ password, confirmation: "DELETE MY ACCOUNT" }`, JSON content type, and a configured backend service-role key. Rate-limited to 5 attempts per user per hour. |

### External jobs — provider rules

- External listings use a provider registry under
  `src/services/externalJobs/providers/`. Each provider independently fetches,
  maps and caches its feed behind the shared `ExternalProviderDefinition`
  interface; adding a source does not change the controller or frontend.
- **Himalayas** uses its public search API. It works without a key; when
  `HIMALAYAS_API_KEY` is set it is sent as a Bearer token for higher rate limits.
  Results are cached in memory for 24 hours, throttled to at least 1.5 seconds
  between upstream calls, and timed out after 8 seconds.
- **Jobicy** uses its keyless public jobs API (`GET /api/v2/remote-jobs`).
  Responses are cached for 1 hour, no upstream polling occurs within that window,
  and every listing links to its canonical Jobicy listing URL.
- Providers are called independently during aggregation. A failure in one
  provider returns its own `providers[]` status/message while listings from the
  other providers are still returned. Nothing is replaced with fabricated jobs.
- HTTP `429` responses honor `Retry-After` and short-circuit further upstream
  calls to that provider until the window passes. Authentication errors are
  surfaced honestly rather than hidden.
- Supported filters are `query`, `country`, `employmentType`, `seniority` and
  `page` (1–5). The default country is `in` (India). Results from all providers
  are normalized, deduplicated by provider ID and canonical URL, sorted by most
  recent, and filtered consistently.
- Every result links to the listing's original source URL; MockMate never
  applies to, stores, or tracks external listings.
- Attribution is required. The Job Portal renders visible provider links in the
  External Job Openings section and a source link on every listing. External
  listings are not redistributed to another job board or aggregator.
- Himalayas updates its public data approximately every 24 hours; Jobicy asks
  clients not to synchronize more than once per hour. The provider cache TTLs
  reflect those requirements.
- Only MockMate campus jobs support in-app applications. External listings are
  read-only and always open on the original site.

### Jobs and applications — server-side rules

- `college_id` and `posted_by` are **always** taken from the verified auth
  context; a client cannot set them. A job in another college returns `404`.
- Publishing requires a complete listing (description ≥ 20 chars, eligibility,
  ≥ 1 branch, CGPA 0–10, backlogs ≥ 0, package, location, a future application
  deadline, drive date/time/venue) and returns `400 job_incomplete` with per-field
  errors otherwise.
- Applying requires a published job, an unexpired deadline, no external
  application link (`422 external_application_required` otherwise), an In-Campus
  job in the student's college, and (when the student's branch is known) a
  matching eligible branch. Duplicate applications return `409 already_applied`.
- Application status transitions are validated: `Applied → Under Review |
  Shortlisted | Rejected`; `Under Review → Shortlisted | Rejected`;
  `Shortlisted → Under Review | Rejected`; `Rejected → Under Review | Shortlisted`.
- CGPA/backlog eligibility is **not** enforced because the schema has no student
  CGPA/backlog columns; only the university-provided branch is checked.

### Roadmap — server-side rules

- **Student only.** `requireAuth` + `requireRole('student')` guard every roadmap
  route; placement officers receive `403`.
- **Progress** is stored in `roadmap_topic_progress`. `student_id` is always
  derived from the verified token, and both complete and uncomplete operations
  are idempotent.
- **AI plans** are stored in `roadmap_ai_plans` as JSONB. A missing table is
  reported as unavailable instead of failing the page; generated plans then last
  only for the current visit.
- **Topic resources** are stored in `roadmap_topic_resources`, one row per
  student, topic and `video` / `roadmap` / `docs` / `practice` slot. The composite
  primary key plus upsert makes repeated generation idempotent. A missing table
  still returns generated suggestions for the current visit with
  `storageAvailable: false` / `persisted: false`.
- **Resource URLs** are never accepted from the model. The server builds every
  link from an allowlisted provider key and search query, marks it verified only
  after an HTTPS/provider-origin check, and revalidates stored URLs before
  returning them.
- **Catalog mapping** is derived in the browser
  (`frontend/src/data/roadmap/taskMapping.ts`). The resource API validates the
  domain/topic pair against a backend catalog constant, so no catalog table or
  seeding step is required. Matched tasks use the curated topic ID for progress;
  unmatched tasks fall back to the generated task ID. Existing completion rows
  and resources are never deleted during plan regeneration.

### `PATCH /api/profile` — allowed fields

Only these fields are accepted, and only for the matching role. Anything else
(including `id`, `role`, `collegeId`, `collegeName`, `email`, `createdAt`,
`updatedAt`) is rejected with `400 validation_error`.

| Field | Roles | Notes |
| --- | --- | --- |
| `fullName` | student, officer | Required, ≤ 120 chars. |
| `phone` | student, officer | Optional, ≤ 32 chars. `null`/`""` clears it. |
| `branch` | student | Optional, ≤ 80 chars. |
| `gradYear` | student | Optional, ≤ 20 chars. |
| `designation` | officer | Optional, ≤ 120 chars. |
| `department` | officer | Optional, ≤ 120 chars. |

Role and college membership can **never** be changed here. Even if a client sent
them, the `profiles_enforce_immutable_fields` trigger blocks the change; the API
returns `403 immutable_field`.

### Error shape

All errors share one shape: `{ "error": string, "code": string, "fields"?: {...} }`.

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `validation_error` / `empty_update` | Invalid or empty body. |
| `401` | `not_authenticated` | Missing/expired token (from `requireAuth`). |
| `404` | `profile_not_found` | No `profiles` row for this account yet. |
| `403` | `immutable_field` | Attempt to change role/college. |
| `500` | `profile_read_failed` / `profile_update_failed` | Unexpected database error. |
| `503` | — | Supabase not configured on the backend. |

## Manual database setup (required before the profile/roadmap APIs work)

The cloud migrations are **not** applied automatically. Before the authenticated
APIs work against a real project:

1. Apply every file in `supabase/migrations/` in filename order
   (SQL Editor or `supabase db push`). This creates `profiles` and its RLS
   policies, triggers, interview tables, and the roadmap tables
   `roadmap_topic_progress`, `roadmap_ai_plans` and
   `roadmap_topic_resources`.
2. Ensure the `on_auth_user_created` trigger is active so each new sign-up gets a
   `profiles` row. The frontend's `auth.tsx` also creates the row as a fallback.
3. Provision `colleges` rows with the **service role** (administrator step).
4. Assign a user's `college_id` and promote placement officers with the **service
   role** (administrator step). Students cannot do this themselves.

Until the migrations are applied, `GET /api/profile` returns `500
profile_read_failed` (table missing) or `404 profile_not_found`. Roadmap progress
will fail, while the AI-plan and topic-resource endpoints report
`storageAvailable: false` when their tables are missing. No fake data is ever
returned.

## Structure

```
backend/
  src/
    app.ts                     # builds the Express app (cors, json, routes, errors)
    server.ts                  # starts the HTTP listener
    config/
      env.ts                   # reads and validates environment variables
    controllers/
      health.controller.ts
      profile.controller.ts
      jobs.controller.ts
      externalJobs.controller.ts
      applications.controller.ts
      roadmap.controller.ts     # progress, resource + AI plan handlers
    middleware/
      auth.ts                  # requireAuth / requireRole / requireCollegeMembership
      errorHandler.ts          # terminal error handler (no stack leakage in prod)
      notFound.ts              # 404 JSON handler
    routes/
      index.ts                 # mounts feature routers under /api
      health.routes.ts
      profile.routes.ts
      jobs.routes.ts
      applications.routes.ts
      roadmap.routes.ts        # student-only progress, resource + AI plan routes
    services/
      profile.service.ts       # RLS-scoped profile read/write + college name
      jobs.service.ts          # RLS-scoped jobs + applications queries and mappers
      roadmap.service.ts       # progress/resources/plan storage + plan context
      roadmapPlan.service.ts   # Groq plan generation and normalisation
      roadmapResources.service.ts # Groq topic-resource generation
      externalJobs.service.ts  # provider aggregation, dedupe and public response
      externalJobs/
        types.ts               # shared normalized job/provider contracts
        shared.ts              # query parsing, mapping helpers, filters, dedupe
        registry.ts            # list of enabled external providers
        providers/
          himalayas.provider.ts
          jobicy.provider.ts
    utils/
      http.ts                  # shared error response shape
      validation.ts            # PATCH body validation (allowlist per role)
      jobValidation.ts         # job create/update/publish validation
      roadmapValidation.ts     # progress params/body validation
      roadmapPlanValidation.ts # plan request + provider URL allowlist
      roadmapResourcesValidation.ts # topic catalog + four-type resource rules
      supabase.ts              # shared anon client + per-user (RLS-scoped) client
    types/
      auth.ts                  # AuthContext / AppRole
      express.d.ts             # augments Express Request with auth + supabase
```

## Authentication and authorization

Access tokens are verified by calling Supabase Auth (`auth.getUser(token)`),
which validates the signature, issuer, and expiry server-side — no client-supplied
identity is ever trusted. `requireAuth` then loads the caller's `role` and
`college_id` from `profiles` using a client scoped to the caller's own token, so
Row Level Security applies:

- `requireAuth` — verifies the bearer token and populates `req.auth` / `req.supabase`.
- `requireRole('placement-officer', ...)` — restrict a route to given roles (run after `requireAuth`).
- `requireCollegeMembership` — ensure the caller has a college.

College-scoped handlers must filter by `req.auth.collegeId`, never by a
client-supplied college id. Reads and ownership checks use the per-user client
(`req.supabase`). Writes to `job_applications`, interview sessions/turns/
evaluations, and the Problem Solving tables use the service-role client only
after the handler verifies ownership or role; browser write grants are revoked
by `20260111000000_sensitive_write_hardening.sql`. This applies to ordinary user
requests too.

The jobs and applications routers apply `requireAuth` themselves and add
`requireRole('placement-officer')` + `requireCollegeMembership` to every write and
officer-only route, so identity, role and college scope always come from the
verified token and the database:

```ts
app.use('/api/jobs', jobsRouter)          // jobsRouter applies requireAuth
app.use('/api/applications', applicationsRouter)
```

### Alternative token verification

If you later prefer local verification (no per-request call to Supabase Auth),
the same `jose`-based approach works with the project's JWKS
(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) for projects using asymmetric
signing keys — still public configuration only.

## Relationship to the existing Supabase schema

The backend consumes the schema defined in
`supabase/migrations/20260101000000_init_mockmate_schema.sql` and must never
modify it. It relies on:

- `profiles` — `id` (FK to `auth.users`), `role` (`student` | `placement-officer`),
  `college_id`. `requireAuth` reads `role` and `college_id` from here.
- Row Level Security on every table, enforced by using the caller's token.
- The `on_auth_user_created` trigger that creates a `student` profile on signup.

Because all reads go through the RLS-scoped client, the backend sees exactly what
the calling user is allowed to see.
