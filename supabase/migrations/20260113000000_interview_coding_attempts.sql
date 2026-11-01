-- =====================================================================
-- MockMate — Coding Round attempts (Interview module)
-- =====================================================================
-- Additive migration. It introduces one append-only table for code runs made in
-- the dedicated Coding Round. Problem Solving keeps its own tables
-- (`problem_sessions`, `problem_questions`, `problem_submissions`,
-- `problem_topic_progress`) and is not modified here.
--
-- Safety:
--   * `if not exists` everywhere; no existing column, row or policy is changed.
--   * A run is always owned through its parent interview session and the
--     authenticated student id supplied by the backend (never by the browser).
--   * Browser sessions may only SELECT their own rows. All writes go through the
--     backend service-role client after server-side authorization, matching
--     migration 20260111000000_sensitive_write_hardening.sql.
--
-- Apply deliberately with the Supabase CLI or SQL Editor. This file does not
-- touch any cloud project automatically.
-- =====================================================================

create table if not exists public.interview_coding_attempts (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.interview_sessions (id) on delete cascade,
  student_id     uuid not null references public.profiles (id) on delete cascade,
  question_index integer not null default 0 check (question_index >= 0),
  language       text not null,
  compiler_id    text not null,
  code           text not null,
  stdin          text not null default '',
  stdout         text not null default '',
  stderr         text not null default '',
  exit_code      integer,
  status         text not null check (status in ('success', 'error')),
  signal         integer,
  truncated      boolean not null default false,
  time_seconds   numeric,
  total_seconds  numeric,
  memory_kb      numeric,
  provider       text not null default 'onlinecompiler',
  created_at     timestamptz not null default now()
);

create index if not exists interview_coding_attempts_session_idx
  on public.interview_coding_attempts (session_id, question_index, created_at desc);

create index if not exists interview_coding_attempts_student_idx
  on public.interview_coding_attempts (student_id);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.interview_coding_attempts enable row level security;

-- Students read their own attempts. Placement officers do not need the raw code
-- of another student's interview; aggregates/reports remain on the session
-- tables, so this policy is intentionally owner-only.
drop policy if exists interview_coding_attempts_select_own on public.interview_coding_attempts;
create policy interview_coding_attempts_select_own
  on public.interview_coding_attempts for select
  to authenticated
  using (student_id = auth.uid());

-- Server-authoritative writes only.
revoke all on table public.interview_coding_attempts from public, anon, authenticated;
grant select on table public.interview_coding_attempts to authenticated;
grant select, insert, update, delete on table public.interview_coding_attempts to service_role;
