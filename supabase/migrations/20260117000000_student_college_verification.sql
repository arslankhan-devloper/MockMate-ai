-- =====================================================================
-- MockMate — Student College Verification & Roll Number Enforcement
-- Migration: 20260117000000_student_college_verification.sql
-- =====================================================================
-- PREREQUISITE: Migration 20260116000000_super_admin_officer_management.sql
-- MUST be applied first. That migration creates:
--   • profiles.approval_status    (needed by is_placement_officer below)
--   • profiles.rejection_reason
--   • profiles_role_check constraint allowing 'super_admin'
--   • public.is_super_admin()
--   • public.audit_logs table
--   • colleges.status column
--
-- RERUN SAFETY:
--   All DDL uses IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS so this
--   script is safe to rerun after a partial failure without duplicating objects
--   or destroying data.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- GUARD: Abort immediately if migration 20260116 was not applied.
-- profiles.approval_status is the sentinel column: it is added by 20260116
-- and referenced by is_placement_officer() in this script.
-- Attempting to continue without it produces confusing downstream errors.
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles'
      and column_name  = 'approval_status'
  ) then
    raise exception
      'Migration 20260117 requires migration 20260116 to be applied first. '
      'Column profiles.approval_status does not exist. '
      'Apply 20260116000000_super_admin_officer_management.sql first, then rerun this script.';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PREREQUISITE FUNCTIONS
-- Re-declare here with CREATE OR REPLACE so this script is self-consistent
-- when 20260116 has already been applied (idempotent) and so that the
-- exact function bodies used by the RLS policies below are known.
-- ─────────────────────────────────────────────────────────────────────

-- is_super_admin(): true when caller's profile has role = 'super_admin'.
-- SECURITY DEFINER + pinned search_path: prevents RLS recursion and
-- search-path hijacking.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- is_placement_officer(): true when caller is an APPROVED placement officer.
-- References approval_status — safe to declare here because the DO block
-- above aborts if that column is absent.
create or replace function public.is_placement_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'placement-officer' and approval_status = 'approved'
     from public.profiles
     where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_placement_officer() from public;
grant execute on function public.is_placement_officer() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Add verification and roll number columns to profiles
--    ADD COLUMN IF NOT EXISTS is idempotent — safe to rerun.
-- ─────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists roll_number text,
  add column if not exists college_verification_status text not null default 'pending'
    check (college_verification_status in ('pending', 'verified', 'rejected')),
  add column if not exists college_verification_reason text,
  add column if not exists verified_by uuid references auth.users (id) on delete set null,
  add column if not exists verified_at timestamptz;

create index if not exists profiles_college_verification_status_idx
  on public.profiles (college_verification_status);

create index if not exists profiles_roll_number_idx
  on public.profiles (roll_number);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Partial unique index: prevent duplicate roll numbers per college.
--    Active only when college_id and roll_number are both non-null and
--    verification status is 'pending' or 'verified'.
--    Rejected students are excluded so they can re-register cleanly.
-- ─────────────────────────────────────────────────────────────────────
create unique index if not exists profiles_college_roll_number_unique_idx
  on public.profiles (college_id, lower(trim(roll_number)))
  where (college_id is not null
         and roll_number is not null
         and college_verification_status in ('pending', 'verified'));

-- ─────────────────────────────────────────────────────────────────────
-- 3. Extend enforce_profile_managed_columns() to freeze new verification
--    columns against direct authenticated-client updates.
--    All previously-guarded columns (id, email, created_at,
--    approval_status, rejection_reason — from migrations 20260102/20260116)
--    are retained so CREATE OR REPLACE does not silently drop them.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.enforce_profile_managed_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted server-side workflows (service_role) may change any column.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Changing a profile id is not permitted';
  end if;

  if new.email is distinct from old.email then
    raise exception 'Changing a profile email requires an administrator';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'Changing a profile created_at is not permitted';
  end if;

  if new.approval_status is distinct from old.approval_status then
    raise exception 'Changing officer approval status requires an administrator';
  end if;

  if new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Changing officer rejection reason requires an administrator';
  end if;

  if new.college_verification_status is distinct from old.college_verification_status then
    raise exception 'Changing college verification status requires an administrator or placement officer';
  end if;

  if new.college_verification_reason is distinct from old.college_verification_reason then
    raise exception 'Changing college verification reason requires an administrator or placement officer';
  end if;

  if new.verified_by is distinct from old.verified_by then
    raise exception 'Changing verifier identity requires an administrator or placement officer';
  end if;

  if new.verified_at is distinct from old.verified_at then
    raise exception 'Changing verification timestamp requires an administrator or placement officer';
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Update handle_new_user() to populate college_id and roll_number
--    from user metadata supplied at sign-up time.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_college_id    text;
  parsed_college_id uuid;
  raw_roll_number   text;
begin
  raw_college_id := nullif(new.raw_user_meta_data ->> 'college_id', '');

  if raw_college_id is not null then
    begin
      parsed_college_id := raw_college_id::uuid;
    exception when others then
      parsed_college_id := null;
    end;       -- END; closes BEGIN...EXCEPTION block
  end if;      -- END IF; closes the IF raw_college_id IS NOT NULL block

  raw_roll_number := nullif(trim(new.raw_user_meta_data ->> 'roll_number'), '');

  insert into public.profiles (
    id,
    email,
    full_name,
    college_id,
    roll_number,
    college_verification_status
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    parsed_college_id,
    raw_roll_number,
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. is_college_verified_student(): true when caller is a student whose
--    college verification status is 'verified'.
--    SECURITY DEFINER prevents RLS recursion.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.is_college_verified_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'student' and college_verification_status = 'verified'
     from public.profiles
     where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_college_verified_student() from public;
grant execute on function public.is_college_verified_student() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Replace campus_jobs_select_visible RLS policy.
--
--    Previous (20260101): any student of the same college sees In-Campus jobs.
--    New: only COLLEGE-VERIFIED students see In-Campus jobs.
--    Approved officers see all jobs of their college.
--    Super Admin sees everything.
--
--    The separate campus_jobs_select_admin policy (from 20260116) is
--    preserved — is_super_admin() here is a belt-and-suspenders clause.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists campus_jobs_select_visible on public.campus_jobs;
create policy campus_jobs_select_visible
  on public.campus_jobs for select
  to authenticated
  using (
    -- Published Off-Campus: visible to all authenticated users
    (
      status = 'published'
      and job_type = 'Off-Campus'
    )
    or
    -- Published In-Campus: college-verified students of that college only
    (
      status = 'published'
      and job_type = 'In-Campus'
      and college_id = public.current_college_id()
      and public.is_college_verified_student()
    )
    or
    -- Any status: approved officer of that college
    (
      public.is_placement_officer()
      and college_id = public.current_college_id()
    )
    or
    -- Super admin sees everything
    public.is_super_admin()
  );
