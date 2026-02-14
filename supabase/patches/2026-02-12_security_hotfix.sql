-- RutineIQ P0 security hotfix
-- 1) usage_events idempotency support
alter table public.usage_events
  add column if not exists request_id text;

create unique index if not exists usage_events_user_event_date_request_uidx
  on public.usage_events (user_id, event_type, event_date, request_id);

-- 2) optional sanity check for request_id size (safe for existing null values)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usage_events_request_id_len_chk'
  ) then
    alter table public.usage_events
      add constraint usage_events_request_id_len_chk
      check (request_id is null or char_length(request_id) between 8 and 128);
  end if;
end $$;

