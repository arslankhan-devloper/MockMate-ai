-- =====================================================================
-- MockMate — interview answer evaluations (Item 4: Groq answer evaluation)
-- =====================================================================
-- Additive migration. Stores the validated, server-generated evaluation of a
-- single question/answer turn. Nothing existing is altered or dropped.
--
-- Why a separate table instead of columns on `interview_turns`:
--   * `interview_turns` is written by the interview lifecycle; keeping the
--     evaluation in its own table means the base persistence path (and its
--     select column list) stays untouched, so a partially-migrated environment
--     cannot break session persistence or the report transcript.
--   * One row per (session_id, question_index) makes re-evaluation an idempotent
--     upsert rather than an append, exactly like answer saving.
--
-- The `answer_hash` column records a hash of the answer that was evaluated. A
-- stored evaluation is only surfaced when it still matches the current answer,
-- so an edited answer is never shown stale feedback.
--
-- Scoring scale: `score` is 0-100 or null. It is populated ONLY when a real
-- evaluation produced a valid score; unanswered / insufficient-information /
-- failed states store null and never fabricate a number.
--
-- Safety: additive only; re-running is safe (`if not exists` / `create or
-- replace` / `drop ... if exists`). No rows are fabricated. RLS mirrors the
-- `interview_turns` policies so a student can only reach evaluations of their
-- own sessions and an officer may only read (never write) evaluations for
-- sessions of students in their own college.
-- =====================================================================

create table if not exists public.interview_turn_evaluations (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.interview_sessions (id) on delete cascade,
  question_index    integer not null check (question_index >= 0),
  -- evaluated | unanswered | insufficient_information | failed
  status            text not null,
  -- 0-100, or null when no valid score exists. Never a placeholder.
  score             numeric,
  summary           text not null default '',
  strengths         text[] not null default '{}',
  improvements      text[] not null default '{}',
  suggested_answer  text not null default '',
  -- Array of { criterion, score, maxScore, feedback }.
  criteria          jsonb not null default '[]'::jsonb,
  -- Model id used, and a hash of the answer that was evaluated.
  model             text,
  answer_hash       text,
  evaluated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One evaluation per question position per session; this is the idempotency
  -- guard that turns "evaluate again" into an upsert.
  unique (session_id, question_index)
);

create index if not exists interview_turn_evaluations_session_id_idx
  on public.interview_turn_evaluations (session_id);

-- Reuse the updated_at helper defined in the base migration.
drop trigger if exists interview_turn_evaluations_set_updated_at
  on public.interview_turn_evaluations;
create trigger interview_turn_evaluations_set_updated_at
  before update on public.interview_turn_evaluations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security (mirrors interview_turns)
-- ---------------------------------------------------------------------
alter table public.interview_turn_evaluations enable row level security;

drop policy if exists interview_turn_evaluations_select_own_or_officer
  on public.interview_turn_evaluations;
create policy interview_turn_evaluations_select_own_or_officer
  on public.interview_turn_evaluations for select
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

drop policy if exists interview_turn_evaluations_insert_own_student
  on public.interview_turn_evaluations;
create policy interview_turn_evaluations_insert_own_student
  on public.interview_turn_evaluations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.student_id = auth.uid()
    )
  );

drop policy if exists interview_turn_evaluations_update_own_student
  on public.interview_turn_evaluations;
create policy interview_turn_evaluations_update_own_student
  on public.interview_turn_evaluations for update
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

drop policy if exists interview_turn_evaluations_delete_own_student
  on public.interview_turn_evaluations;
create policy interview_turn_evaluations_delete_own_student
  on public.interview_turn_evaluations for delete
  to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.student_id = auth.uid()
    )
  );
