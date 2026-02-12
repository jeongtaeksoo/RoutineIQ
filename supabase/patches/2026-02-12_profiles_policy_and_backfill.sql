-- Fix profile save failures after DB reset:
-- 1) Relax insert policy to owner-only check
-- 2) Backfill profiles for already-existing auth.users

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
with check (id = auth.uid());

insert into public.profiles (id, email, role)
select u.id, u.email, 'user'
from auth.users u
on conflict (id) do update
set email = excluded.email;
