-- Read-only verification for migrations 20260111000000_sensitive_write_hardening.sql
-- and 20260112000000_problem_submission_idempotency.sql.
-- Run in the staging project's SQL editor as postgres/supabase_admin.
-- Expected result: every row is OK, column violations are empty, and the
-- non-SELECT policy query returns no rows.

begin read only;

with target_tables(table_name) as (
  values
    ('job_applications'),
    ('interview_sessions'),
    ('interview_turns'),
    ('interview_turn_evaluations'),
    ('problem_sessions'),
    ('problem_questions'),
    ('problem_submissions'),
    ('problem_topic_progress')
),
roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
),
privileges(privilege_type) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
),
matrix as (
  select
    t.table_name,
    r.role_name,
    p.privilege_type,
    case
      when r.role_name = 'service_role' then true
      when r.role_name = 'authenticated' and p.privilege_type = 'SELECT' then true
      else false
    end as expected_allowed
  from target_tables t
  cross join roles r
  cross join privileges p
)
select
  table_name,
  role_name,
  privilege_type,
  expected_allowed,
  has_table_privilege(
    role_name,
    format('public.%I', table_name),
    privilege_type
  ) as actual_allowed,
  case
    when has_table_privilege(
      role_name,
      format('public.%I', table_name),
      privilege_type
    ) = expected_allowed then 'OK'
    else 'FAIL'
  end as result
from matrix
order by table_name, role_name, privilege_type;

with target_tables(table_name) as (
  values
    ('job_applications'),
    ('interview_sessions'),
    ('interview_turns'),
    ('interview_turn_evaluations'),
    ('problem_sessions'),
    ('problem_questions'),
    ('problem_submissions'),
    ('problem_topic_progress')
),
client_roles(role_name) as (
  values ('anon'), ('authenticated')
),
write_privileges(privilege_type) as (
  values ('INSERT'), ('UPDATE'), ('DELETE')
)
select
  c.table_name,
  c.column_name,
  r.role_name,
  p.privilege_type
from information_schema.columns c
cross join client_roles r
cross join write_privileges p
where c.table_schema = 'public'
  and c.table_name in (select table_name from target_tables)
  and has_column_privilege(
    r.role_name,
    format('public.%I', c.table_name),
    c.column_name,
    p.privilege_type
  )
order by c.table_name, r.role_name, p.privilege_type, c.column_name;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'job_applications',
    'interview_sessions',
    'interview_turns',
    'interview_turn_evaluations',
    'problem_sessions',
    'problem_questions',
    'problem_submissions',
    'problem_topic_progress'
  )
order by c.relname;

with roles(role_name, expected_allowed) as (
  values
    ('anon', false),
    ('authenticated', false),
    ('service_role', true)
)
select
  role_name,
  expected_allowed,
  has_function_privilege(
    role_name,
    'public.record_problem_submission(uuid,uuid,uuid,text,text,text,integer,integer,jsonb,jsonb,boolean,integer,text,text,text,text,text)',
    'EXECUTE'
  ) as actual_allowed,
  case
    when has_function_privilege(
      role_name,
      'public.record_problem_submission(uuid,uuid,uuid,text,text,text,integer,integer,jsonb,jsonb,boolean,integer,text,text,text,text,text)',
      'EXECUTE'
    ) = expected_allowed then 'OK'
    else 'FAIL'
  end as result
from roles
order by role_name;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as configuration,
  p.proacl as acl,
  exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) as public_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'record_problem_submission';

select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'problem_submissions'
  and column_name in (
    'client_submission_id',
    'result_details',
    'all_passed',
    'adaptive_difficulty',
    'adaptive_focus',
    'adaptive_reason'
  )
order by column_name;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'problem_submissions'
  and indexname = 'problem_submissions_client_key_uidx';

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'job_applications',
    'interview_sessions',
    'interview_turns',
    'interview_turn_evaluations',
    'problem_sessions',
    'problem_questions',
    'problem_submissions',
    'problem_topic_progress'
  )
order by tablename, cmd, policyname;

select count(*) filter (where cmd <> 'SELECT') as non_select_policy_count
from pg_policies
where schemaname = 'public'
  and tablename in (
    'job_applications',
    'interview_sessions',
    'interview_turns',
    'interview_turn_evaluations',
    'problem_sessions',
    'problem_questions',
    'problem_submissions',
    'problem_topic_progress'
  );

commit;
