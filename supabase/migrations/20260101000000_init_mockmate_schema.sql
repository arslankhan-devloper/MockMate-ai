-- =====================================================================
-- MockMate — initial relational schema (PREPARATION ONLY)
-- =====================================================================
-- This file is a proposed schema derived from the current frontend data
-- structures (src/data/profiles.ts, src/data/campusJobs.ts, App.tsx). It is
-- NOT applied to any cloud project automatically. Apply it deliberately via the
-- Supabase SQL Editor or the Supabase CLI — see SUPABASE_SETUP.md.
--
-- Conventions
--   * UUID primary keys (`gen_random_uuid()`, built into PostgreSQL 13+).
--   * `public.profiles.id` is the same id as `auth.users.id` (1:1 with Auth).
--   * `timestamptz` timestamps default to `now()`.
--   * Column-level `check` constraints mirror the app's TypeScript unions.
--
-- Security model in one sentence: every table is protected with Row Level
-- Security, and role / college membership is read through SECURITY DEFINER
-- helper functions (which bypass RLS and therefore cannot recurse). Client
-- supplied role or college values are never trusted.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- colleges: institutions that own In-Campus placement drives. Rows are meant
-- to be provisioned by an administrator / service role (see SUPABASE_SETUP.md),
-- not created by end users.
create table if not exists public.colleges (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Lowercased, normalised identifier used to avoid duplicate college records.
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- profiles: one row per Supabase Auth user.
--
--   * role      — 'student' or 'placement-officer'. Defaults to 'student'.
--   * college_id — set ONLY by an officer/administrator after verification.
--                  A student cannot assign their own college (they could
--                  otherwise grant themselves access to another college's
--                  In-Campus drives).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'student'
                 check (role in ('student', 'placement-officer')),
  full_name    text,
  email        text,
  phone        text,
  college_id   uuid references public.colleges (id) on delete set null,
  -- Student fields
  branch       text,
  grad_year    text,
  -- Placement-officer fields
  designation  text,
  department   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists profiles_college_id_idx on public.profiles (college_id);
create index if not exists profiles_role_idx       on public.profiles (role);

-- campus_jobs: campus placement drives. Mirrors `CampusJob` in the frontend.
-- Every job belongs to the posting college (college_id). In-Campus jobs are
-- visible only to students of that college; Off-Campus jobs are visible to all.
create table if not exists public.campus_jobs (
  id                    uuid primary key default gen_random_uuid(),
  college_id            uuid not null references public.colleges (id) on delete cascade,
  posted_by             uuid references public.profiles (id) on delete set null,
  company               text not null,
  title                 text not null,
  description           text not null default '',
  job_type              text not null default 'In-Campus'
                          check (job_type in ('In-Campus', 'Off-Campus')),
  eligibility           text not null default '',
  branches              text[] not null default '{}'::text[],
  min_cgpa              numeric(4,2) not null default 0
                          check (min_cgpa >= 0 and min_cgpa <= 10),
  allowed_backlogs      integer not null default 0 check (allowed_backlogs >= 0),
  package               text not null default '',
  location              text not null default '',
  application_deadline  date,
  drive_date            date,
  drive_time            time,
  drive_venue           text,
  status                text not null default 'draft'
                          check (status in ('draft', 'published', 'closed')),
  application_link      text,
  link_label            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists campus_jobs_college_id_idx on public.campus_jobs (college_id);
create index if not exists campus_jobs_status_idx     on public.campus_jobs (status);
create index if not exists campus_jobs_posted_by_idx  on public.campus_jobs (posted_by);

-- job_applications: one row per student per job. Mirrors `CampusApplication`.
create table if not exists public.job_applications (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.campus_jobs (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  student_name  text,
  status        text not null default 'Applied'
                  check (status in ('Applied', 'Under Review', 'Shortlisted', 'Rejected')),
  applied_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A student may apply to a given job at most once.
  unique (job_id, student_id)
);

create index if not exists job_applications_student_id_idx on public.job_applications (student_id);
create index if not exists job_applications_job_id_idx     on public.job_applications (job_id);

-- interview_sessions: assessment / mock-interview results. The current frontend
-- does not persist results yet (see InterviewReport.tsx), so this table is a
-- forward-looking proposal shaped from `InterviewConfig` and the report/Analytics
-- screens. No fabricated rows are inserted by this migration.
create table if not exists public.interview_sessions (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.profiles (id) on delete cascade,
  interview_type     text not null default 'technical',
  mode               text,
  difficulty         text,
  target_role        text,
  target_company     text,
  language           text,
  status             text not null default 'in_progress'
                       check (status in ('in_progress', 'completed', 'abandoned')),
  overall_score      numeric(5,2)
                       check (overall_score is null or (overall_score >= 0 and overall_score <= 100)),
  -- Per-skill breakdown for the Skill Radar, e.g. {"dsa": 72, "communication": 65}.
  skill_scores       jsonb,
  strengths          text[] not null default '{}'::text[],
  improvement_areas  text[] not null default '{}'::text[],
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists interview_sessions_student_id_idx on public.interview_sessions (student_id);
create index if not exists interview_sessions_status_idx     on public.interview_sessions (status);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists campus_jobs_set_updated_at on public.campus_jobs;
create trigger campus_jobs_set_updated_at
  before update on public.campus_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists job_applications_set_updated_at on public.job_applications;
create trigger job_applications_set_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- New-user provisioning
-- ---------------------------------------------------------------------
-- Create an empty student profile when someone signs up. This runs as the
-- function owner (SECURITY DEFINER), so it bypasses RLS. It does NOT invent
-- names/colleges and never creates an officer — every new user starts as a
-- plain 'student'. Promoting a user to officer is a deliberate admin step.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Role / college helper functions (RLS-safe)
-- ---------------------------------------------------------------------
-- These are SECURITY DEFINER so their internal query on `public.profiles` is NOT
-- subject to `profiles` RLS. This is the documented Supabase pattern to read the
-- caller's own role/college inside a policy without recursive RLS evaluation.
-- `search_path` is pinned to `public` to prevent search-path hijacking, and
-- blanket EXECUTE is revoked before granting it back to `authenticated` only.

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_college_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select college_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_placement_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'placement-officer' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Returns a given user's college. Used so an officer can read data belonging to
-- students of their own college without exposing other colleges' records.
create or replace function public.college_of(user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select college_id from public.profiles where id = user_id;
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.current_college_id()  from public;
revoke all on function public.is_placement_officer() from public;
revoke all on function public.college_of(uuid)      from public;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_college_id()  to authenticated;
grant execute on function public.is_placement_officer() to authenticated;
grant execute on function public.college_of(uuid)      to authenticated;

-- ---------------------------------------------------------------------
-- Immutable profile fields
-- ---------------------------------------------------------------------
-- RLS cannot compare OLD vs NEW on UPDATE, so a trigger freezes `role` and
-- `college_id` for everyone except the service role. This ensures a student can
-- never promote themselves to placement-officer or attach themselves to another
-- college, even if a future client sends those fields.
create or replace function public.enforce_profile_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'Changing a profile role is not permitted';
  end if;
  if new.college_id is distinct from old.college_id then
    raise exception 'Changing college membership requires an administrator';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_immutable_fields on public.profiles;
create trigger profiles_enforce_immutable_fields
  before update on public.profiles
  for each row execute function public.enforce_profile_immutable_fields();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.colleges           enable row level security;
alter table public.profiles           enable row level security;
alter table public.campus_jobs        enable row level security;
alter table public.job_applications   enable row level security;
alter table public.interview_sessions enable row level security;

-- ── colleges ──────────────────────────────────────────────────────────
-- Students see only their own college; placement officers (directory use) see
-- all colleges. There is intentionally NO insert/update/delete policy: college
-- provisioning is an administrative action performed with the service role.
drop policy if exists colleges_select_members on public.colleges;
create policy colleges_select_members
  on public.colleges for select
  to authenticated
  using (
    public.is_placement_officer()
    or id = public.current_college_id()
  );

-- ── profiles ──────────────────────────────────────────────────────────
-- Read: yourself, plus (for an officer) students in your own college.
drop policy if exists profiles_select_self_or_officer on public.profiles;
create policy profiles_select_self_or_officer
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or (
      public.is_placement_officer()
      and college_id is not null
      and college_id = public.current_college_id()
    )
  );

-- Insert: you may create only your own row, only as a 'student', and without a
-- college. (The signup trigger normally does this for you.) This blocks users
-- from inserting themselves as officers or into an arbitrary college.
drop policy if exists profiles_insert_self_student on public.profiles;
create policy profiles_insert_self_student
  on public.profiles for insert
  to authenticated
  with check (
    id = auth.uid()
    and role = 'student'
    and college_id is null
  );

-- Update: you may edit only your own row. The trigger above still prevents any
-- change to `role` or `college_id`. There is intentionally no DELETE policy.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── campus_jobs ───────────────────────────────────────────────────────
-- Read: published jobs that are Off-Campus (all colleges) or In-Campus for the
-- student's own college; officers additionally see all jobs of their college
-- (including drafts/closed so they can manage them).
drop policy if exists campus_jobs_select_visible on public.campus_jobs;
create policy campus_jobs_select_visible
  on public.campus_jobs for select
  to authenticated
  using (
    (
      status = 'published'
      and (job_type = 'Off-Campus' or college_id = public.current_college_id())
    )
    or (
      public.is_placement_officer()
      and college_id = public.current_college_id()
    )
  );

-- Write: only officers, only within their own college, and never on behalf of
-- another user. `college_id` is forced to equal the caller's college.
drop policy if exists campus_jobs_insert_officer_own_college on public.campus_jobs;
create policy campus_jobs_insert_officer_own_college
  on public.campus_jobs for insert
  to authenticated
  with check (
    public.is_placement_officer()
    and college_id = public.current_college_id()
    and (posted_by is null or posted_by = auth.uid())
  );

drop policy if exists campus_jobs_update_officer_own_college on public.campus_jobs;
create policy campus_jobs_update_officer_own_college
  on public.campus_jobs for update
  to authenticated
  using (
    public.is_placement_officer()
    and college_id = public.current_college_id()
  )
  with check (
    public.is_placement_officer()
    and college_id = public.current_college_id()
  );

drop policy if exists campus_jobs_delete_officer_own_college on public.campus_jobs;
create policy campus_jobs_delete_officer_own_college
  on public.campus_jobs for delete
  to authenticated
  using (
    public.is_placement_officer()
    and college_id = public.current_college_id()
  );

-- ── job_applications ──────────────────────────────────────────────────
-- Read: your own applications; officers can read applications to jobs of their
-- own college.
drop policy if exists job_applications_select_own_or_officer on public.job_applications;
create policy job_applications_select_own_or_officer
  on public.job_applications for select
  to authenticated
  using (
    student_id = auth.uid()
    or (
      public.is_placement_officer()
      and exists (
        select 1 from public.campus_jobs j
        where j.id = job_id
          and j.college_id = public.current_college_id()
      )
    )
  );

-- Insert: you may apply only as yourself, and only to a published, open job
-- that you are eligible to see (Off-Campus, or In-Campus of your college).
drop policy if exists job_applications_insert_student_self on public.job_applications;
create policy job_applications_insert_student_self
  on public.job_applications for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.campus_jobs j
      where j.id = job_id
        and j.status = 'published'
        and (j.application_deadline is null or j.application_deadline >= current_date)
        and (j.job_type = 'Off-Campus' or j.college_id = public.current_college_id())
    )
  );

-- Update: officers may change the status of applications to their college's
-- jobs. Students cannot mutate status here (withdraw = delete below).
drop policy if exists job_applications_update_officer_own_college on public.job_applications;
create policy job_applications_update_officer_own_college
  on public.job_applications for update
  to authenticated
  using (
    public.is_placement_officer()
    and exists (
      select 1 from public.campus_jobs j
      where j.id = job_id
        and j.college_id = public.current_college_id()
    )
  )
  with check (
    public.is_placement_officer()
    and exists (
      select 1 from public.campus_jobs j
      where j.id = job_id
        and j.college_id = public.current_college_id()
    )
  );

-- Delete: a student may withdraw their own application.
drop policy if exists job_applications_delete_own_student on public.job_applications;
create policy job_applications_delete_own_student
  on public.job_applications for delete
  to authenticated
  using (student_id = auth.uid());

-- ── interview_sessions ────────────────────────────────────────────────
-- Read: your own sessions; officers can read sessions of students in their own
-- college (resolved via the SECURITY DEFINER `college_of` helper).
drop policy if exists interview_sessions_select_own_or_officer on public.interview_sessions;
create policy interview_sessions_select_own_or_officer
  on public.interview_sessions for select
  to authenticated
  using (
    student_id = auth.uid()
    or (
      public.is_placement_officer()
      and public.college_of(student_id) is not null
      and public.college_of(student_id) = public.current_college_id()
    )
  );

-- Write: students own their sessions (create, finalize, delete). Officers have
-- no write access to session results.
drop policy if exists interview_sessions_insert_own_student on public.interview_sessions;
create policy interview_sessions_insert_own_student
  on public.interview_sessions for insert
  to authenticated
  with check (student_id = auth.uid());

drop policy if exists interview_sessions_update_own_student on public.interview_sessions;
create policy interview_sessions_update_own_student
  on public.interview_sessions for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists interview_sessions_delete_own_student on public.interview_sessions;
create policy interview_sessions_delete_own_student
  on public.interview_sessions for delete
  to authenticated
  using (student_id = auth.uid());
