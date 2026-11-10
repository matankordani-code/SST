-- SST · stage 1: therapists, payers, clients, personal files, access log.
-- Run once in Supabase SQL Editor.

-- ---------- Types ----------
create type public.business_status as enum ('exempt', 'licensed', 'company', 'nonprofit');
create type public.split_model     as enum ('split_260_90', 'full');
create type public.payment_method  as enum ('single', 'card4', 'card10');

-- ---------- Helpers (SECURITY DEFINER so policies don't recurse) ----------
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

-- ---------- Therapists ----------
create table public.therapists (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid unique references public.profiles (id) on delete set null,
  display_name    text not null,
  business_status public.business_status not null default 'exempt',
  split           public.split_model not null default 'split_260_90',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create or replace function public.my_therapist_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.therapists where profile_id = auth.uid();
$$;

alter table public.therapists enable row level security;

create policy "therapists: owner all, therapist self"
  on public.therapists for select to authenticated
  using (public.is_owner() or profile_id = auth.uid());

create policy "therapists: owner manages"
  on public.therapists for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------- Payers (parent or the client themself) ----------
create table public.payers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);

-- ---------- Clients (tracking data: owner sees all) ----------
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  phone            text,
  email            text,
  age              int check (age is null or age between 0 and 120),
  therapist_id     uuid not null references public.therapists (id),
  payer_id         uuid references public.payers (id),   -- null = pays for themself
  rate             int not null default 350 check (rate >= 0),
  planned_sessions int check (planned_sessions is null or planned_sessions > 0),
  payment_method   public.payment_method not null default 'single',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index clients_therapist_idx on public.clients (therapist_id);

alter table public.clients enable row level security;

create policy "clients: owner or own therapist reads"
  on public.clients for select to authenticated
  using (public.is_owner() or therapist_id = public.my_therapist_id());

-- Owner can change anything (incl. transfer). A therapist can edit own
-- clients but cannot move them to someone else.
create policy "clients: owner or own therapist updates"
  on public.clients for update to authenticated
  using (public.is_owner() or therapist_id = public.my_therapist_id())
  with check (public.is_owner() or therapist_id = public.my_therapist_id());

-- Inserts go through create_client() below.

alter table public.payers enable row level security;

create policy "payers: visible with their client"
  on public.payers for select to authenticated
  using (
    public.is_owner() or exists (
      select 1 from public.clients c
      where c.payer_id = payers.id and c.therapist_id = public.my_therapist_id()
    )
  );

create policy "payers: editable with their client"
  on public.payers for update to authenticated
  using (
    public.is_owner() or exists (
      select 1 from public.clients c
      where c.payer_id = payers.id and c.therapist_id = public.my_therapist_id()
    )
  );

-- ---------- Personal file (therapeutic: treating therapist only, owner if shared) ----------
create table public.client_files (
  client_id          uuid primary key references public.clients (id) on delete cascade,
  goal               text,
  intro              text,
  shared_with_owner  boolean not null default false,
  owner_requested_at timestamptz,
  updated_at         timestamptz not null default now()
);

alter table public.client_files enable row level security;

create policy "files: treating therapist, or owner when shared"
  on public.client_files for select to authenticated
  using (exists (
    select 1 from public.clients c
    where c.id = client_files.client_id
      and (c.therapist_id = public.my_therapist_id()
           or (public.is_owner() and client_files.shared_with_owner))
  ));

create policy "files: treating therapist edits"
  on public.client_files for update to authenticated
  using (exists (
    select 1 from public.clients c
    where c.id = client_files.client_id and c.therapist_id = public.my_therapist_id()
  ))
  with check (exists (
    select 1 from public.clients c
    where c.id = client_files.client_id and c.therapist_id = public.my_therapist_id()
  ));

-- ---------- Access log: who opened which file, when ----------
create table public.access_log (
  id        bigint generated always as identity primary key,
  user_id   uuid not null default auth.uid() references public.profiles (id),
  client_id uuid references public.clients (id) on delete set null,
  action    text not null,
  at        timestamptz not null default now()
);

alter table public.access_log enable row level security;

create policy "access_log: write own" on public.access_log for insert to authenticated
  with check (user_id = auth.uid());
create policy "access_log: owner reads" on public.access_log for select to authenticated
  using (public.is_owner());

-- ---------- RPCs ----------

-- Create a client (+ payer + empty file) in one step.
-- Therapists always create for themselves; the owner may pick a therapist.
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
  if public.is_owner() and p_therapist_id is not null then
    v_therapist := p_therapist_id;
  else
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

-- Owner asks the treating therapist to share a file.
create or replace function public.request_file_access(p_client_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  update public.client_files
     set owner_requested_at = now()
   where client_id = p_client_id and not shared_with_owner;
end;
$$;

-- Owner sees whether each file is shared / requested, without seeing its content.
create or replace function public.file_status()
returns table (client_id uuid, shared_with_owner boolean, owner_requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select f.client_id, f.shared_with_owner, f.owner_requested_at
  from public.client_files f
  where public.is_owner();
$$;

-- ---------- Grants (new projects don't grant API roles by default) ----------
grant select, insert, update on public.therapists   to authenticated;
grant select, update         on public.clients      to authenticated;
grant select, update         on public.payers       to authenticated;
grant select, update         on public.client_files to authenticated;
grant select, insert         on public.access_log   to authenticated;

revoke all on function public.is_owner(), public.my_therapist_id(),
  public.create_client(text, text, text, int, int, public.payment_method, int, text, text, text, text, text, uuid),
  public.request_file_access(uuid), public.file_status() from public;
grant execute on function public.is_owner(), public.my_therapist_id(),
  public.create_client(text, text, text, int, int, public.payment_method, int, text, text, text, text, text, uuid),
  public.request_file_access(uuid), public.file_status() to authenticated;

-- ---------- The owner is also a therapist (100% split) ----------
insert into public.therapists (profile_id, display_name, split)
select id, coalesce(full_name, 'מתניה'), 'full'
from public.profiles where role = 'owner'
on conflict (profile_id) do nothing;
