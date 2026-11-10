-- SST · surf instructors: lessons at 280 ₪, instructor gets a fixed amount per lesson
-- (100–120 ₪, per instructor), no access to therapeutic files.
-- Run once in Supabase SQL Editor.

alter type public.split_model add value if not exists 'per_lesson';
alter table public.therapists add column if not exists per_lesson_pay int check (per_lesson_pay is null or per_lesson_pay >= 0);

-- Is the signed-in user a surf instructor?
create or replace function public.is_instructor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.therapists where profile_id = auth.uid() and split::text = 'per_lesson');
$$;
revoke all on function public.is_instructor() from public;
grant execute on function public.is_instructor() to authenticated;

-- Split per session (one place for both settlement and income).
create or replace function public.staff_share(p_status public.session_status, p_price int, p_split public.split_model, p_per_lesson int)
returns int language sql immutable as $$
  select case
    when p_status <> 'held' then 0
    when p_split::text = 'full' then p_price
    when p_split::text = 'per_lesson' then least(coalesce(p_per_lesson, 100), p_price)
    else least(260, p_price)
  end;
$$;

create or replace function public.settlement_lines(p_therapist uuid, p_month date)
returns table (
  session_id uuid, starts_at timestamptz, client_short text, status public.session_status,
  price int, payment_method public.payment_method, to_therapist int, to_center int
)
language sql stable set search_path = '' as $$
  select s.id, s.starts_at,
         split_part(c.full_name, ' ', 1) ||
           case when split_part(c.full_name, ' ', 2) <> '' then ' ' || left(split_part(c.full_name, ' ', 2), 1) || '.' else '' end,
         s.status, s.price, c.payment_method,
         public.staff_share(s.status, s.price, t.split, t.per_lesson_pay),
         case
           when s.status = 'held' then s.price - public.staff_share(s.status, s.price, t.split, t.per_lesson_pay)
           when s.status = 'cancelled_late' then s.price
           else 0
         end
  from public.sessions s
  join public.clients c on c.id = s.client_id
  join public.therapists t on t.id = s.therapist_id
  where s.therapist_id = p_therapist
    and s.starts_at >= public.month_start_utc(p_month)
    and s.starts_at <  public.month_start_utc((p_month + interval '1 month')::date)
  order by s.starts_at;
$$;

-- Income now also reports surf lessons as their own income type.
drop function if exists public.monthly_income(date, date);
create function public.monthly_income(p_from date, p_to date)
returns table (month date, billed int, to_staff int, to_center int, held int, late int,
               surf_billed int, surf_center int)
language sql stable set search_path = '' as $$
  with m as (
    select generate_series(p_from, p_to, interval '1 month')::date as month
  ),
  lines as (
    select date_trunc('month', s.starts_at at time zone 'Asia/Jerusalem')::date as month,
           s.status, s.price, (t.split::text = 'per_lesson') as surf,
           case when t.split::text = 'full' then 0   -- the owner: all to the center
                else public.staff_share(s.status, s.price, t.split, t.per_lesson_pay) end as staff
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
         count(l.*) filter (where l.status = 'cancelled_late')::int,
         coalesce(sum(l.price) filter (where l.surf), 0)::int,
         coalesce(sum(l.price - l.staff) filter (where l.surf), 0)::int
  from m left join lines l on l.month = m.month
  group by m.month
  order by m.month;
$$;
grant execute on function public.monthly_income(date, date) to authenticated;

-- Instructors never see therapeutic content (files, summaries).
drop policy if exists "files: treating therapist, or owner when shared" on public.client_files;
create policy "files: treating therapist, or owner when shared" on public.client_files
  for select to authenticated
  using (not public.is_instructor() and exists (
    select 1 from public.clients c
    where c.id = client_files.client_id
      and (c.therapist_id = public.my_therapist_id()
           or (public.is_owner() and client_files.shared_with_owner))
  ));

drop policy if exists "summaries: treating therapist, or owner when shared" on public.session_summaries;
create policy "summaries: treating therapist, or owner when shared" on public.session_summaries
  for select to authenticated
  using (not public.is_instructor() and exists (
    select 1 from public.sessions s
    join public.clients c on c.id = s.client_id
    left join public.client_files f on f.client_id = c.id
    where s.id = session_summaries.session_id
      and (c.therapist_id = public.my_therapist_id()
           or (public.is_owner() and coalesce(f.shared_with_owner, false)))
  ));

drop policy if exists "summaries: treating therapist writes" on public.session_summaries;
create policy "summaries: treating therapist writes" on public.session_summaries
  for all to authenticated
  using (not public.is_instructor() and exists (
    select 1 from public.sessions s join public.clients c on c.id = s.client_id
    where s.id = session_summaries.session_id and c.therapist_id = public.my_therapist_id()))
  with check (not public.is_instructor() and exists (
    select 1 from public.sessions s join public.clients c on c.id = s.client_id
    where s.id = session_summaries.session_id and c.therapist_id = public.my_therapist_id()));
