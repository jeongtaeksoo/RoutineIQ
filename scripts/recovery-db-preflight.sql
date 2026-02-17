-- Recovery DB preflight checks
-- Usage:
--   psql "$SUPABASE_DB_URL" -f scripts/recovery-db-preflight.sql

\echo '== Recovery tables =='
select
  to_regclass('public.recovery_sessions') as recovery_sessions,
  to_regclass('public.user_recovery_state') as user_recovery_state,
  to_regclass('public.recovery_nudges') as recovery_nudges;

\echo '== Recovery indexes =='
select
  to_regclass('public.recovery_sessions_one_open_per_user') as recovery_sessions_one_open_per_user,
  to_regclass('public.user_recovery_state_last_engaged_idx') as user_recovery_state_last_engaged_idx,
  to_regclass('public.user_recovery_state_auto_lapse_candidate_idx') as user_recovery_state_auto_lapse_candidate_idx,
  to_regclass('public.recovery_nudges_user_status_created_idx') as recovery_nudges_user_status_created_idx;

\echo '== detection_source constraint =='
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'recovery_sessions_detection_source_check';

\echo '== RLS enabled =='
select relname, relrowsecurity
from pg_class
where relname in ('recovery_sessions','user_recovery_state','recovery_nudges')
order by relname;

\echo '== Policies =='
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname='public'
  and tablename in ('recovery_sessions','user_recovery_state','recovery_nudges')
order by tablename, policyname;

\echo '== Missing objects summary (should be 0 rows) =='
with required(name) as (
  values
    ('public.recovery_sessions'),
    ('public.user_recovery_state'),
    ('public.recovery_nudges'),
    ('public.recovery_sessions_one_open_per_user'),
    ('public.user_recovery_state_auto_lapse_candidate_idx'),
    ('public.recovery_nudges_user_status_created_idx')
)
select name as missing_object
from required
where to_regclass(name) is null;
