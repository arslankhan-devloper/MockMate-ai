-- =====================================================================
-- MockMate — Placement Preparation & Practice Hub
-- =====================================================================
-- Additive migration for the two new practice modes that sit beside the
-- existing DSA workspace:
--
--   * `branch_mcq`  — branch/subject/topic multiple-choice practice
--   * `aptitude`    — quantitative, logical, verbal, data-interpretation and
--                     puzzle practice
--
-- It stores a reusable question bank and per-student practice sessions and
-- answers. Correct answers and explanations are intentionally NOT readable by
-- browser sessions (no SELECT grant on `practice_questions`); the backend
-- returns them only after an answer is recorded.
--
-- Security:
--   * `student_id` always comes from the verified token on the backend.
--   * Browser sessions can only SELECT their own sessions/questions/answers.
--   * All writes use the backend service-role client after authorization,
--     matching 20260111000000_sensitive_write_hardening.sql.
--   * Scores are derived on the server from stored answers; the browser never
--     supplies a score.
--
-- Safety: additive only (`if not exists` / `drop policy if exists`). No
-- existing table, column, row or policy is modified. No question data is
-- inserted here: the UI shows honest empty states until verified questions are
-- added by an administrator.
-- =====================================================================

create table if not exists public.practice_questions (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('branch_mcq', 'aptitude')),
  branch        text,
  category      text not null check (char_length(category) between 1 and 120),
  topic         text not null check (char_length(topic) between 1 and 120),
  difficulty    text not null check (difficulty in ('easy', 'medium', 'hard')),
  prompt        text not null check (char_length(prompt) between 1 and 4000),
  options       jsonb not null,
  correct_index integer not null check (correct_index between 0 and 3),
  explanation   text not null check (char_length(explanation) between 1 and 4000),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint practice_questions_branch_check check (
    (kind = 'branch_mcq' and branch in (
      'cse', 'it', 'mechanical', 'civil', 'electrical', 'ece', 'ai-ds', 'other'
    ))
    or (kind = 'aptitude' and branch is null)
  ),
  constraint practice_questions_aptitude_category_check check (
    kind <> 'aptitude' or category in (
      'Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability',
      'Data Interpretation', 'Puzzles'
    )
  ),
  constraint practice_questions_options_check check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) = 4
    and jsonb_typeof(options->0) = 'string'
    and jsonb_typeof(options->1) = 'string'
    and jsonb_typeof(options->2) = 'string'
    and jsonb_typeof(options->3) = 'string'
  )
);

create index if not exists practice_questions_catalog_idx
  on public.practice_questions (kind, branch, category, topic, difficulty)
  where is_active;

create index if not exists practice_questions_topic_idx
  on public.practice_questions (kind, topic)
  where is_active;

create table if not exists public.practice_sessions (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.profiles (id) on delete cascade,
  kind               text not null check (kind in ('branch_mcq', 'aptitude')),
  branch             text,
  category           text,
  topic              text,
  difficulty         text not null check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  mode               text not null check (mode in ('practice', 'timed')),
  question_count     integer not null check (question_count between 1 and 30),
  answered_count     integer not null default 0 check (answered_count >= 0),
  correct_count      integer not null default 0 check (correct_count >= 0),
  status             text not null default 'active'
                       check (status in ('active', 'completed', 'abandoned')),
  time_limit_seconds integer check (
                       time_limit_seconds is null
                       or time_limit_seconds between 60 and 3600
                     ),
  expires_at         timestamptz,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint practice_sessions_counts_check check (
    answered_count <= question_count and correct_count <= answered_count
  )
);

create index if not exists practice_sessions_student_idx
  on public.practice_sessions (student_id, started_at desc);

create index if not exists practice_sessions_student_kind_idx
  on public.practice_sessions (student_id, kind, status, started_at desc);

create table if not exists public.practice_session_questions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.practice_sessions (id) on delete cascade,
  question_id uuid not null references public.practice_questions (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  position    integer not null check (position >= 0),
  created_at  timestamptz not null default now(),
  unique (session_id, position),
  unique (session_id, question_id)
);

create index if not exists practice_session_questions_session_idx
  on public.practice_session_questions (session_id, position);

create table if not exists public.practice_answers (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.practice_sessions (id) on delete cascade,
  question_id    uuid not null references public.practice_questions (id) on delete cascade,
  student_id     uuid not null references public.profiles (id) on delete cascade,
  selected_index integer not null check (selected_index between 0 and 3),
  is_correct     boolean not null,
  answered_at    timestamptz not null default now(),
  unique (session_id, question_id)
);

create index if not exists practice_answers_session_idx
  on public.practice_answers (session_id, answered_at);

create index if not exists practice_answers_student_idx
  on public.practice_answers (student_id, answered_at desc);

-- Keep the session's answered/correct totals authoritative and race-free. The
-- unique (session_id, question_id) constraint above rejects duplicates before
-- this trigger can double-count.
create or replace function public.apply_practice_answer()
returns trigger
language plpgsql
as $$
begin
  update public.practice_sessions
     set answered_count = answered_count + 1,
         correct_count = correct_count + case when new.is_correct then 1 else 0 end,
         updated_at = now()
   where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists practice_answers_apply on public.practice_answers;
create trigger practice_answers_apply
  after insert on public.practice_answers
  for each row execute function public.apply_practice_answer();

drop trigger if exists practice_sessions_set_updated_at on public.practice_sessions;
create trigger practice_sessions_set_updated_at
  before update on public.practice_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.practice_questions         enable row level security;
alter table public.practice_sessions          enable row level security;
alter table public.practice_session_questions enable row level security;
alter table public.practice_answers           enable row level security;

-- The bank itself has no browser policy: correct answers and explanations must
-- only be served by the backend after a student answers.
revoke all on table public.practice_questions from public, anon, authenticated;

-- Students read only their own sessions, question order and answers.
drop policy if exists practice_sessions_select_own on public.practice_sessions;
create policy practice_sessions_select_own
  on public.practice_sessions for select
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists practice_session_questions_select_own on public.practice_session_questions;
create policy practice_session_questions_select_own
  on public.practice_session_questions for select
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists practice_answers_select_own on public.practice_answers;
create policy practice_answers_select_own
  on public.practice_answers for select
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student');

-- Server-authoritative writes only.
revoke all on table public.practice_sessions from public, anon, authenticated;
revoke all on table public.practice_session_questions from public, anon, authenticated;
revoke all on table public.practice_answers from public, anon, authenticated;

grant select on table public.practice_sessions to authenticated;
grant select on table public.practice_session_questions to authenticated;
grant select on table public.practice_answers to authenticated;

grant select, insert, update, delete on table public.practice_questions to service_role;
grant select, insert, update, delete on table public.practice_sessions to service_role;
grant select, insert, update, delete on table public.practice_session_questions to service_role;
grant select, insert, update, delete on table public.practice_answers to service_role;

comment on table public.practice_questions is
  'Reusable MCQ bank for branch-wise and aptitude practice. Correct answers are backend-only.';
comment on table public.practice_sessions is
  'Per-student practice sessions. Scores are derived server-side from practice_answers.';
comment on column public.practice_questions.correct_index is
  'Zero-based index into options. Never granted to anon/authenticated; served only after answering.';
