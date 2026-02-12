-- Ensure core writes still work under user-scoped RLS fallback.
-- Apply in Supabase SQL Editor.

-- AI reports: allow owner insert/update/delete/select
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

-- usage events: allow owner read/write (needed for analyze limit + idempotent upsert fallback)
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
