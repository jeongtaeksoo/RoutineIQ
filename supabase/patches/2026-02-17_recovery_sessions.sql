-- Recovery Intelligence v1
-- - Single identifier: recovery_sessions.id == lapse_id (event payload)
-- - DB guarantee: one open session per user
-- - RT source of truth: recovery_completed_at - lapse_start_ts (minutes)

create table if not exists public.recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'completed')),
  detection_source text not null default 'self' check (detection_source in ('self')),
  lapse_start_ts timestamptz not null,
  lapse_type text,
  entry_surface text,
  checkin_energy smallint check (checkin_energy between 1 and 5),
  checkin_time_budget smallint check (checkin_time_budget in (2, 10, 25)),
  checkin_context text,
  protocol_type text,
  intensity_level smallint check (intensity_level between 1 and 5),
  minimum_action_type text,
  minimum_action_duration_min smallint check (minimum_action_duration_min between 1 and 60),
  recovery_completed_at timestamptz,
  rt_min int check (rt_min is null or rt_min >= 0),
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists recovery_sessions_set_updated_at on public.recovery_sessions;
create trigger recovery_sessions_set_updated_at
before update on public.recovery_sessions
for each row execute procedure public.set_updated_at();

create unique index if not exists recovery_sessions_one_open_per_user
  on public.recovery_sessions (user_id)
  where status = 'open';

create index if not exists recovery_sessions_user_created_at_idx
  on public.recovery_sessions (user_id, created_at desc);

alter table public.recovery_sessions enable row level security;

drop policy if exists recovery_sessions_select_own on public.recovery_sessions;
create policy recovery_sessions_select_own
on public.recovery_sessions
for select
using (user_id = auth.uid());

drop policy if exists recovery_sessions_insert_own on public.recovery_sessions;
create policy recovery_sessions_insert_own
on public.recovery_sessions
for insert
with check (user_id = auth.uid());

drop policy if exists recovery_sessions_update_own on public.recovery_sessions;
create policy recovery_sessions_update_own
on public.recovery_sessions
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists recovery_sessions_delete_own on public.recovery_sessions;
create policy recovery_sessions_delete_own
on public.recovery_sessions
for delete
using (user_id = auth.uid());

drop policy if exists recovery_sessions_select_admin on public.recovery_sessions;
create policy recovery_sessions_select_admin
on public.recovery_sessions
for select
using (public.is_admin());
