-- RutineIQ Supabase schema (tables + indexes + triggers + RLS policies)
-- Apply in Supabase SQL Editor (in one run, or section-by-section).

-- Extensions
create extension if not exists pgcrypto;

-- Utilities
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admin check (avoids RLS policy recursion by running as definer)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Profiles (auth.users mirror + role)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- Optional cohort/trend profile fields (product personalization).
alter table public.profiles
  add column if not exists age_group text not null default 'unknown',
  add column if not exists gender text not null default 'unknown',
  add column if not exists job_family text not null default 'unknown',
  add column if not exists work_mode text not null default 'unknown',
  add column if not exists chronotype text not null default 'unknown',
  add column if not exists trend_opt_in boolean not null default false,
  add column if not exists trend_compare_by text[] not null default array['age_group', 'job_family', 'work_mode']::text[],
  add column if not exists goal_keyword text,
  add column if not exists goal_minutes_per_day int,
  add column if not exists current_streak int not null default 0,
  add column if not exists longest_streak int not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_age_group_chk') then
    alter table public.profiles
      add constraint profiles_age_group_chk
      check (age_group in ('0_17', '18_24', '25_34', '35_44', '45_plus', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_gender_chk') then
    alter table public.profiles
      add constraint profiles_gender_chk
      check (gender in ('female', 'male', 'nonbinary', 'prefer_not_to_say', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_job_family_chk') then
    alter table public.profiles
      add constraint profiles_job_family_chk
      check (job_family in ('engineering', 'professional', 'design', 'marketing', 'sales', 'operations', 'student', 'creator', 'other', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_work_mode_chk') then
    alter table public.profiles
      add constraint profiles_work_mode_chk
      check (work_mode in ('fixed', 'flex', 'shift', 'freelance', 'other', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_chronotype_chk') then
    alter table public.profiles
      add constraint profiles_chronotype_chk
      check (chronotype in ('morning', 'midday', 'evening', 'mixed', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_goal_minutes_chk') then
    alter table public.profiles
      add constraint profiles_goal_minutes_chk
      check (goal_minutes_per_day is null or goal_minutes_per_day between 10 and 600);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_current_streak_chk') then
    alter table public.profiles
      add constraint profiles_current_streak_chk
      check (current_streak >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_longest_streak_chk') then
    alter table public.profiles
      add constraint profiles_longest_streak_chk
      check (longest_streak >= 0);
  end if;
end $$;

-- Prevent non-admin role changes.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
declare
  is_admin boolean;
begin
  -- When running from SQL editor / service role context there is no auth uid.
  if auth.uid() is null then
    return new;
  end if;

  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) into is_admin;

  if (new.role is distinct from old.role) and not is_admin then
    raise exception 'Only admins can change role';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_role_change
before update on public.profiles
for each row execute procedure public.prevent_role_change();

-- Auto-create profile on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Keep profile email in sync when an anonymous user converts to email/password.
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email on auth.users
for each row execute procedure public.handle_new_user();

-- Cohort trend aggregation (aggregate-only; no raw row exposure).
create or replace function public.cohort_trend_summary(
  p_age_group text,
  p_gender text,
  p_job_family text,
  p_work_mode text,
  p_chronotype text,
  p_compare_by text[] default array['age_group', 'job_family', 'work_mode'],
  p_window_days int default 14
)
returns table (
  cohort_size int,
  active_users int,
  focus_window_rate numeric(6,2),
  rebound_rate numeric(6,2),
  recovery_buffer_day_rate numeric(6,2),
  focus_window_numerator int,
  focus_window_denominator int,
  rebound_numerator int,
  rebound_denominator int,
  recovery_day_numerator int,
  recovery_day_denominator int
)
language sql
security definer
set search_path = public
as $$
with cohort as (
  select p.id
  from public.profiles p
  where p.trend_opt_in = true
    and (
      not ('age_group' = any(coalesce(p_compare_by, array[]::text[])))
      or p.age_group = coalesce(p_age_group, p.age_group)
    )
    and (
      not ('gender' = any(coalesce(p_compare_by, array[]::text[])))
      or p.gender = coalesce(p_gender, p.gender)
    )
    and (
      not ('job_family' = any(coalesce(p_compare_by, array[]::text[])))
      or p.job_family = coalesce(p_job_family, p.job_family)
    )
    and (
      not ('work_mode' = any(coalesce(p_compare_by, array[]::text[])))
      or p.work_mode = coalesce(p_work_mode, p.work_mode)
    )
    and (
      not ('chronotype' = any(coalesce(p_compare_by, array[]::text[])))
      or p.chronotype = coalesce(p_chronotype, p.chronotype)
    )
),
raw as (
  select
    l.user_id,
    l.date,
    e.value as entry
  from public.activity_logs l
  join cohort c on c.id = l.user_id
  cross join lateral jsonb_array_elements(coalesce(l.entries, '[]'::jsonb)) e(value)
  where l.date >= current_date - greatest(coalesce(p_window_days, 14) - 1, 0)
),
parsed as (
  select
    r.user_id,
    r.date,
    case
      when (r.entry->>'start') ~ '^\d{2}:\d{2}$'
      then split_part(r.entry->>'start', ':', 1)::int * 60 + split_part(r.entry->>'start', ':', 2)::int
      else null
    end as start_m,
    case
      when (r.entry->>'end') ~ '^\d{2}:\d{2}$'
      then split_part(r.entry->>'end', ':', 1)::int * 60 + split_part(r.entry->>'end', ':', 2)::int
      else null
    end as end_m,
    case when (r.entry->>'focus') ~ '^[1-5]$' then (r.entry->>'focus')::int else null end as focus,
    case when (r.entry->>'energy') ~ '^[1-5]$' then (r.entry->>'energy')::int else null end as energy,
    lower(coalesce(r.entry->>'activity', '')) as activity
  from raw r
),
valid as (
  select
    p.user_id,
    p.date,
    p.start_m,
    p.end_m,
    case when p.start_m is not null and p.end_m is not null and p.end_m > p.start_m then p.end_m - p.start_m else null end as duration_min,
    p.focus,
    p.energy,
    p.activity
  from parsed p
),
ordered as (
  select
    v.*,
    row_number() over (partition by v.user_id, v.date order by v.start_m nulls last) as rn
  from valid v
),
pairs as (
  select
    cur.user_id,
    cur.date,
    cur.focus as cur_focus,
    cur.end_m as cur_end_m,
    nxt.focus as next_focus,
    nxt.start_m as next_start_m
  from ordered cur
  left join ordered nxt
    on nxt.user_id = cur.user_id and nxt.date = cur.date and nxt.rn = cur.rn + 1
),
cohort_counts as (
  select count(*)::int as cohort_size from cohort
),
active_counts as (
  select count(distinct v.user_id)::int as active_users from valid v
),
focus_metrics as (
  select
    count(*) filter (where v.duration_min >= 45 and v.focus >= 4)::int as num,
    count(*) filter (where v.duration_min >= 30 and v.focus is not null)::int as den
  from valid v
),
rebound_metrics as (
  select
    count(*) filter (
      where p.cur_focus is not null
        and p.cur_focus <= 2
        and p.next_focus is not null
        and p.next_focus >= 3
        and p.cur_end_m is not null
        and p.next_start_m is not null
        and p.next_start_m >= p.cur_end_m
        and (p.next_start_m - p.cur_end_m) <= 60
    )::int as num,
    count(*) filter (where p.cur_focus is not null and p.cur_focus <= 2)::int as den
  from pairs p
),
recovery_days as (
  select
    count(distinct (v.user_id::text || '|' || v.date::text)) filter (
      where
        v.activity like '%break%'
        or v.activity like '%rest%'
        or v.activity like '%walk%'
        or v.activity like '%stretch%'
        or v.activity like '%휴식%'
        or v.activity like '%산책%'
        or v.activity like '%스트레칭%'
        or v.activity like '%休憩%'
        or v.activity like '%拉伸%'
        or v.activity like '%descanso%'
        or (v.duration_min between 5 and 20 and (v.focus <= 2 or v.energy <= 2))
    )::int as num,
    count(distinct (v.user_id::text || '|' || v.date::text))::int as den
  from valid v
)
select
  c.cohort_size,
  a.active_users,
  case when f.den = 0 then null else round((f.num::numeric * 100.0) / f.den, 2) end as focus_window_rate,
  case when rb.den = 0 then null else round((rb.num::numeric * 100.0) / rb.den, 2) end as rebound_rate,
  case when rd.den = 0 then null else round((rd.num::numeric * 100.0) / rd.den, 2) end as recovery_buffer_day_rate,
  f.num as focus_window_numerator,
  f.den as focus_window_denominator,
  rb.num as rebound_numerator,
  rb.den as rebound_denominator,
  rd.num as recovery_day_numerator,
  rd.den as recovery_day_denominator
from cohort_counts c
cross join active_counts a
cross join focus_metrics f
cross join rebound_metrics rb
cross join recovery_days rd;
$$;

-- Activity logs (Daily Flow)
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  entries jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_logs_user_date_unique unique (user_id, date)
);

create trigger activity_logs_set_updated_at
before update on public.activity_logs
for each row execute procedure public.set_updated_at();

-- AI reports
create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  report jsonb not null,
  schema_version int not null default 1,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_reports_user_date_unique unique (user_id, date)
);

create trigger ai_reports_set_updated_at
before update on public.ai_reports
for each row execute procedure public.set_updated_at();

-- Subscriptions (Stripe)
create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null,
  plan text not null check (plan in ('free', 'pro')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute procedure public.set_updated_at();

-- Usage events (rate limit + cost estimate)
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null default 'analyze',
  event_date date not null,
  request_id text,
  model text,
  tokens_prompt int,
  tokens_completion int,
  tokens_total int,
  cost_usd numeric(10,6),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- System errors (server-only log; admin reads)
create table if not exists public.system_errors (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  message text not null,
  stack text,
  user_id uuid references public.profiles(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================
-- RLS: default deny
-- =========================

alter table public.profiles enable row level security;
alter table public.activity_logs enable row level security;
alter table public.ai_reports enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.system_errors enable row level security;

-- PROFILES policies
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
on public.profiles
for select
using (public.is_admin());

-- ACTIVITY_LOGS policies (owner CRUD + admin read)
drop policy if exists activity_logs_select_own on public.activity_logs;
create policy activity_logs_select_own
on public.activity_logs
for select
using (user_id = auth.uid());

drop policy if exists activity_logs_insert_own on public.activity_logs;
create policy activity_logs_insert_own
on public.activity_logs
for insert
with check (user_id = auth.uid());

drop policy if exists activity_logs_update_own on public.activity_logs;
create policy activity_logs_update_own
on public.activity_logs
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists activity_logs_delete_own on public.activity_logs;
create policy activity_logs_delete_own
on public.activity_logs
for delete
using (user_id = auth.uid());

drop policy if exists activity_logs_select_admin on public.activity_logs;
create policy activity_logs_select_admin
on public.activity_logs
for select
using (public.is_admin());

-- AI_REPORTS policies (read-only for users; server writes via service role; admin read)
drop policy if exists ai_reports_select_own on public.ai_reports;
create policy ai_reports_select_own
on public.ai_reports
for select
using (user_id = auth.uid());

drop policy if exists ai_reports_insert_own on public.ai_reports;
create policy ai_reports_insert_own
on public.ai_reports
for insert
with check (user_id = auth.uid());

drop policy if exists ai_reports_update_own on public.ai_reports;
create policy ai_reports_update_own
on public.ai_reports
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists ai_reports_delete_own on public.ai_reports;
create policy ai_reports_delete_own
on public.ai_reports
for delete
using (user_id = auth.uid());

drop policy if exists ai_reports_select_admin on public.ai_reports;
create policy ai_reports_select_admin
on public.ai_reports
for select
using (public.is_admin());

-- SUBSCRIPTIONS policies (user read own; server writes; admin read)
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
on public.subscriptions
for select
using (user_id = auth.uid());

drop policy if exists subscriptions_select_admin on public.subscriptions;
create policy subscriptions_select_admin
on public.subscriptions
for select
using (public.is_admin());

-- USAGE_EVENTS policies (admin read only; server writes)
drop policy if exists usage_events_select_own on public.usage_events;
create policy usage_events_select_own
on public.usage_events
for select
using (user_id = auth.uid());

drop policy if exists usage_events_insert_own on public.usage_events;
create policy usage_events_insert_own
on public.usage_events
for insert
with check (user_id = auth.uid());

drop policy if exists usage_events_update_own on public.usage_events;
create policy usage_events_update_own
on public.usage_events
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists usage_events_select_admin on public.usage_events;
create policy usage_events_select_admin
on public.usage_events
for select
using (public.is_admin());

-- SYSTEM_ERRORS policies (admin read only; server writes)
drop policy if exists system_errors_select_admin on public.system_errors;
create policy system_errors_select_admin
on public.system_errors
for select
using (public.is_admin());

-- =========================
-- Indexes (run after tables/policies)
-- =========================

create index if not exists activity_logs_user_date_idx
on public.activity_logs (user_id, date desc);

create index if not exists ai_reports_user_date_idx
on public.ai_reports (user_id, date desc);

create index if not exists usage_events_user_event_idx
on public.usage_events (user_id, event_date, event_type);

create unique index if not exists usage_events_user_event_date_request_uidx
on public.usage_events (user_id, event_type, event_date, request_id);

create index if not exists usage_events_created_at_idx
on public.usage_events (created_at desc);

create index if not exists system_errors_created_at_idx
on public.system_errors (created_at desc);

create index if not exists system_errors_route_idx
on public.system_errors (route);

create index if not exists profiles_trend_filter_idx
on public.profiles (trend_opt_in, age_group, gender, job_family, work_mode, chronotype);
