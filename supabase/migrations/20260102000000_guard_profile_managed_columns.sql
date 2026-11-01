-- =====================================================================
-- MockMate — guard server-managed profile columns (forward migration)
-- =====================================================================
-- Context
-- -------
-- `profiles_update_self` (see the initial migration) is row-scoped, not
-- column-scoped: it only guarantees that a caller updates their own row. It does
-- not restrict *which* columns are written. The existing
-- `profiles_enforce_immutable_fields` trigger freezes `role` and `college_id`,
-- but the remaining server-managed columns (`id`, `email`, `created_at`) could
-- still be changed by a direct PostgREST update from the browser, bypassing the
-- backend API's field allowlist.
--
-- This migration closes that gap with a BEFORE UPDATE column guard. The fields a
-- user is allowed to edit remain freely writable, so the backend profile API
-- (`GET`/`PATCH /api/profile`) and the signup provisioning path keep working
-- exactly as before:
--
--   Writable by the user (via RLS + API allowlist):
--     full_name, phone, branch, grad_year, designation, department
--
--   Frozen for non-privileged callers:
--     id, role, college_id, email, created_at, updated_at
--
-- `role` / `college_id` are already guarded by `profiles_enforce_immutable_fields`
-- and `updated_at` is always overwritten by `profiles_set_updated_at`, so this
-- trigger only adds the remaining columns. It intentionally does not restate the
-- existing checks to avoid duplicate triggers firing on the same column.
--
-- The service role (trusted administrator / server workflows) bypasses the
-- guard, preserving provisioning and administrative changes.
--
-- Safety: additive only. It does not change RLS, does not revoke grants, and
-- does not rewrite the initial migration. Re-running it is safe
-- (`create or replace` + `drop trigger if exists`).
-- =====================================================================

create or replace function public.enforce_profile_managed_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted server-side workflows (e.g. administrator provisioning) may change
  -- any column.
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

  return new;
end;
$$;

drop trigger if exists profiles_enforce_managed_columns on public.profiles;
create trigger profiles_enforce_managed_columns
  before update on public.profiles
  for each row execute function public.enforce_profile_managed_columns();
