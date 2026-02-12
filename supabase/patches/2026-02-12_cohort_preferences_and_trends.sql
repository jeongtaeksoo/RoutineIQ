-- RoutineIQ cohort preferences + trend aggregation
-- Run this in Supabase SQL Editor.

alter table public.profiles
  add column if not exists age_group text not null default 'unknown',
  add column if not exists gender text not null default 'unknown',
  add column if not exists job_family text not null default 'unknown',
  add column if not exists work_mode text not null default 'unknown',
  add column if not exists chronotype text not null default 'unknown',
  add column if not exists trend_opt_in boolean not null default false,
  add column if not exists trend_compare_by text[] not null default array['age_group', 'job_family', 'work_mode']::text[],
  add column if not exists goal_keyword text,
  add column if not exists goal_minutes_per_day int;

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
end $$;

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

create index if not exists profiles_trend_filter_idx
on public.profiles (trend_opt_in, age_group, gender, job_family, work_mode, chronotype);
