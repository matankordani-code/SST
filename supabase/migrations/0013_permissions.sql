-- SST · permissions board: role templates + per-person exceptions.
-- Run once in Supabase SQL Editor (after 0001–0012).
--
-- Each permission has a level: 0 = none, 1 = own only, 2 = everything.
-- A person's level = their own exception if set, else their role's default.
-- The owner always has everything, and only the owner edits permissions.
-- Therapeutic files and session summaries are NOT on the board: they stay
-- with the treating therapist, and open to the owner only when shared.

-- ---------- Tables ----------
create table public.role_permissions (
  role  public.app_role not null,
  perm  text not null check (perm in ('clients', 'calendar', 'settlements', 'transfer', 'income', 'club', 'staff')),
  level smallint not null check (level between 0 and 2),
  primary key (role, perm)
);

create table public.user_permissions (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  perm       text not null check (perm in ('clients', 'calendar', 'settlements', 'transfer', 'income', 'club', 'staff')),
  level      smallint not null check (level between 0 and 2),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, perm)
);

-- Defaults = what each role could do before this migration.
insert into public.role_permissions (role, perm, level) values
  ('club_manager',    'club',        2),
  ('therapist',       'clients',     1),
  ('therapist',       'calendar',    1),
  ('therapist',       'settlements', 1),
  ('surf_instructor', 'clients',     1),
  ('surf_instructor', 'calendar',    1),
  ('surf_instructor', 'settlements', 1)
on conflict do nothing;

alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;
create policy "role_permissions: owner reads" on public.role_permissions for select to authenticated using (public.is_owner());
create policy "user_permissions: owner reads" on public.user_permissions for select to authenticated using (public.is_owner());
grant select on public.role_permissions, public.user_permissions to authenticated;

-- ---------- Checks (SECURITY DEFINER so policies don't recurse) ----------
create or replace function public.perm_level(p_perm text)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when p.role = 'owner' then 2 else coalesce(u.level, r.level, 0) end
    from public.profiles p
    left join public.user_permissions u on u.user_id = p.id and u.perm = p_perm
    left join public.role_permissions r on r.role = p.role and r.perm = p_perm
    where p.id = auth.uid()
  ), 0);
$$;

create or replace function public.can(p_perm text, p_level int default 1)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.perm_level(p_perm) >= p_level;
$$;

