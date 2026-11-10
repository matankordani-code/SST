-- SST · client/parent portal, reminder emails, settlement reminders.
-- Run once in Supabase SQL Editor (after 0013).

-- =====================================================================
-- Client / parent portal
-- A client login is linked by email: the payer's email (a parent), or the
-- client's own email when they pay for themself. A parent sees all their
-- children. Everything goes through the functions below, which return only
-- what the portal shows (no therapeutic content).
-- =====================================================================

-- The clients this login may see. p_as: the owner previewing one client's portal.
create or replace function public.portal_client_ids(p_as uuid default null)
returns setof uuid language sql stable security definer set search_path = '' as $$
  with me as (
    select case
      when p_as is not null and public.is_owner() then (
        select lower(coalesce(p.email, c.email))
        from public.clients c left join public.payers p on p.id = c.payer_id
        where c.id = p_as)
      when p_as is null then (select lower(email) from public.profiles where id = auth.uid())
    end as email
  )
  select c.id
  from public.clients c
  left join public.payers p on p.id = c.payer_id
  cross join me
  where c.is_active
    and (
      (me.email is not null and lower(coalesce(p.email, c.email)) = me.email)
      or (p_as is not null and public.is_owner() and c.id = p_as)
    );
$$;

-- One row per child / client: next session, card balance, rate.
create or replace function public.portal_overview(p_as uuid default null)
returns table (
  client_id uuid, first_name text, therapist_name text, payment_method public.payment_method,
  rate int, next_session timestamptz, card_size int, card_used int, card_purchased_on date
)
language sql stable security definer set search_path = '' as $$
  select c.id, split_part(c.full_name, ' ', 1), t.display_name, c.payment_method, c.rate,
         (select min(s.starts_at) from public.sessions s
           where s.client_id = c.id and s.status = 'planned' and s.starts_at > now()),
         card.size, card.used, card.purchased_on
  from public.clients c
  join public.therapists t on t.id = c.therapist_id
  left join lateral (
    select pc.size, pc.purchased_on,
           pc.used_offset + (select count(*) from public.sessions s where s.punch_card_id = pc.id)::int as used
    from public.punch_cards pc
    where pc.client_id = c.id
    order by pc.purchased_on desc, pc.created_at desc
    limit 1
  ) card on true
  where c.id in (select public.portal_client_ids(p_as))
  order by c.full_name;
$$;

