-- Track billing source to separate real conversion from smoke/test traffic.
alter table if exists public.subscriptions
  add column if not exists source text not null default 'unknown';

