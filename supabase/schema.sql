-- RoutineIQ Supabase schema (tables + indexes + triggers + RLS policies)
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

-- Activity logs (Daily Flow)
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  entries jsonb not null default '[]'::jsonb,
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
with check (id = auth.uid() and role = 'user');

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

create index if not exists usage_events_created_at_idx
on public.usage_events (created_at desc);

create index if not exists system_errors_created_at_idx
on public.system_errors (created_at desc);

create index if not exists system_errors_route_idx
on public.system_errors (route);
