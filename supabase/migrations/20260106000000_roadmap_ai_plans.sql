-- =====================================================================
-- MockMate - AI-generated roadmap plans
-- =====================================================================
-- Additive migration. Stores the latest generated checklist for each student.
-- Topic completion remains in `roadmap_topic_progress`; this table only holds
-- plan content (task titles, descriptions, estimates and trusted resource links).
--
-- Security:
--   * One row per student, owned by `student_id` from the verified token.
--   * RLS allows a student to select, insert and update only their own row.
--   * Placement officers have no access to student roadmap plans.
--   * No delete policy is needed; regenerating updates the existing row.
--
-- Safety: additive only. No existing table, column, row or policy is changed.
-- Re-running is safe (`if not exists` / `drop policy if exists`).
-- =====================================================================

create table if not exists public.roadmap_ai_plans (
  student_id   uuid primary key references public.profiles (id) on delete cascade,
  plan         jsonb not null check (jsonb_typeof(plan) = 'object'),
  generated_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.roadmap_ai_plans enable row level security;

drop policy if exists roadmap_ai_plans_select_own_student
  on public.roadmap_ai_plans;
create policy roadmap_ai_plans_select_own_student
  on public.roadmap_ai_plans for select
  to authenticated
  using (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );

drop policy if exists roadmap_ai_plans_insert_own_student
  on public.roadmap_ai_plans;
create policy roadmap_ai_plans_insert_own_student
  on public.roadmap_ai_plans for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );

drop policy if exists roadmap_ai_plans_update_own_student
  on public.roadmap_ai_plans;
create policy roadmap_ai_plans_update_own_student
  on public.roadmap_ai_plans for update
  to authenticated
  using (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  )
  with check (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );
