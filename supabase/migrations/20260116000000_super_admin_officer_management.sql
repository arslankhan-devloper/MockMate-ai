-- =====================================================================
-- MockMate — Super Admin Panel, Placement Officer Approval & Audit Logs
-- Migration: 20260116000000_super_admin_officer_management.sql
-- =====================================================================
-- Context
-- -------
-- 1. Adds 'super_admin' to allowable profile roles.
-- 2. Adds officer approval workflow columns to profiles ('approval_status' and
--    'rejection_reason'). Existing profiles default to 'approved' to preserve
--    active accounts and tests. Newly registered placement officers will be 'pending'.
-- 3. Adds 'status' ('active' | 'inactive') to the colleges table.
-- 4. Extends the BEFORE UPDATE guard on profiles to freeze 'approval_status'
--    and 'rejection_reason' against non-service-role client updates.
-- 5. Implements public.is_super_admin() and public.is_approved_placement_officer().
-- 6. Creates public.audit_logs with immutable records readable only by super_admin.
-- 7. Upgrades RLS on colleges, profiles, campus_jobs and job_applications to allow
--    full super_admin oversight while strictly preserving college isolation for officers.
-- =====================================================================

-- 1. Extend profiles role constraint to allow 'super_admin'
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'placement-officer', 'super_admin'));

-- 2. Add approval_status and rejection_reason columns to profiles
alter table public.profiles
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected', 'suspended')),
  add column if not exists rejection_reason text;

create index if not exists profiles_approval_status_idx
  on public.profiles (approval_status);

-- 3. Add status column to colleges
alter table public.colleges
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive'));

create index if not exists colleges_status_idx
  on public.colleges (status);

-- 4. Guard approval_status and rejection_reason on profiles
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

  return new;
end;
$$;

drop trigger if exists profiles_enforce_managed_columns on public.profiles;
create trigger profiles_enforce_managed_columns
  before update on public.profiles
  for each row execute function public.enforce_profile_managed_columns();

-- 5. Helper functions (SECURITY DEFINER to prevent RLS recursion)
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

create or replace function public.is_approved_placement_officer()
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

-- Upgrade existing is_placement_officer() to require approved status
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

revoke all on function public.is_super_admin() from public;
revoke all on function public.is_approved_placement_officer() from public;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_approved_placement_officer() to authenticated;

-- 6. Audit Logs Table
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_role  text not null,
  action      text not null,
  target_type text not null,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_actor_id_idx    on public.audit_logs (actor_id);
create index if not exists audit_logs_action_idx      on public.audit_logs (action);
create index if not exists audit_logs_target_type_idx on public.audit_logs (target_type);
create index if not exists audit_logs_created_at_idx  on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

-- Super admins can view audit logs
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
  on public.audit_logs for select
  to authenticated
  using (public.is_super_admin());

-- No client insert, update, or delete policies: writes happen solely via service-role on the backend.

-- 7. Update RLS policies for Super Admin read oversight across core tables
-- All administrative writes (approvals, college updates, drive publishing) happen
-- strictly through backend APIs using the privileged service_role client.

-- colleges
drop policy if exists colleges_select_members on public.colleges;
create policy colleges_select_members
  on public.colleges for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_placement_officer()
    or id = public.current_college_id()
  );

-- profiles
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
  on public.profiles for select
  to authenticated
  using (public.is_super_admin());

-- campus_jobs
drop policy if exists campus_jobs_select_admin on public.campus_jobs;
create policy campus_jobs_select_admin
  on public.campus_jobs for select
  to authenticated
  using (public.is_super_admin());

-- job_applications
drop policy if exists job_applications_select_admin on public.job_applications;
create policy job_applications_select_admin
  on public.job_applications for select
  to authenticated
  using (public.is_super_admin());
