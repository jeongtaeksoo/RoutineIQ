-- RutineIQ optional daily wellbeing/meta signals on activity logs.
alter table public.activity_logs
  add column if not exists meta jsonb not null default '{}'::jsonb;
