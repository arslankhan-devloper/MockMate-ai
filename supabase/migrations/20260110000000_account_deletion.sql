-- =====================================================================
-- MockMate - account deletion audit/status tracking
-- =====================================================================
-- Account deletion spans two systems: public application data and Supabase Auth.
-- This table records the outcome without creating a foreign key to the user, so
-- the record can survive the Auth deletion it describes.
--
-- It intentionally stores no name, email, password, token or profile details.
-- `user_id` is retained only as a pseudonymous audit key for 30 days by default;
-- deployments with a stricter retention period must purge these rows sooner.
--
-- Access: service role only. RLS is enabled with no policies, and browser roles
-- receive no privileges. The backend service-role client performs all writes.
-- =====================================================================

create table if not exists public.account_deletion_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  -- pending | deleting | completed | failed
  status            text not null default 'pending'
                      check (status in ('pending', 'deleting', 'completed', 'failed')),
  requested_at      timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  attempts          integer not null default 1 check (attempts >= 1),
  last_step         text,
  last_error        text,
  -- Per-resource results: deleted | skipped_missing_table. Never stores row data.
  deleted_resources jsonb not null default '{}'::jsonb,
  -- Operational audit retention only. This is not a legal-hold mechanism.
  retain_until      timestamptz not null default (now() + interval '30 days')
);

create index if not exists account_deletion_requests_user_idx
  on public.account_deletion_requests (user_id, requested_at desc);
create index if not exists account_deletion_requests_retention_idx
  on public.account_deletion_requests (retain_until);

alter table public.account_deletion_requests enable row level security;

-- No policies: authenticated/anon clients can never read or write this table.
revoke all on table public.account_deletion_requests from anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_requests to service_role;

comment on table public.account_deletion_requests is
  'Service-role-only deletion audit. Contains a pseudonymous user id, not profile data.';
comment on column public.account_deletion_requests.retain_until is
  'Operational purge target (30 days by default); not a legal retention guarantee.';
