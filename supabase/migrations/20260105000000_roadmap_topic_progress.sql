-- =====================================================================
-- MockMate - roadmap topic completion progress
-- =====================================================================
-- Additive migration. Stores only which curated roadmap topics a student has
-- completed; the study material itself stays versioned in the frontend catalog.
--
-- A row exists only while a topic is complete. Marking a topic incomplete
-- deletes its row, so percentages are always derived from the current set of
-- completed topic IDs rather than a stored counter.
--
-- Security:
--   * `student_id` is the owner and always comes from the verified Supabase
--     token on the server; it is never accepted from a request body.
--   * RLS allows a student to read, insert and delete only their own rows.
--   * Placement officers have no access to roadmap progress.
--   * No update policy is needed because completion timestamps are immutable;
--     re-completing is an idempotent insert and un-completing is a delete.
--
-- Safety: additive only. No existing table, column, row or policy is changed.
-- Re-running is safe (`if not exists` / `drop policy if exists`).
-- =====================================================================

create table if not exists public.roadmap_topic_progress (
  student_id   uuid not null references public.profiles (id) on delete cascade,
  domain_id    text not null
                 check (domain_id in ('it', 'mechanical', 'electronics',
                                      'management', 'hr', 'aptitude')),
  topic_id     text not null
                 check (topic_id ~ '^[a-z0-9-]{1,80}$'),
  completed_at timestamptz not null default now(),
  primary key (student_id, domain_id, topic_id)
);

-- The composite primary key already supports "all progress for one student".
-- This index supports any future admin/reporting query by domain without
-- exposing another student's rows through RLS.
create index if not exists roadmap_topic_progress_domain_idx
  on public.roadmap_topic_progress (domain_id, topic_id);

alter table public.roadmap_topic_progress enable row level security;

drop policy if exists roadmap_topic_progress_select_own_student
  on public.roadmap_topic_progress;
create policy roadmap_topic_progress_select_own_student
  on public.roadmap_topic_progress for select
  to authenticated
  using (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );

drop policy if exists roadmap_topic_progress_insert_own_student
  on public.roadmap_topic_progress;
create policy roadmap_topic_progress_insert_own_student
  on public.roadmap_topic_progress for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );

drop policy if exists roadmap_topic_progress_delete_own_student
  on public.roadmap_topic_progress;
create policy roadmap_topic_progress_delete_own_student
  on public.roadmap_topic_progress for delete
  to authenticated
  using (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );
