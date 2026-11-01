# MockMate

**Smart Interview Assessment & Placement Readiness System**

MockMate is a full-stack placement-preparation platform for college students and placement cells. It combines AI-assisted mock interviews, resume analysis, an adaptive coding workspace, a personalised learning roadmap, interview analytics, and a campus job portal in one application.

Students practise, track and improve their placement readiness. Placement officers manage their college's campus drives and applicant pipeline. All identity, roles and college scoping are derived from the verified Supabase session on the server — never from client-supplied values.

---

## Table of Contents

- [Feature Overview](#feature-overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [Available Scripts](#available-scripts)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Security Model](#security-model)
- [AI & Privacy](#ai--privacy)
- [Testing](#testing)
- [Build & Deployment](#build--deployment)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

---

## Feature Overview

### Student experience

| Feature | What it does |
| --- | --- |
| **Dashboard** | Welcome overview, current placement-readiness metrics, recent interview sessions, upcoming campus jobs and recommended jobs. Values come from real persisted data, never seeded demo records. |
| **Resume Analysis** | Upload a PDF/DOCX (max 5 MB) and receive an ATS-style score, section breakdown, strengths/weaknesses, skill extraction, keyword suggestions and improvement tips. The report is stored locally per user so it can feed resume-based interviews. |
| **Mock Interviews** | Technical, HR/Behavioural, Aptitude, Combined and Resume-based interview modes with branch/role/company/difficulty selection, configurable duration, question count and language. |
| **Real-time interview room** | Camera/microphone controls, interviewer avatar, timer, live microphone level, browser speech-to-text, on-device face signals (framing, head direction, approximate eye contact), and adaptive follow-up questions. |
| **Interview evaluation & report** | Answers are evaluated server-side with Groq. The final report shows the persisted session, every question/answer turn, per-answer evaluation, speaking time, and on-device delivery analysis. |
| **Analytics** | Aggregated interview metrics over 1W / 1M / 3M / All ranges: session counts, completion rate, average score, score trend, domain/type/difficulty breakdowns and recent sessions. |
| **Learning Roadmap** | Six curated domains (IT, Mechanical, Electronics, Management, HR, Aptitude) with topic notes, worked examples and practice questions. Students can also generate an AI study plan and AI resources (video, roadmap, docs, practice) per topic. |
| **Practice Hub (Problem Solving)** | Three practice paths from one landing page: branch-wise MCQs (subject/topic, Easy/Medium/Hard, practice or timed), the existing adaptive DSA coding workspace, and aptitude/reasoning MCQs. Correctness and scoring are server-side; the DSA engine is unchanged. |
| **Job Portal** | Browse published campus jobs, apply in-app, track applications and withdraw. External remote jobs are aggregated from Himalayas and Jobicy; those listings are read-only and open on the original source. |
| **Profile & Settings** | Persisted student/officer profile, theme (light/dark/system), interview and coding preferences, password change, and permanent account deletion. |

### Placement officer experience

| Feature | What it does |
| --- | --- |
| **Officer Dashboard** | College-scoped overview of total, published, draft and closed postings plus applicant activity. |
| **Job Posting** | Create drafts, edit, publish completeness-validated drives, close postings, view applicants and move applications through `Applied → Under Review → Shortlisted / Rejected`. |
| **College scoping** | Every job and application is scoped to the officer's admin-assigned `college_id`. Cross-college access returns `404`/`403`. |
| **Officer Profile** | Persisted name, phone, designation and department. Role and college are immutable. |

### Platform behaviour

- Real Supabase authentication with session restoration.
- Server-verified access tokens; roles read from the `profiles` table.
- Row Level Security on every application table.
- No fake or seeded user data; empty states are honest.
- Responsive layout, light/dark/system themes and accessible UI components.
- Hash-based routing (`#/dashboard`, `#/job-portal`, …) so refreshes and browser Back/Forward work without a router dependency.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript 5.7, Vite 8, Tailwind CSS 4 |
| UI & icons | Custom component library, Lucide React |
| Code editor | Monaco Editor (`@monaco-editor/react`) |
| On-device media analysis | MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) |
| Backend | Node.js, Express 5, TypeScript 5.7, `tsx` |
| Auth & database | Supabase (PostgreSQL + Auth + Row Level Security) |
| AI provider | Groq (OpenAI-compatible API) |
| File parsing | `unpdf` (PDF), `mammoth` (DOCX), `multer` (in-memory uploads) |
| Code execution | Piston-compatible sandbox for Problem Solving (default: `https://emkc.org/api/v2/piston`); OnlineCompiler.io for the Coding Round |
| External jobs | Himalayas API, Jobicy public API |
| Testing | Node.js built-in test runner (`node --test` / `tsx --test`) |
| Formatting | `oxfmt` (frontend) |

The root `package.json` is **not** an npm workspace. It proxies commands to `frontend/` and `backend/` with `--prefix`.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                        Browser (React 19)                    │
│  Hash router · Auth context · Theme · Local preferences      │
│  Monaco editor · MediaPipe (on-device camera analysis)       │
│  Speech-to-text (Web Speech API)                             │
└───────────────┬──────────────────────────────┬───────────────┘
                │ Supabase JS client           │ Bearer token
                │ (auth + RLS reads)           │ (JSON / multipart)
                ▼                              ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│        Supabase           │   │      Express 5 API           │
│  PostgreSQL + Auth + RLS  │◄──┤  requireAuth / requireRole   │
│  profiles, jobs, apps,    │   │  Controllers → Services      │
│  interviews, roadmap,     │   │  RLS-scoped + service-role   │
│  problem solving, audit   │   │  clients                     │
└───────────────────────────┘   └───────┬──────────┬───────────┘
                                        │          │
                              ┌─────────▼──┐  ┌────▼──────────┐
                              │   Groq     │  │    Piston     │
                              │ resume,    │  │  sandboxed    │
                              │ interviews,│  │  code run     │
                              │ roadmap,   │  │               │
                              │ problems   │  │               │
                              └────────────┘  └───────────────┘
```

Key architectural rules:

1. **The browser never holds privileged secrets.** The Supabase service-role key and Groq key live only in the backend environment.
2. **Identity is server-derived.** The backend verifies the bearer token with Supabase Auth, then loads `role` and `college_id` from `profiles` using a token-scoped client. Request bodies cannot set them.
3. **RLS is the final authority.** Reads and ownership checks use the caller's token. Writes to server-authoritative tables go through the backend service-role client only after authorization.
4. **User code is never executed inside Express.** Problem Solving submissions go to an external Piston-compatible sandbox.
5. **Uploads stay in memory.** Resume files are parsed in memory, never written to disk, and never logged.

---

## Repository Structure

```text
MockMate final/
├── package.json                 # Root command wrappers
├── README.md                    # This file
├── PROJECT_STATUS.md            # Detailed audit and current status
├── SUPABASE_SETUP.md            # Step-by-step Supabase integration guide
├── STAGING_SECURITY_VERIFICATION.md
│                                # Staging runbook for hardened writes
├── .gitignore
│
├── frontend/                    # React + Vite application
│   ├── index.html
│   ├── vite.config.ts           # Dev server on :8443, Tailwind, Figma plugins
│   ├── .env.example
│   ├── public/                  # Static assets (including MediaPipe WASM/model)
│   ├── tests/                   # Frontend unit tests
│   └── src/
│       ├── main.tsx
│       ├── App.tsx              # Route table, auth gates, role guards
│       ├── index.css            # Tailwind + design tokens
│       ├── pages/               # Landing, Auth, Dashboard, interviews, jobs, …
│       ├── components/          # Layout, UI primitives, media & job components
│       ├── hooks/               # Profile, jobs, analytics, roadmap hooks
│       ├── lib/                 # API clients, auth, validation, local stores
│       └── data/                # Campus jobs, problems, roadmap catalogues
│
├── backend/                     # Express + TypeScript API
│   ├── package.json
│   ├── .env.example
│   ├── README.md                # Backend-specific reference
│   ├── tests/                   # Backend unit/integration tests
│   └── src/
│       ├── server.ts            # HTTP listener
│       ├── app.ts               # CORS, JSON, routes, error handlers
│       ├── config/env.ts        # Environment parsing
│       ├── middleware/          # auth, rate limit, errors, 404
│       ├── routes/              # /api/* routers
│       ├── controllers/         # Request/response handlers
│       ├── services/            # Supabase, Groq, jobs, interviews, …
│       ├── utils/               # Validation, HTTP errors, encryption helpers
│       └── types/               # Auth and Express augmentation
│
└── supabase/
    ├── migrations/              # Ordered SQL migrations (must be applied)
    └── verification/            # Read-only security verification SQL
```

---

## Quick Start

### Prerequisites

- **Node.js 20.19+** (22 LTS recommended; developed against Node 24)
- **npm**
- A **Supabase project** with SQL editor access
- Optional: a **Groq API key** for AI features
- Optional: a self-hosted **Piston** sandbox for production-grade code execution

### 1. Install dependencies

From the repository root:

```powershell
npm run install:frontend
npm run install:backend
```

### 2. Configure the frontend

```powershell
Copy-Item frontend/.env.example frontend/.env.local
```

Fill in `frontend/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
# or, for newer projects:
# VITE_SUPABASE_PUBLISHABLE_KEY=<your publishable key>

VITE_API_BASE_URL=http://localhost:4000
```

`.env.local` is git-ignored. Never place a service-role/secret key in a `VITE_*` variable — Vite inlines it into the browser bundle.

### 3. Configure the backend

```powershell
Copy-Item backend/.env.example backend/.env
```

Minimum configuration:

```dotenv
NODE_ENV=development
PORT=4000
FRONTEND_ORIGIN=http://localhost:8443

SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<your anon/publishable key>

# Required for account deletion and authorized privileged writes:
SUPABASE_SERVICE_ROLE_KEY=<your service-role/secret key>

# Required for AI features:
GROQ_API_KEY=<your Groq API key>
```

### 4. Apply the database migrations

Apply every file in `supabase/migrations/` in filename order. See [Supabase Setup](#supabase-setup).

### 5. Run the application

Open **two terminals** from the repository root:

```powershell
# Terminal 1 — backend on http://localhost:4000
npm run dev:backend
```

```powershell
# Terminal 2 — frontend on http://localhost:8443
npm run dev:frontend
```

Open <http://localhost:8443>.

> `npm run dev` starts only the frontend. Use `npm run dev:backend` in a separate terminal.

### 6. Create the first accounts

1. Sign up through the app. The `on_auth_user_created` trigger creates a `student` profile automatically.
2. Provision a college and assign users using the service role (SQL in [Supabase Setup](#supabase-setup)).
3. Promote a user to `placement-officer` if you need the officer dashboard.

---

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | One of these | Legacy anon public key. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | One of these | Newer publishable key; preferred when both are set. |
| `VITE_API_BASE_URL` | No | Backend base URL. Defaults to `http://localhost:4000`. |

### Backend (`backend/.env`)

#### Core

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `production` or `test`. |
| `PORT` | No | `4000` | API listening port. |
| `FRONTEND_ORIGIN` | Recommended | `http://localhost:8443` | Comma-separated allowed CORS origins. Set explicitly outside local development. |
| `SUPABASE_URL` | Yes | — | Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` | Yes | — | Public Supabase client key used to verify tokens and perform RLS-scoped reads. |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | For privileged features | — | Backend-only key used for account deletion, Auth admin operations and authorized writes. Missing → account deletion returns `503`. |

#### AI (Groq)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | For AI features | — | Server-only Groq key. Powers resume analysis, interview evaluation, adaptive questions, roadmap plans/resources and coding-problem generation. |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | Structured-JSON model override. |
| `GROQ_API_URL` | No | `https://api.groq.com/openai/v1` | Compatible API base URL override. |

#### External jobs

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `HIMALAYAS_API_KEY` | No | — | Optional Himalayas key; the public API works without one at lower rate limits. |
| — | — | — | Jobicy uses its keyless public API; no variable is required. |

#### Coding Round / OnlineCompiler.io

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ONLINECOMPILER_API_KEY` | For Coding Round | — | Server-only API key (type “API”, not a widget key). Sent as the bare `Authorization` value — no `Bearer` prefix. |
| `ONLINECOMPILER_API_URL` | No | `https://api.onlinecompiler.io` | Provider base URL. Override only for a compatible proxy. |
| `ONLINECOMPILER_TIMEOUT_MS` | No | `32000` | Per-run timeout, clamped to 5000–45000 ms. The provider caps a sync run at 30s. |

The Coding Round uses `POST /api/run-code-sync/`; it is separate from the
Problem Solving sandbox above. When the key is missing, execution returns a
clear “not configured” error and never falls back to mock output.

#### Problem Solving / sandbox

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CODE_EXECUTION_URL` | No | `https://emkc.org/api/v2/piston` | Piston-compatible sandbox base URL. Use a self-hosted instance in production. |
| `CODE_EXECUTION_API_KEY` | No | — | Optional bearer token for a protected/self-hosted sandbox. |
| `CODE_EXECUTION_TIMEOUT_MS` | No | `15000` | Per-request timeout, clamped to 1000–60000 ms. |
| `CODE_EXECUTION_PYTHON_VERSION` | No | `3.10.0` | Python runtime version understood by the sandbox. |
| `CODE_EXECUTION_JAVASCRIPT_VERSION` | No | `18.15.0` | JavaScript runtime version understood by the sandbox. |
| `PROBLEM_TEST_SECRET` | Production: yes | Falls back to `GROQ_API_KEY` | AES-256-GCM key material for encrypting hidden tests and reference approaches at rest. Rotating it makes existing encrypted data unreadable. |

---

## Supabase Setup

### 1. Create a project

1. Sign in at <https://supabase.com> and create a project.
2. Copy the **Project URL** and a **public client key** (publishable or anon) from **Project Settings → API**.
3. Keep the **service-role/secret key** private and backend-only.

### 2. Apply migrations

Apply all migrations in filename order, using the Supabase SQL Editor or the Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or open each file in `supabase/migrations/` and run it in the **SQL Editor**.

| Migration | Purpose |
| --- | --- |
| `20260101000000_init_mockmate_schema.sql` | `colleges`, `profiles`, `campus_jobs`, `job_applications`, `interview_sessions`, RLS, triggers and helpers. |
| `20260102000000_guard_profile_managed_columns.sql` | Protects admin-managed profile columns. |
| `20260103000000_interview_session_persistence.sql` | `interview_turns` and session persistence. |
| `20260104000000_interview_turn_evaluations.sql` | `interview_turn_evaluations`. |
| `20260105000000_roadmap_topic_progress.sql` | `roadmap_topic_progress`. |
| `20260106000000_roadmap_ai_plans.sql` | `roadmap_ai_plans`. |
| `20260107000000_roadmap_topic_resources.sql` | `roadmap_topic_resources`. |
| `20260108000000_interview_adaptive_questions.sql` | Adaptive question and evaluation columns. |
| `20260109000000_problem_solving.sql` | `problem_sessions`, `problem_questions`, `problem_submissions`, `problem_topic_progress`. |
| `20260110000000_account_deletion.sql` | `account_deletion_requests` audit table. |
| `20260111000000_sensitive_write_hardening.sql` | Revokes browser write grants on server-authoritative tables. |
| `20260112000000_problem_submission_idempotency.sql` | Idempotent problem submissions via a service-role RPC and unique key. |
| `20260113000000_interview_coding_attempts.sql` | Append-only Coding Round run history, owner-only RLS and service-role writes. |
| `20260114000000_practice_hub.sql` | Reusable MCQ bank (`practice_questions`) plus per-student `practice_sessions`, `practice_session_questions` and `practice_answers` for branch and aptitude practice. Ships **no** questions. |

> Migrations are **not applied automatically**. Until they are applied, profile reads fail and roadmap/problem-solving/practice storage reports unavailable. No fake data is substituted.

### 3. Verify the schema

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Every application table should have `rowsecurity = true`. Expected tables include:

`colleges`, `profiles`, `campus_jobs`, `job_applications`, `interview_sessions`, `interview_turns`, `interview_turn_evaluations`, `roadmap_topic_progress`, `roadmap_ai_plans`, `roadmap_topic_resources`, `problem_sessions`, `problem_questions`, `problem_submissions`, `problem_topic_progress`, `account_deletion_requests`, `practice_questions`, `practice_sessions`, `practice_session_questions`, `practice_answers`.

### 4. Provision a college (service role)

```sql
insert into public.colleges (name, slug)
values ('Your College Name', 'your-college-slug')
on conflict (slug) do nothing;
```

### 5. Assign a user's college (service role)

```sql
update public.profiles
set college_id = (select id from public.colleges where slug = 'your-college-slug')
where id = '<user-uuid>';
```

### 6. Promote a placement officer (service role)

```sql
update public.profiles
set role = 'placement-officer'
where id = '<user-uuid>';
```

Role and college are immutable through the API and protected by the `profiles_enforce_immutable_fields` trigger. Only service-role administrative SQL can change them.

### 7. Auth settings

Confirm your Supabase **email confirmation** setting matches your intent. If confirmation is enabled, users must confirm their email before a session is issued.

For the full Supabase walkthrough, see [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

---

## Available Scripts

### Root (`package.json`)

| Command | Description |
| --- | --- |
| `npm run dev` | Start the frontend dev server (`frontend/`). |
| `npm run dev:frontend` | Same as above. |
| `npm run dev:backend` | Start the backend with hot reload. |
| `npm run build` | Build the frontend. |
| `npm run preview` | Preview the frontend production build. |
| `npm run typecheck` | Type-check the frontend. |
| `npm run format` | Format frontend code with `oxfmt`. |
| `npm run build:backend` | Compile the backend to `backend/dist`. |
| `npm run start:backend` | Run the compiled backend. |
| `npm run typecheck:backend` | Type-check the backend. |
| `npm run install:frontend` | Install frontend dependencies. |
| `npm run install:backend` | Install backend dependencies. |

### Frontend (`frontend/package.json`)

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with host `0.0.0.0` on port `8443`. |
| `npm run build` | Production build. |
| `npm run preview` | Preview the build. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run format` | `oxfmt`. |
| `npm run test:recommendations` | Job recommendation tests. |
| `npm run test:roadmap` | Roadmap catalogue/plan/progress tests. |
| `npm run test:interview-drafts` | Interview draft tests. |
| `npm run test:interview-report` | Interview report tests. |
| `npm run test:analytics` | Analytics tests. |
| `npm run test:profile` | Profile form tests. |
| `npm run test:preferences` | Preference storage tests. |
| `npm run test:theme` | Theme resolution tests. |
| `npm run test:problem-solving` | Problem draft and submission-key tests. |
| `npm run test:practice` | Practice Hub helper tests: three-card targets, branch mapping, catalogue filters, scoring and error copy. |
| `npm run test:account-deletion` | Account deletion helper tests. |

### Backend (`backend/package.json`)

| Command | Description |
| --- | --- |
| `npm run dev` | `tsx watch src/server.ts`. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run start` | Run `dist/server.js`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Run the backend test suite with `tsx --test`. |

---

## API Reference

All protected endpoints require:

```http
Authorization: Bearer <supabase-access-token>
```

Errors use a consistent shape:

```json
{
  "error": "Human-readable message",
  "code": "machine_readable_code",
  "fields": { "fieldName": "Validation message" }
}
```

`fields` is present only for validation errors.

### Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | None | Liveness probe: status, uptime and whether Supabase is configured. |

### Account

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `DELETE` | `/api/account` | Bearer | Permanently delete the caller's account. Requires JSON body `{ "password": "...", "confirmation": "DELETE MY ACCOUNT" }`, a configured service-role key, and is rate-limited to 5 attempts per user per hour. |

### Profile

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/profile` | Bearer | The caller's profile. Returns `404 profile_not_found` if no row exists. |
| `PATCH` | `/api/profile` | Bearer | Update role-approved fields only: `fullName`, `phone`, and `branch`/`gradYear` (student) or `designation`/`department` (officer). |

### Resume

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/resume/analyze` | Bearer | Multipart upload (`resume` file, optional `jobTitle`, `jobDescription`). Accepts PDF/DOCX up to 5 MB; returns the validated AI analysis. |

### Campus jobs

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/jobs` | Bearer | Students: published visible jobs. Officers: all jobs of their college. |
| `GET` | `/api/jobs/external` | Bearer | Aggregated external listings. Query: `query`, `country`, `employmentType`, `seniority`, `page` (1–5). |
| `GET` | `/api/jobs/:id` | Bearer | One job, subject to RLS visibility. |
| `POST` | `/api/jobs` | Officer + college | Create a draft or published job. College and poster are set server-side. |
| `PATCH` | `/api/jobs/:id` | Officer + college | Edit a job. Status, college and poster are protected. |
| `POST` | `/api/jobs/:id/publish` | Officer + college | Validate completeness and publish. |
| `POST` | `/api/jobs/:id/close` | Officer + college | Close a job. |
| `GET` | `/api/jobs/:id/applications` | Officer + college | Applicants for a job in the caller's college. |
| `POST` | `/api/jobs/:id/applications` | Student | Apply to an internal published job. |

### Applications

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/applications` | Officer + college | All applications for the caller's college, with job summary. |
| `GET` | `/api/applications/me` | Student | The caller's own applications, with job summary. |
| `PATCH` | `/api/applications/:id` | Officer + college | Move an application between allowed statuses. |
| `DELETE` | `/api/applications/:id` | Student | Withdraw the caller's own application. |

Allowed status transitions:

```text
Applied      → Under Review | Shortlisted | Rejected
Under Review → Shortlisted | Rejected
Shortlisted  → Under Review | Rejected
Rejected     → Under Review | Shortlisted
```

### Interviews

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/interviews` | Bearer | Start an interview session for the caller. |
| `GET` | `/api/interviews` | Bearer | List the caller's sessions. |
| `GET` | `/api/interviews/analytics` | Bearer | Aggregated interview metrics; supports range filters. |
| `GET` | `/api/interviews/:id` | Bearer | One session with turns and evaluations. |
| `PATCH` | `/api/interviews/:id` | Bearer | Update the caller's own session. |
| `PUT` | `/api/interviews/:id/turns/:index` | Bearer | Upsert one question/answer turn. |
| `POST` | `/api/interviews/:id/turns/:index/evaluate` | Bearer | Evaluate one stored answer. |
| `POST` | `/api/interviews/:id/turns/:index/next-question` | Bearer | Evaluate the answer and generate the next adaptive question. |
| `POST` | `/api/interviews/:id/coding/run` | Bearer | Run Coding Round code through OnlineCompiler.io (rate-limited). |
| `GET` | `/api/interviews/:id/coding/attempts` | Bearer | The caller's coding attempts for one Coding Round session. |

### Roadmap (students only)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/roadmap/progress` | Student | The caller's completed curated topics. |
| `PUT` | `/api/roadmap/progress/:domainId/:topicId` | Student | Idempotently set `{ "completed": true/false }`. |
| `GET` | `/api/roadmap/resources/:domainId/:topicId` | Student | Saved video/roadmap/docs/practice resources. |
| `POST` | `/api/roadmap/resources/:domainId/:topicId` | Student | Generate four AI resources and upsert them into the caller's slots. |
| `GET` | `/api/roadmap/plan` | Student | Latest saved AI plan, or `plan: null` with `storageAvailable: false`. |
| `POST` | `/api/roadmap/plan` | Student | Generate and save a plan from profile, resume context and evaluated history. |

### Problem Solving (students only)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/problem-solving/sessions` | Student | Open or restore the one active adaptive session. Rate-limited. |
| `GET` | `/api/problem-solving/sessions/active` | Student | Restore the active workspace without generating. |
| `POST` | `/api/problem-solving/sessions/:id/next-question` | Student | Generate another adaptive problem. Rate-limited. |
| `POST` | `/api/problem-solving/questions/:id/hint` | Student | Reveal one hint and record its use. |
| `POST` | `/api/problem-solving/questions/:id/run` | Student | Run visible tests only in the sandbox. Not persisted. Rate-limited. |
| `POST` | `/api/problem-solving/questions/:id/submit` | Student | Run visible + hidden tests, persist the verdict and update progress. Requires a UUID `idempotencyKey`. Rate-limited. |
| `GET` | `/api/problem-solving/progress` | Student | Per-topic attempts, accepted count, hints and current difficulty. |

### Practice Hub (students only)

These endpoints serve branch-wise MCQ and aptitude/reasoning practice. The DSA
workspace keeps its existing `/api/problem-solving` endpoints above.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/practice/catalog?kind=branch_mcq&branch=cse` | Student | Subjects, topics and difficulty counts for the selected branch. Aptitude always lists its five canonical categories. |
| `GET` | `/api/practice/sessions/active?kind=branch_mcq` | Student | Latest unfinished session for the caller, or `session: null`. |
| `GET` | `/api/practice/sessions/history?kind=aptitude` | Student | The caller's own recent sessions (max 50) for the main dashboard. |
| `POST` | `/api/practice/sessions` | Student | Start a `practice` or `timed` session (1–30 questions). Rate-limited. |
| `GET` | `/api/practice/sessions/:id` | Student | Session with questions. Correct answers/explanations appear only after that question is answered. |
| `POST` | `/api/practice/sessions/:id/answers` | Student | Record one `selectedIndex` (0–3). Correctness and score are derived server-side; duplicate answers return the stored result. Rate-limited. |
| `POST` | `/api/practice/sessions/:id/complete` | Student | Finalize the session and return the server-derived score/accuracy. |

If no questions match the selection, session creation returns `409
practice_no_questions`. If the migration is missing, endpoints return `503
practice_not_configured`. No seed questions are inserted by the migration.

### External jobs — provider rules

- Providers implement a shared interface under `backend/src/services/externalJobs/providers/`.
- **Himalayas** uses its public search API; optional key raises rate limits. Results cached 24 hours, throttled to ≥1.5 s between upstream calls, 8 s timeout.
- **Jobicy** uses the keyless public API; cached for 1 hour and requires no polling within that window.
- A provider failure returns its own status while other providers still return listings. Nothing is replaced with fabricated jobs.
- HTTP `429` honours `Retry-After`; authentication errors are surfaced honestly.
- External listings always link to the original source, are never applied to in-app, stored or tracked, and are not redistributed.
- Only MockMate campus jobs support in-app applications.

---

## Database Schema

| Table | Purpose |
| --- | --- |
| `colleges` | Admin-provisioned colleges. Drives scoping for jobs, applications and officer access. |
| `profiles` | One row per Auth user. Stores role, college, name, contact and student/officer fields. |
| `campus_jobs` | College-scoped campus drives with drafts, publish state and eligibility details. |
| `job_applications` | Student applications with status workflow and uniqueness constraints. |
| `interview_sessions` | Persisted interview sessions, configuration and status. |
| `interview_turns` | Question/answer turns, source, difficulty, topic and generation rationale. |
| `interview_turn_evaluations` | Per-turn AI evaluation, correctness verdict and feedback. |
| `roadmap_topic_progress` | Per-student curated topic completion. |
| `roadmap_ai_plans` | Persisted AI-generated study plans as JSONB. |
| `roadmap_topic_resources` | Four resource slots per student/topic (`video`, `roadmap`, `docs`, `practice`). |
| `problem_sessions` | Active/completed adaptive coding sessions. |
| `problem_questions` | Generated problems, visible tests, encrypted hidden tests and reference data. |
| `problem_submissions` | Graded submissions with an idempotency key and verdict. |
| `problem_topic_progress` | Per-topic attempts, accepted count, hints and adaptive difficulty. |
| `account_deletion_requests` | Audit trail for account deletion attempts/status. |

### Schema guarantees

- RLS is enabled on every application table.
- `on_auth_user_created` provisions a `student` profile on signup (the frontend also has a fallback).
- `profiles_set_updated_at` maintains timestamps.
- `profiles_enforce_immutable_fields` blocks client/API changes to `role` and `college_id`.
- The frontend never writes directly to server-authoritative tables after the hardening migration; writes go through the backend.

---

## Security Model

| Control | Implementation |
| --- | --- |
| **Authentication** | Supabase Auth. The backend verifies the access token via `auth.getUser(token)` — signature, issuer and expiry are checked server-side. |
| **Authorization** | `requireAuth`, `requireRole(...)` and `requireCollegeMembership` middleware. Role and `college_id` are loaded from `profiles` using a token-scoped client. |
| **College scoping** | Handlers filter by `req.auth.collegeId`, never a client-supplied value. Cross-college resources return `404` or `403`. |
| **Immutable fields** | Profile `role` and `college_id` cannot be changed through the API; a database trigger enforces the same rule. |
| **Privileged key** | `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` is backend-only. It is never sent to the browser or included in `VITE_*` variables. |
| **Row Level Security** | All reads use the caller's token; RLS remains the final authority. |
| **Server-authoritative writes** | Jobs, applications, interviews, evaluations and problem-solving writes use the service-role client only after ownership/role checks. Browser write grants are revoked by migration `20260111000000`. |
| **Upload safety** | Resume uploads use `multer` memory storage, 5 MB limit, one file, restricted parts/fields, and are never persisted or logged. |
| **Code execution** | User code is sent to an external Piston-compatible sandbox. It is never executed inside the Express process or on the host. |
| **Hidden tests** | Hidden tests and reference approaches are encrypted at rest with AES-256-GCM using `PROBLEM_TEST_SECRET`. |
| **Rate limiting** | In-process per-user limits on problem generation/run/submit and account deletion. |
| **Account deletion** | Requires the current password, an explicit `DELETE MY ACCOUNT` phrase, JSON content type, a configured service-role key, and is rate-limited. |
| **CORS** | Explicit origin allowlist from `FRONTEND_ORIGIN`; CORS defaults to `http://localhost:8443` locally. |
| **Error handling** | Consistent JSON error shape; production error handler avoids leaking stack traces. |
| **No fake data** | Empty states are honest. Simulated or unavailable features are labelled. No seeded user records exist. |

---

## AI & Privacy

| Feature | Where processing happens | What is stored |
| --- | --- | --- |
| **Resume analysis** | Backend parses the uploaded PDF/DOCX in memory, sends extracted text to Groq, validates the JSON, then returns it. | The file is not written to disk or logged. The report is stored **locally in the browser** per user. |
| **Interview evaluation** | Backend sends the question/answer turn to Groq and validates the structured result. | Session, turns and evaluations are persisted in Supabase. |
| **Adaptive questions** | Backend generates one follow-up question using recent history and the latest evaluation. Malformed/repeated output falls back to the prepared question bank. | Question source, difficulty, topic and rationale are stored with the turn. |
| **Roadmap plan/resources** | Backend generates plans and four resource types with Groq. | Plans are stored in `roadmap_ai_plans`; resources in `roadmap_topic_resources`. |
| **Coding problems** | Backend generates the problem, visible tests and hidden tests. | Problems, encrypted hidden tests and submissions are stored in Supabase. |
| **Camera analysis** | MediaPipe FaceLandmarker runs entirely in the browser tab on the live video element. | No camera frames, video, audio or biometric data leave the device. Only derived counters are summarized with the session. |
| **Speech-to-text** | Browser Web Speech API, where supported. | Only the resulting answer text is saved. |
| **External job feeds** | Backend fetches and normalizes listings. | No listings are stored; responses are cached in memory per provider TTL. |

Additional privacy notes:

- Face signals are browser-side estimates, not validated measurements, and the UI labels them accordingly.
- The app does not infer emotion or "confidence" from appearance.
- Audio and video are not recorded or uploaded.
- The Groq key and service-role key never reach the browser.

---

## Testing

### Backend

```powershell
npm --prefix backend test
```

The suite (via `tsx --test`) covers external job providers, job/application handlers, roadmap validation/plans/resources, interview validation/language/adaptive generation/handlers/analytics/evaluation storage, the Coding Round provider contract and authorization, problem solving, branch/aptitude practice validation and scoring, code execution, problem generation, account deletion, sensitive-write hardening, and submission idempotency/migration contracts.

Some tests involving live Supabase credentials may be skipped unless `SUPABASE_TEST_*` values are provided.

### Frontend

Run individual suites:

```powershell
npm --prefix frontend run test:roadmap
npm --prefix frontend run test:interview-report
npm --prefix frontend run test:analytics
npm --prefix frontend run test:problem-solving
npm --prefix frontend run test:practice
```

Or run the scripts listed in [Available Scripts](#available-scripts).

### Type checks

```powershell
npm run typecheck
npm run typecheck:backend
```

### Build checks

```powershell
npm run build
npm run build:backend
```

---

## Build & Deployment

### Frontend

```powershell
npm run build
```

The production bundle is written to `frontend/dist/`. Serve it from any static host. Ensure the app is served over HTTPS in production and configure the API base URL:

```dotenv
VITE_API_BASE_URL=https://api.yourdomain.com
```

The frontend uses hash routing, so deep links are `https://yourdomain.com/#/dashboard` and require no server rewrite rules.

### Backend

```powershell
npm run build:backend
npm run start:backend
```

The compiled server runs from `backend/dist/server.js`.

Production checklist:

- Set `NODE_ENV=production`.
- Set `FRONTEND_ORIGIN` to the exact deployed frontend origin(s).
- Use a dedicated secret for `PROBLEM_TEST_SECRET`.
- Use a self-hosted Piston sandbox if code or data must not leave your infrastructure.
- Apply all migrations before deploying code that depends on them.
- Configure the service-role key only in the backend environment.
- Put the API behind HTTPS and, for multi-instance deployments, use a shared rate limiter or API gateway (the built-in limiter is per-process).
- Review [`STAGING_SECURITY_VERIFICATION.md`](./STAGING_SECURITY_VERIFICATION.md) before applying the hardening/idempotency migrations to production.

---

## Known Limitations

1. **Migrations are manual.** The repository does not auto-apply SQL to any hosted Supabase project.
2. **Hardening migrations need live verification.** `20260111000000_sensitive_write_hardening.sql` and `20260112000000_problem_submission_idempotency.sql` pass local tests, but the live unique index, RPC grants, transaction and concurrency behaviour must be verified against a staging project. See `STAGING_SECURITY_VERIFICATION.md`.
3. **CGPA/backlog eligibility is not enforced.** The schema has no student CGPA/active-backlog columns; only branch eligibility is checked server-side.
4. **External jobs are read-only.** Applications happen on the original provider site. Provider availability and rate limits are outside the project's control.
5. **Rate limiting is per process.** A multi-instance deployment should add a shared limiter or gateway.
6. **Notifications are not implemented.** The Settings UI shows this honestly.
7. **Account deletion requires the backend service-role key.** Without it, the endpoint returns `503` instead of pretending to delete.
8. **Code execution depends on Piston.** The public endpoint may rate-limit or require a token; production should self-host.
9. **AI features require Groq.** Without `GROQ_API_KEY`, AI-dependent endpoints fail with clear errors rather than fabricated results.
10. **Local-only stores.** Resume reports, interview/coding drafts, preferences and theme live in browser storage and are scoped to the browser/device. They are not synced across devices.
11. **The MCQ/aptitude bank ships empty.** `20260114000000_practice_hub.sql` creates the tables but inserts no questions. Branch and aptitude cards show an explicit empty state until an administrator adds verified questions to `practice_questions`.

For a deeper audit of feature status and verification gaps, see [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).

---

## Troubleshooting

### "Could not reach the MockMate server"

- Ensure `npm run dev:backend` is running on port `4000`.
- Confirm `VITE_API_BASE_URL` matches the backend URL.
- Confirm `FRONTEND_ORIGIN` includes the frontend origin (`http://localhost:8443` by default).

### Protected endpoints return `503`

- `SUPABASE_URL` or the public Supabase key is missing in `backend/.env`.
- Account deletion additionally needs `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`.

### `GET /api/profile` returns `500 profile_read_failed` or `404 profile_not_found`

- The migrations have not been applied, or the `on_auth_user_created` trigger is missing.
- Apply the `supabase/migrations/` files in order and create the user again.

### Roadmap progress/resources show "storage unavailable"

- The roadmap migrations (`20260105000000`, `20260106000000`, `20260107000000`) are not applied.
- AI plans/resources still work for the current visit but will not persist.

### AI features fail

- Check `GROQ_API_KEY` and `GROQ_MODEL`.
- Check backend logs for provider status/timeout details.
- The AI endpoints intentionally do not return fabricated fallback data.

### Coding submissions fail

- Check `CODE_EXECUTION_URL` and network access to the sandbox.
- If using the public Piston endpoint, it may be rate-limited or require `CODE_EXECUTION_API_KEY`; consider self-hosting.
- Ensure `PROBLEM_TEST_SECRET` has not changed since problems were generated (otherwise encrypted hidden tests cannot be decrypted).

### Login or signup says Supabase is not configured

- Add `VITE_SUPABASE_URL` and a public key to `frontend/.env.local`.
- Restart the Vite dev server after changing environment files.

### CORS errors in the browser

- Set `FRONTEND_ORIGIN` to the exact origin (scheme + host + port) of the frontend.
- Multiple origins are comma-separated.
- Restart the backend after changing `backend/.env`.

---

## Related Documentation

| Document | Contents |
| --- | --- |
| [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) | Detailed Supabase project, auth, migration and provisioning guide. |
| [`STAGING_SECURITY_VERIFICATION.md`](./STAGING_SECURITY_VERIFICATION.md) | Staging runbook for sensitive-write hardening and idempotent submissions. |
| [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) | Audit of implemented features, verification gaps and risks. |
| [`backend/README.md`](./backend/README.md) | Backend-specific API, env, security and structure reference. |

---

## Contributing

1. Create a feature branch.
2. Keep changes consistent with existing patterns: server-derived identity, RLS-first reads, validated inputs, honest error states.
3. Add or update tests for changed behaviour.
4. Run both type checks and the relevant test suites.
5. Never commit `.env`, `.env.local`, service-role keys, Groq keys or database passwords.

---

## License

No license file is currently included in this repository. Treat the code as proprietary unless a license is added by the project owner.
