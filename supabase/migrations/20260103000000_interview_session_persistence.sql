-- =====================================================================
-- MockMate — interview session persistence (Item 1: persistence foundation)
-- =====================================================================
-- Additive migration building on the base schema in
-- `20260101000000_init_mockmate_schema.sql`, which already defines
-- `public.interview_sessions` (student_id, interview_type, mode, difficulty,
-- target_role, target_company, language, status, score columns, timestamps).
--
-- This migration does two things:
--
--   1. Adds the columns a session needs in order to be faithfully
--      reconstructed, plus an idempotency key:
--        * `config`            — the full InterviewConfig captured at setup
--                                (labels, branch/subject, etc.).
--        * `experience`        — experience level, kept as its own queryable
--                                column for later analytics.
--        * `client_session_id` — client-generated key so a retried
--                                "create session" request reuses the original
--                                row instead of inserting a duplicate.
--
--   2. Adds `public.interview_turns` — the per-question question/answer
--      history. Its `(session_id, question_index)` uniqueness is what makes
--      saving an answer an idempotent upsert rather than an append, so retries
--      can never create duplicate question records.
--
-- Safety: additive only. No table, column, row or policy is dropped or
-- destructively altered. Re-running is safe (`if not exists` /
-- `create or replace` / `drop ... if exists`). No rows are fabricated. RLS is
-- enabled so a candidate can only reach their own sessions and turns, and an
-- officer may only read (never write) sessions of students in their own college.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Additive columns on interview_sessions
-- ---------------------------------------------------------------------

-- Full InterviewConfig captured at setup, for faithful reconstruction.
alter table public.interview_sessions
  add column if not exists config jsonb not null default '{}'::jsonb;

-- Experience level, stored separately so it stays queryable.
alter table public.interview_sessions
  add column if not exists experience text;

-- Client-generated idempotency key for a session's lifetime.
alter table public.interview_sessions
  add column if not exists client_session_id uuid;

-- A given client session id may appear at most once per student. Partial so the
-- many rows without an id (null) are unaffected by uniqueness.
create unique index if not exists interview_sessions_student_client_idx
  on public.interview_sessions (student_id, client_session_id)
  where client_session_id is not null;

-- ---------------------------------------------------------------------
-- Question / answer history
-- ---------------------------------------------------------------------

create table if not exists public.interview_turns (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.interview_sessions (id) on delete cascade,
  question_index  integer not null check (question_index >= 0),
  question_text   text not null default '',
  -- Stable key for the question's source (e.g. domain/set id). Optional.
  question_key    text,
  answer_text     text not null default '',
  spoken_seconds  integer not null default 0 check (spoken_seconds >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One row per question position per session. This is the idempotency guard
  -- that turns answer saving into an upsert.
  unique (session_id, question_index)
);

create index if not exists interview_turns_session_id_idx
  on public.interview_turns (session_id);

-- Reuse the updated_at helper defined in the base migration.
drop trigger if exists interview_turns_set_updated_at on public.interview_turns;
create trigger interview_turns_set_updated_at
  before update on public.interview_turns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
-- A turn is owned through its parent session. The subquery on
-- `interview_sessions` is itself subject to that table's RLS, so a caller can
-- only ever see a session (and therefore its turns) that they are already
-- allowed to read: the student's own sessions, or — for an officer — sessions
-- of students in their own college.
alter table public.interview_turns enable row level security;

drop policy if exists interview_turns_select_own_or_officer on public.interview_turns;
create policy interview_turns_select_own_or_officer
  on public.interview_turns for select
  to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id
        and (
          s.student_id = auth.uid()
          or (
            public.is_placement_officer()
            and public.college_of(s.student_id) is not null
            and public.college_of(s.student_id) = public.current_college_id()
          )
        )
    )
  );

-- Writes (create / update / delete) are for the owning student only.
drop policy if exists interview_turns_insert_own_student on public.interview_turns;
create policy interview_turns_insert_own_student
  on public.interview_turns for insert
  to authenticated
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.student_id = auth.uid()
    )
  );

drop policy if exists interview_turns_update_own_student on public.interview_turns;
create policy interview_turns_update_own_student
  on public.interview_turns for update
  to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.student_id = auth.uid()
    )
  );

drop policy if exists interview_turns_delete_own_student on public.interview_turns;
create policy interview_turns_delete_own_student
  on public.interview_turns for delete
  to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.student_id = auth.uid()
    )
  );