-- Open payment requests (links sent by the therapist, or started here).
create or replace function public.portal_open_requests(p_as uuid default null)
returns table (id uuid, client_id uuid, description text, amount int, url text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.client_id, r.description, r.amount, r.url, r.created_at
  from public.payment_requests r
  where r.status = 'open' and r.url is not null
    and r.client_id in (select public.portal_client_ids(p_as))
  order by r.created_at desc;
$$;

-- Payments made, with Morning's invoice/receipt number.
create or replace function public.portal_payments(p_as uuid default null)
returns table (paid_at timestamptz, amount int, kind public.payment_method, description text, document_number text)
language sql stable security definer set search_path = '' as $$
  select pay.paid_at, pay.amount, pay.kind, coalesce(r.description, split_part(c.full_name, ' ', 1)),
         pay.morning_document_number
  from public.payments pay
  join public.clients c on c.id = pay.client_id
  left join public.payment_requests r on r.id = pay.request_id
  where pay.client_id in (select public.portal_client_ids(p_as))
  order by pay.paid_at desc
  limit 50;
$$;

-- The client starts a payment. Amount and wording are set here, never by the caller.
create or replace function public.portal_create_request(p_client uuid, p_kind public.payment_method, p_token_hash text)
returns table (id uuid, amount int, description text, payer_name text, payer_email text, payer_phone text)
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  v_amount int;
  v_desc text;
  v_id uuid;
begin
  if p_client not in (select public.portal_client_ids(null)) then raise exception 'not allowed'; end if;
  if coalesce(length(p_token_hash), 0) <> 64 then raise exception 'bad token'; end if;

  select cl.full_name, cl.rate, cl.email, cl.phone, p.full_name as p_name, p.email as p_email, p.phone as p_phone
    into c
  from public.clients cl left join public.payers p on p.id = cl.payer_id
  where cl.id = p_client;

  v_amount := case p_kind when 'single' then c.rate when 'card4' then 1360 else 3200 end;
  v_desc := case p_kind
    when 'single' then 'מפגש טיפולי · ' || c.full_name
    when 'card4'  then 'כרטיסייה 4 · ' || c.full_name
    else               'כרטיסייה 10 · ' || c.full_name
  end;

  insert into public.payment_requests (client_id, kind, amount, description, payer_name, payer_email, notify_token_hash)
  values (p_client, p_kind, v_amount, v_desc, coalesce(c.p_name, c.full_name), coalesce(c.p_email, c.email), p_token_hash)
  returning payment_requests.id into v_id;

  return query select v_id, v_amount, v_desc, coalesce(c.p_name, c.full_name)::text,
                      coalesce(c.p_email, c.email)::text, coalesce(c.p_phone, c.phone)::text;
end;
$$;

-- Saves Morning's link on a request the client started (or cancels it if Morning failed).
create or replace function public.portal_finish_request(p_id uuid, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_requests
     set url = p_url,
         status = case when p_url is null then 'cancelled'::public.request_status else status end
   where id = p_id and url is null and status = 'open'
     and client_id in (select public.portal_client_ids(null));
end;
$$;

-- Therapist / owner opens portal access for a client's payer (or the client).
-- Returns the email to sign in with, or null if there is no email on file.
create or replace function public.invite_to_portal(p_client uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text; v_name text; v_profile uuid; v_role public.app_role;
begin
  if not exists (select 1 from public.clients where id = p_client and public.in_scope('clients', therapist_id)) then
    raise exception 'not allowed';
  end if;
  select lower(trim(coalesce(p.email, c.email))), coalesce(p.full_name, c.full_name)
    into v_email, v_name
  from public.clients c left join public.payers p on p.id = c.payer_id
  where c.id = p_client;
  if coalesce(v_email, '') = '' then return null; end if;

  select id, role into v_profile, v_role from public.profiles where lower(email) = v_email;
  if v_profile is not null then
    -- An existing login without a role becomes a client; staff keep their role.
    if v_role is null then update public.profiles set role = 'client' where id = v_profile; end if;
    return v_email;
  end if;

  insert into public.invites (email, role, full_name) values (v_email, 'client', v_name)
  on conflict (email) do nothing;
  return v_email;
end;
$$;

-- =====================================================================
-- Scheduled emails (reminders at 20:00, settlement deadlines)
-- The hourly job calls /api/cron/hourly with a secret. The app passes the
-- same secret to these functions; only its sha256 is stored here.
-- =====================================================================

create table if not exists public.email_log (
  kind     text not null,          -- 'reminder', 'settle_approve', 'settle_invoice'
  ref      text not null,          -- session id, or '<therapist id>:<month>'
  to_email text,
  sent_at  timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.email_log enable row level security;
drop policy if exists "email_log: owner reads" on public.email_log;
create policy "email_log: owner reads" on public.email_log for select to authenticated using (public.is_owner());
grant select on public.email_log to authenticated;

create or replace function public.cron_ok(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token), 0) >= 32 and exists (
    select 1 from public.app_settings
    where key = 'cron_token_hash' and value #>> '{}' = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'));
$$;

-- Planned sessions on p_day (Israel date) whose reminder wasn't sent yet.
-- Only time, therapist and first name: no therapeutic content in emails.
create or replace function public.cron_session_reminders(p_token text, p_day date)
returns table (session_id uuid, starts_at timestamptz, client_first text, therapist_name text,
               to_email text, to_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.starts_at, split_part(c.full_name, ' ', 1), t.display_name,
         coalesce(p.email, c.email), coalesce(p.full_name, c.full_name)
  from public.sessions s
  join public.clients c on c.id = s.client_id
  left join public.payers p on p.id = c.payer_id
  join public.therapists t on t.id = s.therapist_id
  where public.cron_ok(p_token)
    and s.status = 'planned'
    and s.starts_at >= (p_day::timestamp at time zone 'Asia/Jerusalem')
    and s.starts_at <  ((p_day + 1)::timestamp at time zone 'Asia/Jerusalem')
    and coalesce(p.email, c.email) is not null
    and not exists (select 1 from public.email_log l where l.kind = 'reminder' and l.ref = s.id::text)
  order by s.starts_at;
$$;

-- Therapists who missed a settlement step for p_month (exempt: the owner's own 100% split).
--   stage 'approve': had sessions that month and hasn't approved
--   stage 'invoice': approved but no invoice uploaded
create or replace function public.cron_settlement_reminders(p_token text, p_month date)
returns table (therapist_id uuid, therapist_name text, to_email text, stage text, amount int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.display_name,
         coalesce(pr.email, (select i.email from public.invites i where i.therapist_id = t.id limit 1)),
         case when st.status = 'approved' then 'invoice' else 'approve' end,
         st.therapist_amount
  from public.therapists t
  left join public.profiles pr on pr.id = t.profile_id
  left join public.settlements st on st.therapist_id = t.id and st.month = p_month
  where public.cron_ok(p_token)
    and t.is_active and t.split::text <> 'full'
    and coalesce(st.status::text, 'open') in ('open', 'approved')
    and exists (
      select 1 from public.sessions s
      where s.therapist_id = t.id
        and s.starts_at >= public.month_start_utc(p_month)
        and s.starts_at <  public.month_start_utc((p_month + interval '1 month')::date))
    and coalesce(pr.email, (select i.email from public.invites i where i.therapist_id = t.id limit 1)) is not null;
$$;

-- Already sent? (so each reminder goes out once)
create or replace function public.cron_was_sent(p_token text, p_kind text, p_ref text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.cron_ok(p_token) and exists (select 1 from public.email_log where kind = p_kind and ref = p_ref);
$$;

create or replace function public.cron_mark_sent(p_token text, p_kind text, p_ref text, p_to text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.cron_ok(p_token) then raise exception 'not allowed'; end if;
  insert into public.email_log (kind, ref, to_email) values (p_kind, p_ref, p_to)
  on conflict (kind, ref) do nothing;
end;
$$;

-- ---------- Grants ----------
revoke all on function public.portal_client_ids(uuid), public.portal_overview(uuid),
  public.portal_open_requests(uuid), public.portal_payments(uuid),
  public.portal_create_request(uuid, public.payment_method, text), public.portal_finish_request(uuid, text),
  public.invite_to_portal(uuid), public.cron_ok(text),
  public.cron_session_reminders(text, date), public.cron_settlement_reminders(text, date),
  public.cron_was_sent(text, text, text), public.cron_mark_sent(text, text, text, text) from public;
grant execute on function public.portal_client_ids(uuid), public.portal_overview(uuid),
  public.portal_open_requests(uuid), public.portal_payments(uuid),
  public.portal_create_request(uuid, public.payment_method, text), public.portal_finish_request(uuid, text),
  public.invite_to_portal(uuid) to authenticated;
-- The scheduled job has no login: it proves itself with the secret.
grant execute on function public.cron_session_reminders(text, date), public.cron_settlement_reminders(text, date),
  public.cron_was_sent(text, text, text), public.cron_mark_sent(text, text, text, text) to anon, authenticated;
