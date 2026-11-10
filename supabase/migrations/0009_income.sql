-- SST · income dashboard: monthly income and break-even settings.
-- Run once in Supabase SQL Editor.

-- Owner-editable settings (monthly fixed costs for the break-even gauge, texts, ...).
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "settings: authenticated read" on public.app_settings for select to authenticated using (true);
create policy "settings: owner writes" on public.app_settings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update on public.app_settings to authenticated;

insert into public.app_settings (key, value) values ('monthly_costs', '0') on conflict do nothing;

-- Income per month, from reported sessions (prices include VAT).
--   billed     = what clients are charged (held + late-cancelled)
--   to_staff   = what therapists/instructors get
--   to_center  = what stays with the center (incl. the owner's own sessions)
create or replace function public.monthly_income(p_from date, p_to date)
returns table (month date, billed int, to_staff int, to_center int, held int, late int)
language sql stable set search_path = '' as $$
  with m as (
    select generate_series(p_from, p_to, interval '1 month')::date as month
  ),
  lines as (
    select date_trunc('month', s.starts_at at time zone 'Asia/Jerusalem')::date as month,
           s.status, s.price, t.split,
           case
             when s.status = 'held' and t.split = 'full' then 0          -- the owner: all to the center
             when s.status = 'held' then least(260, s.price)
             else 0
           end as staff
    from public.sessions s
    join public.therapists t on t.id = s.therapist_id
    where s.status in ('held', 'cancelled_late')
      and s.starts_at >= public.month_start_utc(p_from)
      and s.starts_at <  public.month_start_utc((p_to + interval '1 month')::date)
  )
  select m.month,
         coalesce(sum(l.price), 0)::int,
         coalesce(sum(l.staff), 0)::int,
         coalesce(sum(l.price - l.staff), 0)::int,
         count(l.*) filter (where l.status = 'held')::int,
         count(l.*) filter (where l.status = 'cancelled_late')::int
  from m left join lines l on l.month = m.month
  group by m.month
  order by m.month;
$$;

grant execute on function public.monthly_income(date, date) to authenticated;
