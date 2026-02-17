-- Recovery Intelligence v2
-- - Auto lapse state + in-app nudge queue
-- - Expands recovery_sessions.detection_source to include 'auto'
-- - Candidate scan support indexes for cron selection

alter table if exists public.recovery_sessions
  drop constraint if exists recovery_sessions_detection_source_check;
alter table if exists public.recovery_sessions
  add constraint recovery_sessions_detection_source_check
  check (detection_source in ('self', 'auto'));

create table if not exists public.user_recovery_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_engaged_at timestamptz not null default now(),
  lapse_threshold_hours int not null default 12 check (lapse_threshold_hours between 1 and 168),
  last_auto_lapse_at timestamptz,
  last_nudge_at timestamptz,
  locale text not null default 'ko',
  timezone text,
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint check (quiet_hours_end between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_recovery_state_set_updated_at on public.user_recovery_state;
create trigger user_recovery_state_set_updated_at
before update on public.user_recovery_state
for each row execute procedure public.set_updated_at();

create index if not exists user_recovery_state_last_engaged_idx
  on public.user_recovery_state (last_engaged_at asc);

create index if not exists user_recovery_state_auto_lapse_candidate_idx
  on public.user_recovery_state (last_auto_lapse_at asc, last_engaged_at asc);

alter table public.user_recovery_state enable row level security;

drop policy if exists user_recovery_state_select_own on public.user_recovery_state;
create policy user_recovery_state_select_own
on public.user_recovery_state
for select
using (user_id = auth.uid());

drop policy if exists user_recovery_state_insert_own on public.user_recovery_state;
create policy user_recovery_state_insert_own
on public.user_recovery_state
for insert
with check (user_id = auth.uid());

drop policy if exists user_recovery_state_update_own on public.user_recovery_state;
create policy user_recovery_state_update_own
on public.user_recovery_state
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_recovery_state_select_admin on public.user_recovery_state;
create policy user_recovery_state_select_admin
on public.user_recovery_state
for select
using (public.is_admin());

create table if not exists public.recovery_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.recovery_sessions(id) on delete cascade,
  nudge_channel text not null default 'in_app' check (nudge_channel in ('in_app')),
  status text not null default 'pending' check (status in ('pending', 'shown', 'suppressed')),
  message text not null,
  suppress_reason text,
  lapse_start_ts timestamptz not null,
  scheduled_for timestamptz not null default now(),
  shown_at timestamptz,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_nudges_user_session_channel_uniq unique (user_id, session_id, nudge_channel)
);

drop trigger if exists recovery_nudges_set_updated_at on public.recovery_nudges;
create trigger recovery_nudges_set_updated_at
before update on public.recovery_nudges
for each row execute procedure public.set_updated_at();

create index if not exists recovery_nudges_user_status_created_idx
  on public.recovery_nudges (user_id, status, created_at desc);

alter table public.recovery_nudges enable row level security;

drop policy if exists recovery_nudges_select_own on public.recovery_nudges;
create policy recovery_nudges_select_own
on public.recovery_nudges
for select
using (user_id = auth.uid());

drop policy if exists recovery_nudges_insert_own on public.recovery_nudges;
create policy recovery_nudges_insert_own
on public.recovery_nudges
for insert
with check (user_id = auth.uid());

drop policy if exists recovery_nudges_update_own on public.recovery_nudges;
create policy recovery_nudges_update_own
on public.recovery_nudges
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists recovery_nudges_select_admin on public.recovery_nudges;
create policy recovery_nudges_select_admin
on public.recovery_nudges
for select
using (public.is_admin());
