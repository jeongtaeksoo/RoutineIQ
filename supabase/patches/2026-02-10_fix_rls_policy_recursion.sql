-- Fix: "infinite recursion detected in policy for relation profiles" (PostgreSQL 42P17)
-- Apply this in Supabase SQL Editor (safe to re-run).

-- 1) Admin check helper (runs as definer; avoids RLS recursion)
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

-- 2) Replace recursive/fragile admin policies with is_admin()
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
on public.profiles
for select
using (public.is_admin());

drop policy if exists activity_logs_select_admin on public.activity_logs;
create policy activity_logs_select_admin
on public.activity_logs
for select
using (public.is_admin());

drop policy if exists ai_reports_select_admin on public.ai_reports;
create policy ai_reports_select_admin
on public.ai_reports
for select
using (public.is_admin());

drop policy if exists subscriptions_select_admin on public.subscriptions;
create policy subscriptions_select_admin
on public.subscriptions
for select
using (public.is_admin());

drop policy if exists usage_events_select_admin on public.usage_events;
create policy usage_events_select_admin
on public.usage_events
for select
using (public.is_admin());

drop policy if exists system_errors_select_admin on public.system_errors;
create policy system_errors_select_admin
on public.system_errors
for select
using (public.is_admin());

