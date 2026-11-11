-- SST · income by source, as in the prototype's dashboard.
-- Run once in Supabase SQL Editor (after 0016).
--
-- Money in, per month (prices include VAT):
--   single_billed : held + late-cancelled sessions of clients who pay per session
--   card_sales    : punch cards bought that month (imported cards excluded:
--                   they were paid before the system)
--   to_staff      : what therapists / instructors earn from held sessions
-- A session paid by punch card is income when the card is bought, not when held.

create or replace function public.income_sources(p_from date, p_to date)
returns table (month date, single_billed int, single_count int, card_sales int, card_count int,
               to_staff int, held int)
language sql stable security definer set search_path = '' as $$
  with m as (
    select generate_series(p_from, p_to, interval '1 month')::date as month
  ),
  s as (
    select date_trunc('month', s.starts_at at time zone 'Asia/Jerusalem')::date as month,
           s.status, s.price, c.payment_method,
           case when t.split::text = 'full' then 0
                else public.staff_share(s.status, s.price, t.split, t.per_lesson_pay) end as staff
    from public.sessions s
    join public.clients c on c.id = s.client_id
    join public.therapists t on t.id = s.therapist_id
    where public.can('income', 2)
      and s.status in ('held', 'cancelled_late')
      and s.starts_at >= public.month_start_utc(p_from)
      and s.starts_at <  public.month_start_utc((p_to + interval '1 month')::date)
  ),
  k as (
    select date_trunc('month', pc.purchased_on)::date as month, pc.amount_paid
    from public.punch_cards pc
    where public.can('income', 2)
      and coalesce(pc.paid_note, '') <> 'ייבוא מהאקסל'
      and pc.purchased_on >= p_from
      and pc.purchased_on <  (p_to + interval '1 month')::date
  )
  select m.month,
         coalesce((select sum(price) from s where s.month = m.month and s.payment_method = 'single'), 0)::int,
         coalesce((select count(*) from s where s.month = m.month and s.payment_method = 'single'), 0)::int,
         coalesce((select sum(amount_paid) from k where k.month = m.month), 0)::int,
         coalesce((select count(*) from k where k.month = m.month), 0)::int,
         coalesce((select sum(staff) from s where s.month = m.month), 0)::int,
         coalesce((select count(*) from s where s.month = m.month and s.status = 'held'), 0)::int
  from m
  order by m.month;
$$;

revoke all on function public.income_sources(date, date) from public;
grant execute on function public.income_sources(date, date) to authenticated;
