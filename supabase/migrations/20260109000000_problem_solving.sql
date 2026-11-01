-- =====================================================================
-- MockMate - AI problem-solving sessions, coding questions and submissions
-- =====================================================================
-- Additive migration for the Problem Solving workspace. It stores:
--   * one active practice session per student;
--   * AI-generated problems, including encrypted hidden tests and private
--     expected approach/complexity (never returned by the API before grading);
--   * code submissions and their real verdicts;
--   * per-topic skill state used by the bounded adaptive engine.
--
-- Security:
--   * Every row is owned by `student_id`, derived from the verified Supabase
--     token on the server. It is never accepted from a request body.
--   * RLS allows a student to read/insert/update only their own rows.
--   * Placement officers have no access to problem-solving data.
--   * Hidden tests are stored encrypted (`hidden_tests_encrypted`) with a key
--     that exists only on the backend, so a direct PostgREST read still cannot
--     reveal them.
--
-- Safety: additive only. Re-running is safe (`if not exists` /
-- `drop policy if exists`).
-- =====================================================================

create table if not exists public.problem_sessions (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.profiles (id) on delete cascade,
  status             text not null default 'active'
                       check (status in ('active', 'completed')),
  current_difficulty text not null default 'easy'
                       check (current_difficulty in ('easy', 'medium', 'hard')),
  current_topic      text,
  answered_count     integer not null default 0 check (answered_count >= 0),
  accepted_count     integer not null default 0 check (accepted_count >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists problem_sessions_student_idx
  on public.problem_sessions (student_id, updated_at desc);

-- At most one active session per student, so refresh/navigation restores the
-- same workspace instead of silently starting a parallel session.
create unique index if not exists problem_sessions_one_active_idx
  on public.problem_sessions (student_id)
  where status = 'active';

create table if not exists public.problem_questions (
  id                      uuid primary key default gen_random_uuid(),
  session_id              uuid not null references public.problem_sessions (id) on delete cascade,
  student_id              uuid not null references public.profiles (id) on delete cascade,
  sequence                integer not null default 1 check (sequence >= 1),
  title                   text not null,
  difficulty              text not null check (difficulty in ('easy', 'medium', 'hard')),
  topic                   text not null,
  concepts                text[] not null default '{}',
  statement               text not null,
  input_format            text not null default '',
  output_format           text not null default '',
  constraints             text[] not null default '{}',
  examples                jsonb not null default '[]'::jsonb,
  visible_tests           jsonb not null default '[]'::jsonb,
  hidden_tests_encrypted  text not null,
  function_name           text not null,
  parameters              jsonb not null default '[]'::jsonb,
  return_type             text not null,
  starter_code            jsonb not null default '{}'::jsonb,
  hints                   text[] not null default '{}',
  hints_revealed          integer not null default 0 check (hints_revealed >= 0),
  -- AES-256-GCM ciphertext; the reference approach is only decrypted by the
  -- backend after a submission so a direct PostgREST read cannot reveal it.
  approach_encrypted      text not null,
  expected_complexity     text not null default '',
  adaptive_reason         text not null default '',
  generation_rationale    text not null default '',
  source                  text not null default 'ai' check (source = 'ai'),
  created_at              timestamptz not null default now()
);

create index if not exists problem_questions_session_idx
  on public.problem_questions (session_id, sequence);
-- Concurrent "open workspace" / "next problem" requests must not create two
-- questions with the same sequence. The loser of the race reads the winner's row.
create unique index if not exists problem_questions_session_sequence_unique_idx
  on public.problem_questions (session_id, sequence);
create index if not exists problem_questions_student_topic_idx
  on public.problem_questions (student_id, topic, created_at desc);

create table if not exists public.problem_submissions (
  id             uuid primary key default gen_random_uuid(),
  question_id    uuid not null references public.problem_questions (id) on delete cascade,
  session_id     uuid not null references public.problem_sessions (id) on delete cascade,
  student_id     uuid not null references public.profiles (id) on delete cascade,
  language       text not null check (language in ('python', 'javascript')),
  code           text not null,
  verdict        text not null
                   check (verdict in ('accepted', 'wrong_answer', 'runtime_error',
                                      'compile_error', 'time_limit_exceeded')),
  passed_tests   integer not null default 0 check (passed_tests >= 0),
  total_tests    integer not null default 0 check (total_tests >= 0),
  runtime_ms     integer check (runtime_ms is null or runtime_ms >= 0),
  test_summary   jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists problem_submissions_question_idx
  on public.problem_submissions (question_id, created_at desc);
create index if not exists problem_submissions_student_idx
  on public.problem_submissions (student_id, created_at desc);

create table if not exists public.problem_topic_progress (
  student_id          uuid not null references public.profiles (id) on delete cascade,
  topic               text not null,
  attempts            integer not null default 0 check (attempts >= 0),
  accepted            integer not null default 0 check (accepted >= 0),
  partial             integer not null default 0 check (partial >= 0),
  wrong               integer not null default 0 check (wrong >= 0),
  hints_used          integer not null default 0 check (hints_used >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  current_difficulty  text not null default 'easy'
                        check (current_difficulty in ('easy', 'medium', 'hard')),
  last_outcome        text,
  updated_at          timestamptz not null default now(),
  primary key (student_id, topic)
);

-- Keep updated_at correct on both sessions and progress.
drop trigger if exists problem_sessions_set_updated_at on public.problem_sessions;
create trigger problem_sessions_set_updated_at
  before update on public.problem_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists problem_topic_progress_set_updated_at on public.problem_topic_progress;
create trigger problem_topic_progress_set_updated_at
  before update on public.problem_topic_progress
  for each row execute function public.set_updated_at();

alter table public.problem_sessions         enable row level security;
alter table public.problem_questions        enable row level security;
alter table public.problem_submissions      enable row level security;
alter table public.problem_topic_progress   enable row level security;

-- ---------------- problem_sessions ----------------
drop policy if exists problem_sessions_select_own on public.problem_sessions;
create policy problem_sessions_select_own
  on public.problem_sessions for select
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists problem_sessions_insert_own on public.problem_sessions;
create policy problem_sessions_insert_own
  on public.problem_sessions for insert
  to authenticated
  with check (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists problem_sessions_update_own on public.problem_sessions;
create policy problem_sessions_update_own
  on public.problem_sessions for update
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student')
  with check (student_id = auth.uid() and public.current_profile_role() = 'student');

-- ---------------- problem_questions ----------------
drop policy if exists problem_questions_select_own on public.problem_questions;
create policy problem_questions_select_own
  on public.problem_questions for select
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists problem_questions_insert_own on public.problem_questions;
create policy problem_questions_insert_own
  on public.problem_questions for insert
  to authenticated
  with check (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists problem_questions_update_own on public.problem_questions;
create policy problem_questions_update_own
  on public.problem_questions for update
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student')
  with check (student_id = auth.uid() and public.current_profile_role() = 'student');

-- ---------------- problem_submissions ----------------
drop policy if exists problem_submissions_select_own on public.problem_submissions;
create policy problem_submissions_select_own
  on public.problem_submissions for select
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists problem_submissions_insert_own on public.problem_submissions;
create policy problem_submissions_insert_own
  on public.problem_submissions for insert
  to authenticated
  with check (student_id = auth.uid() and public.current_profile_role() = 'student');

-- ---------------- problem_topic_progress ----------------
drop policy if exists problem_topic_progress_select_own on public.problem_topic_progress;
create policy problem_topic_progress_select_own
  on public.problem_topic_progress for select
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists problem_topic_progress_insert_own on public.problem_topic_progress;
create policy problem_topic_progress_insert_own
  on public.problem_topic_progress for insert
  to authenticated
  with check (student_id = auth.uid() and public.current_profile_role() = 'student');

drop policy if exists problem_topic_progress_update_own on public.problem_topic_progress;
create policy problem_topic_progress_update_own
  on public.problem_topic_progress for update
  to authenticated
  using (student_id = auth.uid() and public.current_profile_role() = 'student')
  with check (student_id = auth.uid() and public.current_profile_role() = 'student');

revoke all on table public.problem_sessions from anon;
revoke all on table public.problem_questions from anon;
revoke all on table public.problem_submissions from anon;
revoke all on table public.problem_topic_progress from anon;

grant select, insert, update on table public.problem_sessions to authenticated;
grant select, insert, update on table public.problem_questions to authenticated;
grant select, insert on table public.problem_submissions to authenticated;
grant select, insert, update on table public.problem_topic_progress to authenticated;

comment on column public.problem_questions.hidden_tests_encrypted is
  'AES-256-GCM payload (base64url iv.tag.ciphertext). The key is backend-only; clients never receive this column.';
comment on column public.problem_questions.approach_encrypted is
  'AES-256-GCM ciphertext for the private expected approach. The API only decrypts it after grading.';
comment on column public.problem_submissions.test_summary is
  'Per-test pass/fail summaries only. Hidden test inputs and expected outputs are never stored here.';
