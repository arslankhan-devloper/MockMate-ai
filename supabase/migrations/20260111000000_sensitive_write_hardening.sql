-- =====================================================================
-- Sensitive write hardening
--
-- Application status/identity, interview transcripts/scores, and problem
-- submissions/verdicts/progress are server-authoritative. Browser sessions may
-- read only their permitted rows; every write now goes through the backend's
-- service-role client after server-side authorization.
--
-- Safety: no table, column, or row is dropped or altered. Re-running is safe.
-- Existing read policies are preserved. Write policies are removed so a future
-- accidental grant still defaults to deny under RLS.
-- =====================================================================

-- job_applications -----------------------------------------------------
drop policy if exists job_applications_insert_student_self on public.job_applications;
drop policy if exists job_applications_update_officer_own_college on public.job_applications;
drop policy if exists job_applications_delete_own_student on public.job_applications;

revoke all on table public.job_applications from public, anon, authenticated;
grant select on table public.job_applications to authenticated;
grant select, insert, update, delete on table public.job_applications to service_role;

-- interview_sessions ---------------------------------------------------
drop policy if exists interview_sessions_insert_own_student on public.interview_sessions;
drop policy if exists interview_sessions_update_own_student on public.interview_sessions;
drop policy if exists interview_sessions_delete_own_student on public.interview_sessions;

revoke all on table public.interview_sessions from public, anon, authenticated;
grant select on table public.interview_sessions to authenticated;
grant select, insert, update, delete on table public.interview_sessions to service_role;

-- interview_turns ------------------------------------------------------
drop policy if exists interview_turns_insert_own_student on public.interview_turns;
drop policy if exists interview_turns_update_own_student on public.interview_turns;
drop policy if exists interview_turns_delete_own_student on public.interview_turns;

revoke all on table public.interview_turns from public, anon, authenticated;
grant select on table public.interview_turns to authenticated;
grant select, insert, update, delete on table public.interview_turns to service_role;

-- interview_turn_evaluations -------------------------------------------
drop policy if exists interview_turn_evaluations_insert_own_student on public.interview_turn_evaluations;
drop policy if exists interview_turn_evaluations_update_own_student on public.interview_turn_evaluations;
drop policy if exists interview_turn_evaluations_delete_own_student on public.interview_turn_evaluations;

revoke all on table public.interview_turn_evaluations from public, anon, authenticated;
grant select on table public.interview_turn_evaluations to authenticated;
grant select, insert, update, delete on table public.interview_turn_evaluations to service_role;

-- problem_sessions -----------------------------------------------------
drop policy if exists problem_sessions_insert_own on public.problem_sessions;
drop policy if exists problem_sessions_update_own on public.problem_sessions;

revoke all on table public.problem_sessions from public, anon, authenticated;
grant select on table public.problem_sessions to authenticated;
grant select, insert, update, delete on table public.problem_sessions to service_role;

-- problem_questions ----------------------------------------------------
drop policy if exists problem_questions_insert_own on public.problem_questions;
drop policy if exists problem_questions_update_own on public.problem_questions;

revoke all on table public.problem_questions from public, anon, authenticated;
grant select on table public.problem_questions to authenticated;
grant select, insert, update, delete on table public.problem_questions to service_role;

-- problem_submissions --------------------------------------------------
drop policy if exists problem_submissions_insert_own on public.problem_submissions;

revoke all on table public.problem_submissions from public, anon, authenticated;
grant select on table public.problem_submissions to authenticated;
grant select, insert, update, delete on table public.problem_submissions to service_role;

-- problem_topic_progress -----------------------------------------------
drop policy if exists problem_topic_progress_insert_own on public.problem_topic_progress;
drop policy if exists problem_topic_progress_update_own on public.problem_topic_progress;

revoke all on table public.problem_topic_progress from public, anon, authenticated;
grant select on table public.problem_topic_progress to authenticated;
grant select, insert, update, delete on table public.problem_topic_progress to service_role;
