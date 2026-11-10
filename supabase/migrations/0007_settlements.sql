-- SST · monthly settlement with therapists (260/90).
-- Run once in Supabase SQL Editor.

create type public.settlement_status as enum ('open', 'approved', 'invoiced', 'closed');

create table public.settlements (
  id                  uuid primary key default gen_random_uuid(),
  therapist_id        uuid not null references public.therapists (id) on delete cascade,
  month               date not null check (extract(day from month) = 1),
  status              public.settlement_status not null default 'open',
  sessions_held       int,
  sessions_cancelled  int,
  therapist_amount    int,
  center_amount       int,
  approved_at         timestamptz,
  invoice_path        text,       -- storage: invoices/<therapist_id>/<file>
  invoice_amount      int,
  invoice_uploaded_at timestamptz,
  closed_at           timestamptz,
  unique (therapist_id, month)
);

alter table public.settlements enable row level security;
create policy "settlements: owner or own" on public.settlements for select to authenticated
  using (public.is_owner() or therapist_id = public.my_therapist_id());

-- Month boundaries in Israel time.
create or replace function public.month_start_utc(p_month date)
returns timestamptz language sql immutable as $$
  select (p_month::timestamp) at time zone 'Asia/Jerusalem';
$$;

-- One line per session of a therapist in a month, with the split.
-- SECURITY INVOKER: RLS decides who sees which sessions.
create or replace function public.settlement_lines(p_therapist uuid, p_month date)
returns table (
  session_id     uuid,
  starts_at      timestamptz,
  client_short   text,
  status         public.session_status,
  price          int,
  payment_method public.payment_method,
  to_therapist   int,
  to_center      int
)
language sql stable set search_path = '' as $$
  select s.id, s.starts_at,
         split_part(c.full_name, ' ', 1) ||
           case when split_part(c.full_name, ' ', 2) <> '' then ' ' || left(split_part(c.full_name, ' ', 2), 1) || '.' else '' end,
         s.status, s.price, c.payment_method,
         case
           when s.status = 'held' and t.split = 'full' then s.price
           when s.status = 'held' then least(260, s.price)
           else 0
         end,
         case
           when s.status = 'held' and t.split = 'full' then 0
           when s.status = 'held' then s.price - least(260, s.price)
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

-- Therapist (or owner) approves the month: snapshot totals, lock the month.
create or replace function public.approve_settlement(p_therapist uuid, p_month date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_open int; v_held int; v_canc int; v_t int; v_c int; v_status public.settlement_status;
begin
  if not (public.is_owner() or p_therapist = public.my_therapist_id()) then raise exception 'not allowed'; end if;

  select status into v_status from public.settlements where therapist_id = p_therapist and month = p_month;
  if v_status is not null and v_status <> 'open' then return 'already'; end if;

  select count(*) into v_open from public.sessions
   where therapist_id = p_therapist and status = 'planned'
     and starts_at >= public.month_start_utc(p_month)
     and starts_at <  public.month_start_utc((p_month + interval '1 month')::date);
  if v_open > 0 then return 'unreported'; end if;

  select count(*) filter (where status = 'held'),
         count(*) filter (where status in ('cancelled_ontime', 'cancelled_late')),
         coalesce(sum(to_therapist), 0), coalesce(sum(to_center), 0)
    into v_held, v_canc, v_t, v_c
  from public.settlement_lines(p_therapist, p_month);

  insert into public.settlements (therapist_id, month, status, sessions_held, sessions_cancelled,
                                  therapist_amount, center_amount, approved_at)
  values (p_therapist, p_month, 'approved', v_held, v_canc, v_t, v_c, now())
  on conflict (therapist_id, month) do update set
    status = 'approved', sessions_held = excluded.sessions_held, sessions_cancelled = excluded.sessions_cancelled,
    therapist_amount = excluded.therapist_amount, center_amount = excluded.center_amount, approved_at = now();
  return 'ok';
end;
$$;

-- Therapist attaches the invoice they issued to the center.
create or replace function public.submit_settlement_invoice(p_therapist uuid, p_month date, p_path text, p_amount int)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_owner() or p_therapist = public.my_therapist_id()) then raise exception 'not allowed'; end if;
  if p_path not like p_therapist::text || '/%' then raise exception 'bad path'; end if;
  update public.settlements
     set invoice_path = p_path, invoice_amount = p_amount, invoice_uploaded_at = now(), status = 'invoiced'
   where therapist_id = p_therapist and month = p_month and status in ('approved', 'invoiced');
  return case when found then 'ok' else 'not_approved' end;
end;
$$;

-- Owner: reopen (fix a report) or close (paid) a month.
create or replace function public.set_settlement_status(p_therapist uuid, p_month date, p_status public.settlement_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  update public.settlements
     set status = p_status,
         closed_at = case when p_status = 'closed' then now() else null end
   where therapist_id = p_therapist and month = p_month;
end;
$$;

-- Lock: once a month is approved, only the owner can change its sessions.
create or replace function public.sessions_month_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if public.is_owner() then return coalesce(new, old); end if;
  for r in
    select x.tid, x.ts from (values (old.therapist_id, old.starts_at), (new.therapist_id, new.starts_at)) as x(tid, ts)
    where x.tid is not null
  loop
    if exists (
      select 1 from public.settlements st
      where st.therapist_id = r.tid and st.status <> 'open'
        and st.month = date_trunc('month', r.ts at time zone 'Asia/Jerusalem')::date
    ) then
      raise exception 'month locked';
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;

create trigger sessions_month_lock
  before insert or update or delete on public.sessions
  for each row execute function public.sessions_month_lock();

-- ---------- Invoice files (private bucket) ----------
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "invoices: therapist uploads own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = public.my_therapist_id()::text);

create policy "invoices: owner or own folder reads" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and (public.is_owner() or (storage.foldername(name))[1] = public.my_therapist_id()::text));

-- ---------- Grants ----------
grant select on public.settlements to authenticated;
grant execute on function public.settlement_lines(uuid, date) to authenticated;
revoke all on function public.approve_settlement(uuid, date) from public;
revoke all on function public.submit_settlement_invoice(uuid, date, text, int) from public;
revoke all on function public.set_settlement_status(uuid, date, public.settlement_status) from public;
grant execute on function public.approve_settlement(uuid, date) to authenticated;
grant execute on function public.submit_settlement_invoice(uuid, date, text, int) to authenticated;
grant execute on function public.set_settlement_status(uuid, date, public.settlement_status) to authenticated;