-- Row of therapist p_therapist: allowed at level 2, or at level 1 when it is my own.
create or replace function public.in_scope(p_perm text, p_therapist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case public.perm_level(p_perm)
    when 2 then true
    when 1 then p_therapist is not null and p_therapist = public.my_therapist_id()
    else false
  end;
$$;

-- Who may see the list of all therapists (names, for filters and tables).
create or replace function public.sees_all_therapists()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_owner()
      or public.can('clients', 2) or public.can('calendar', 2) or public.can('settlements', 2)
      or public.can('income', 2) or public.can('staff', 2) or public.can('transfer', 2);
$$;

-- All my levels at once, for the screens.
create or replace function public.my_permissions()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(k, public.perm_level(k))
  from unnest(array['clients', 'calendar', 'settlements', 'transfer', 'income', 'club', 'staff']) as k;
$$;

-- ---------- Owner edits the board ----------
-- p_level null = back to the role's default.
create or replace function public.set_user_permission(p_user uuid, p_perm text, p_level int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.app_role; v_email text;
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if p_perm not in ('clients', 'calendar', 'settlements', 'transfer', 'income', 'club', 'staff') then
    raise exception 'bad permission';
  end if;
  if p_level is not null and (p_level not between 0 and 2
     or (p_level = 1 and p_perm not in ('clients', 'calendar', 'settlements'))) then
    raise exception 'bad level';
  end if;
  select role, email into v_role, v_email from public.profiles where id = p_user;
  if v_role = 'owner' then raise exception 'owner has everything'; end if;

  if p_level is null then
    delete from public.user_permissions where user_id = p_user and perm = p_perm;
  else
    insert into public.user_permissions (user_id, perm, level)
    values (p_user, p_perm, p_level)
    on conflict (user_id, perm) do update set level = excluded.level, updated_by = auth.uid(), updated_at = now();
  end if;

  insert into public.access_log (user_id, action)
  values (auth.uid(), format('permission %s %s=%s', coalesce(v_email, p_user::text), p_perm, coalesce(p_level::text, 'default')));
end;
$$;

create or replace function public.reset_user_permissions(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  delete from public.user_permissions where user_id = p_user;
  select email into v_email from public.profiles where id = p_user;
  insert into public.access_log (user_id, action)
  values (auth.uid(), format('permission %s reset', coalesce(v_email, p_user::text)));
end;
$$;

create or replace function public.set_role_permission(p_role public.app_role, p_perm text, p_level int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if p_role = 'owner' then raise exception 'owner has everything'; end if;
  if p_perm not in ('clients', 'calendar', 'settlements', 'transfer', 'income', 'club', 'staff') then
    raise exception 'bad permission';
  end if;
  if p_level not between 0 and 2 or (p_level = 1 and p_perm not in ('clients', 'calendar', 'settlements')) then
    raise exception 'bad level';
  end if;

  insert into public.role_permissions (role, perm, level) values (p_role, p_perm, p_level)
  on conflict (role, perm) do update set level = excluded.level;

  insert into public.access_log (user_id, action)
  values (auth.uid(), format('permission role %s %s=%s', p_role, p_perm, p_level));
end;
$$;

-- ---------- Profiles ----------
drop policy if exists "profiles: read own or owner reads all" on public.profiles;
create policy "profiles: read own, owner or staff managers read all" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_owner() or public.can('staff', 2));

-- ---------- Therapists ----------
drop policy if exists "therapists: owner all, therapist self" on public.therapists;
drop policy if exists "therapists: owner manages" on public.therapists;
create policy "therapists: self, or anyone with a wide view" on public.therapists
  for select to authenticated
  using (profile_id = auth.uid() or public.sees_all_therapists());
create policy "therapists: staff managers manage" on public.therapists
  for all to authenticated
  using (public.can('staff', 2)) with check (public.can('staff', 2));

-- ---------- Clients & payers ----------
drop policy if exists "clients: owner or own therapist reads" on public.clients;
drop policy if exists "clients: owner or own therapist updates" on public.clients;
create policy "clients: in scope reads" on public.clients
  for select to authenticated
  using (public.in_scope('clients', therapist_id));
create policy "clients: in scope updates" on public.clients
  for update to authenticated
  using (public.in_scope('clients', therapist_id))
  with check (public.in_scope('clients', therapist_id));

-- Moving a client to another therapist needs the "transfer" permission.
create or replace function public.clients_guard_transfer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.therapist_id is distinct from old.therapist_id
     and not public.can('transfer', 2) then
    raise exception 'transfer not allowed';
  end if;
  return new;
end;
$$;
drop trigger if exists clients_guard_transfer on public.clients;
create trigger clients_guard_transfer
  before update of therapist_id on public.clients
  for each row execute function public.clients_guard_transfer();

drop policy if exists "payers: visible with their client" on public.payers;
drop policy if exists "payers: editable with their client" on public.payers;
create policy "payers: visible with their client" on public.payers
  for select to authenticated
  using (exists (select 1 from public.clients c
                 where c.payer_id = payers.id and public.in_scope('clients', c.therapist_id)));
create policy "payers: editable with their client" on public.payers
  for update to authenticated
  using (exists (select 1 from public.clients c
                 where c.payer_id = payers.id and public.in_scope('clients', c.therapist_id)));

create or replace function public.create_client(
  p_full_name        text,
  p_phone            text,
  p_email            text,
  p_age              int,
  p_planned_sessions int,
  p_payment_method   public.payment_method,
  p_rate             int,
  p_goal             text,
  p_intro            text,
  p_payer_name       text,
  p_payer_phone      text,
  p_payer_email      text,
  p_therapist_id     uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_therapist uuid;
  v_payer     uuid;
  v_client    uuid;
begin
  if public.can('clients', 2) and p_therapist_id is not null then
    v_therapist := p_therapist_id;
  elsif public.can('clients', 1) then
    v_therapist := public.my_therapist_id();
  end if;
  if v_therapist is null then
    raise exception 'not allowed';
  end if;

  if coalesce(trim(p_payer_name), '') <> '' then
    insert into public.payers (full_name, phone, email)
    values (trim(p_payer_name), nullif(trim(p_payer_phone), ''), nullif(trim(p_payer_email), ''))
    returning id into v_payer;
  end if;

  insert into public.clients
    (full_name, phone, email, age, therapist_id, payer_id, rate, planned_sessions, payment_method)
  values
    (trim(p_full_name), nullif(trim(p_phone), ''), nullif(trim(p_email), ''), p_age,
     v_therapist, v_payer, coalesce(p_rate, 350), p_planned_sessions, coalesce(p_payment_method, 'single'))
  returning id into v_client;

  insert into public.client_files (client_id, goal, intro)
  values (v_client, nullif(trim(p_goal), ''), nullif(trim(p_intro), ''));

  return v_client;
end;
$$;

create or replace function public.update_client(
  p_client_id        uuid,
  p_full_name        text,
  p_phone            text,
  p_email            text,
  p_age              int,
  p_planned_sessions int,
  p_payment_method   public.payment_method,
  p_rate             int,
  p_payer_other      boolean,
  p_payer_name       text,
  p_payer_phone      text,
  p_payer_email      text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_payer uuid;
begin
  if not exists (
    select 1 from public.clients where id = p_client_id and public.in_scope('clients', therapist_id)
  ) then
    raise exception 'not allowed';
  end if;

  select payer_id into v_payer from public.clients where id = p_client_id;

  if p_payer_other and coalesce(trim(p_payer_name), '') <> '' then
    if v_payer is null then
      insert into public.payers (full_name, phone, email)
      values (trim(p_payer_name), nullif(trim(p_payer_phone), ''), nullif(trim(p_payer_email), ''))
      returning id into v_payer;
    else
      update public.payers
         set full_name = trim(p_payer_name),
             phone = nullif(trim(p_payer_phone), ''),
             email = nullif(trim(p_payer_email), '')
       where id = v_payer;
    end if;
  else
    v_payer := null;
  end if;

  update public.clients set
    full_name        = trim(p_full_name),
    phone            = nullif(trim(p_phone), ''),
    email            = nullif(trim(p_email), ''),
    age              = p_age,
    planned_sessions = p_planned_sessions,
    payment_method   = p_payment_method,
    rate             = coalesce(p_rate, rate),
    payer_id         = v_payer
  where id = p_client_id;
end;
$$;

-- ---------- Punch cards, payment requests, payments, declarations ----------
drop policy if exists "cards: owner or treating therapist" on public.punch_cards;
drop policy if exists "cards: owner or treating therapist records" on public.punch_cards;
create policy "cards: client in scope" on public.punch_cards
  for select to authenticated
  using (exists (select 1 from public.clients c
                 where c.id = punch_cards.client_id and public.in_scope('clients', c.therapist_id)));
create policy "cards: client in scope records" on public.punch_cards
  for insert to authenticated
  with check (exists (select 1 from public.clients c
                      where c.id = punch_cards.client_id and public.in_scope('clients', c.therapist_id)));

drop policy if exists "requests: owner or treating therapist" on public.payment_requests;
drop policy if exists "requests: create for own clients" on public.payment_requests;
drop policy if exists "requests: update own (url / cancel)" on public.payment_requests;
create policy "requests: client in scope" on public.payment_requests
  for select to authenticated
  using (exists (select 1 from public.clients c
                 where c.id = payment_requests.client_id and public.in_scope('clients', c.therapist_id)));
create policy "requests: create for clients in scope" on public.payment_requests
  for insert to authenticated
  with check (exists (select 1 from public.clients c
                      where c.id = payment_requests.client_id and public.in_scope('clients', c.therapist_id)));
create policy "requests: update in scope (url / cancel)" on public.payment_requests
  for update to authenticated
  using (exists (select 1 from public.clients c
                 where c.id = payment_requests.client_id and public.in_scope('clients', c.therapist_id)));

drop policy if exists "payments: owner or treating therapist" on public.payments;
create policy "payments: client in scope" on public.payments
  for select to authenticated
  using (exists (select 1 from public.clients c
                 where c.id = payments.client_id and public.in_scope('clients', c.therapist_id)));

-- Health data: never surf instructors.
drop policy if exists "declarations: owner or treating therapist" on public.declarations;
drop policy if exists "declarations: create for own clients" on public.declarations;
create policy "declarations: client in scope" on public.declarations
  for select to authenticated
  using (not public.is_instructor() and exists (
    select 1 from public.clients c
    where c.id = declarations.client_id and public.in_scope('clients', c.therapist_id)));
create policy "declarations: create for clients in scope" on public.declarations
  for insert to authenticated
  with check (exists (select 1 from public.clients c
                      where c.id = declarations.client_id and public.in_scope('clients', c.therapist_id)));

-- ---------- Sessions (calendar) ----------
drop policy if exists "sessions: owner all, therapist own" on public.sessions;
drop policy if exists "sessions: book for own clients" on public.sessions;
drop policy if exists "sessions: report own" on public.sessions;
drop policy if exists "sessions: delete planned" on public.sessions;
create policy "sessions: calendar in scope reads" on public.sessions
  for select to authenticated using (public.in_scope('calendar', therapist_id));
create policy "sessions: calendar in scope books" on public.sessions
  for insert to authenticated with check (public.in_scope('calendar', therapist_id));
create policy "sessions: calendar in scope reports" on public.sessions
  for update to authenticated
  using (public.in_scope('calendar', therapist_id))
  with check (public.in_scope('calendar', therapist_id));
create policy "sessions: calendar in scope deletes planned" on public.sessions
  for delete to authenticated
  using (status = 'planned' and public.in_scope('calendar', therapist_id));

-- ---------- Settlements ----------
drop policy if exists "settlements: owner or own" on public.settlements;
create policy "settlements: in scope" on public.settlements
  for select to authenticated using (public.in_scope('settlements', therapist_id));

-- Lines now follow the settlements permission, not the calendar one.
create or replace function public.settlement_lines(p_therapist uuid, p_month date)
returns table (
  session_id uuid, starts_at timestamptz, client_short text, status public.session_status,
  price int, payment_method public.payment_method, to_therapist int, to_center int
)
language sql stable security definer set search_path = '' as $$
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
  where public.in_scope('settlements', p_therapist)
    and s.therapist_id = p_therapist
    and s.starts_at >= public.month_start_utc(p_month)
    and s.starts_at <  public.month_start_utc((p_month + interval '1 month')::date)
  order by s.starts_at;
$$;

create or replace function public.approve_settlement(p_therapist uuid, p_month date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_open int; v_held int; v_canc int; v_t int; v_c int; v_status public.settlement_status;
begin
  if not public.in_scope('settlements', p_therapist) then raise exception 'not allowed'; end if;

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

create or replace function public.submit_settlement_invoice(p_therapist uuid, p_month date, p_path text, p_amount int)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.in_scope('settlements', p_therapist) then raise exception 'not allowed'; end if;
  if p_path not like p_therapist::text || '/%' then raise exception 'bad path'; end if;
  update public.settlements
     set invoice_path = p_path, invoice_amount = p_amount, invoice_uploaded_at = now(), status = 'invoiced'
   where therapist_id = p_therapist and month = p_month and status in ('approved', 'invoiced');
  return case when found then 'ok' else 'not_approved' end;
end;
$$;

create or replace function public.set_settlement_status(p_therapist uuid, p_month date, p_status public.settlement_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can('settlements', 2) then raise exception 'not allowed'; end if;
  update public.settlements
     set status = p_status,
         closed_at = case when p_status = 'closed' then now() else null end
   where therapist_id = p_therapist and month = p_month;
end;
$$;

-- Approved months: only someone who manages all settlements can change their sessions.
create or replace function public.sessions_month_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if public.can('settlements', 2) then return coalesce(new, old); end if;
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

drop policy if exists "invoices: therapist uploads own folder" on storage.objects;
drop policy if exists "invoices: owner or own folder reads" on storage.objects;
create policy "invoices: therapist uploads own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and public.can('settlements', 1)
              and (storage.foldername(name))[1] = public.my_therapist_id()::text);
create policy "invoices: all-settlements or own folder reads" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and (public.can('settlements', 2)
         or (public.can('settlements', 1) and (storage.foldername(name))[1] = public.my_therapist_id()::text)));

-- ---------- Income ----------
create or replace function public.monthly_income(p_from date, p_to date)
returns table (month date, billed int, to_staff int, to_center int, held int, late int,
               surf_billed int, surf_center int)
language sql stable security definer set search_path = '' as $$
  with m as (
    select generate_series(p_from, p_to, interval '1 month')::date as month
  ),
  lines as (
    select date_trunc('month', s.starts_at at time zone 'Asia/Jerusalem')::date as month,
           s.status, s.price, (t.split::text = 'per_lesson') as surf,
           case when t.split::text = 'full' then 0
                else public.staff_share(s.status, s.price, t.split, t.per_lesson_pay) end as staff
    from public.sessions s
    join public.therapists t on t.id = s.therapist_id
    where public.can('income', 2)
      and s.status in ('held', 'cancelled_late')
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

-- Accountant export: every reported session of a period.
create or replace function public.income_sessions(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, status public.session_status, price int,
               client_name text, payment_method public.payment_method,
               therapist_name text, split text, per_lesson_pay int)
language sql stable security definer set search_path = '' as $$
  select s.starts_at, s.status, s.price, c.full_name, c.payment_method,
         t.display_name, t.split::text, t.per_lesson_pay
  from public.sessions s
  join public.clients c on c.id = s.client_id
  join public.therapists t on t.id = s.therapist_id
  where public.can('income', 2)
    and s.status in ('held', 'cancelled_late')
    and s.starts_at >= p_from and s.starts_at < p_to
  order by s.starts_at;
$$;

drop policy if exists "settings: owner writes" on public.app_settings;
create policy "settings: staff managers write, income managers set costs" on public.app_settings
  for all to authenticated
  using (public.can('staff', 2) or (key = 'monthly_costs' and public.can('income', 2)))
  with check (public.can('staff', 2) or (key = 'monthly_costs' and public.can('income', 2)));

-- ---------- Club ----------
create or replace function public.is_club_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can('club', 2);
$$;

-- ---------- Invites: nobody but the owner may invite another owner ----------
drop policy if exists "invites: owner, or staff for members" on public.invites;
create policy "invites: owner, staff managers, or club staff for members" on public.invites
  for all to authenticated
  using (public.is_owner() or (public.can('staff', 2) and role <> 'owner')
         or (public.is_club_staff() and role = 'member'))
  with check (public.is_owner() or (public.can('staff', 2) and role <> 'owner')
              or (public.is_club_staff() and role = 'member'));

-- ---------- Grants ----------
revoke all on function public.perm_level(text), public.can(text, int), public.in_scope(text, uuid),
  public.sees_all_therapists(), public.my_permissions(),
  public.set_user_permission(uuid, text, int), public.reset_user_permissions(uuid),
  public.set_role_permission(public.app_role, text, int),
  public.income_sessions(timestamptz, timestamptz) from public;
grant execute on function public.perm_level(text), public.can(text, int), public.in_scope(text, uuid),
  public.sees_all_therapists(), public.my_permissions(),
  public.set_user_permission(uuid, text, int), public.reset_user_permissions(uuid),
  public.set_role_permission(public.app_role, text, int),
  public.income_sessions(timestamptz, timestamptz) to authenticated;
grant execute on function public.settlement_lines(uuid, date), public.monthly_income(date, date) to authenticated;
