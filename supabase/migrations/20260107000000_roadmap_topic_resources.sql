-- =====================================================================
-- MockMate - AI-generated learning resources for curated roadmap topics
-- =====================================================================
-- Additive migration. Stores exactly one persisted resource per student,
-- curated topic and resource type (video, roadmap, docs, practice).
--
-- Security:
--   * `student_id` is the owner and always comes from the verified Supabase
--     token on the server; it is never accepted from a request body.
--   * RLS allows a student to read, insert and update only their own resources.
--   * Placement officers have no access to student roadmap resources.
--   * The composite primary key makes repeated generation idempotent: an upsert
--     updates the existing slot instead of adding duplicate rows.
--
-- Safety: additive only. No existing table, column, row or policy is changed.
-- Re-running is safe (`if not exists` / `drop policy if exists`).
-- =====================================================================

create table if not exists public.roadmap_topic_resources (
  student_id    uuid not null references public.profiles (id) on delete cascade,
  domain_id     text not null
                  check (domain_id in ('it', 'mechanical', 'electronics',
                                       'management', 'hr', 'aptitude')),
  topic_id      text not null
                  check (topic_id ~ '^[a-z0-9-]{1,80}$'),
  resource_type text not null
                  check (resource_type in ('video', 'roadmap', 'docs', 'practice')),
  title         text not null
                  check (char_length(title) between 1 and 160),
  description   text not null
                  check (char_length(description) between 1 and 300),
  provider      text not null
                  check (char_length(provider) between 1 and 80),
  url           text not null
                  check (url ~ '^https://[^[:space:]]+$'),
  is_verified   boolean not null default false,
  generated_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (student_id, domain_id, topic_id, resource_type)
);

alter table public.roadmap_topic_resources enable row level security;

drop policy if exists roadmap_topic_resources_select_own_student
  on public.roadmap_topic_resources;
create policy roadmap_topic_resources_select_own_student
  on public.roadmap_topic_resources for select
  to authenticated
  using (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );

drop policy if exists roadmap_topic_resources_insert_own_student
  on public.roadmap_topic_resources;
create policy roadmap_topic_resources_insert_own_student
  on public.roadmap_topic_resources for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );

drop policy if exists roadmap_topic_resources_update_own_student
  on public.roadmap_topic_resources;
create policy roadmap_topic_resources_update_own_student
  on public.roadmap_topic_resources for update
  to authenticated
  using (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  )
  with check (
    student_id = auth.uid()
    and public.current_profile_role() = 'student'
  );
