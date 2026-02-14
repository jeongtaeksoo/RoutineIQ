-- RutineIQ streak tracking fields on profiles
alter table public.profiles
  add column if not exists current_streak int not null default 0,
  add column if not exists longest_streak int not null default 0;

do $$
begin
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
