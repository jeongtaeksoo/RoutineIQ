-- Expand profile enum checks for new preference options.
-- Run this on existing projects where constraints already exist.

alter table public.profiles
  drop constraint if exists profiles_age_group_chk;

alter table public.profiles
  add constraint profiles_age_group_chk
  check (age_group in ('0_17', '18_24', '25_34', '35_44', '45_plus', 'unknown'));

alter table public.profiles
  drop constraint if exists profiles_job_family_chk;

alter table public.profiles
  add constraint profiles_job_family_chk
  check (job_family in ('engineering', 'professional', 'design', 'marketing', 'sales', 'operations', 'student', 'creator', 'other', 'unknown'));
