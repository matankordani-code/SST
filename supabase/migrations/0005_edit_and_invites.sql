-- SST · stage 1: edit client details, invite users (therapists etc.).
-- Run once in Supabase SQL Editor.

-- ---------- Edit a client (+ payer) in one step ----------
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
  if not (public.is_owner() or exists (
    select 1 from public.clients where id = p_client_id and therapist_id = public.my_therapist_id()
  )) then
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
    v_payer := null;  -- client pays for themself
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

-- ---------- Invites: the owner opens a login for someone by email ----------
create table public.invites (
  email        text primary key check (email = lower(email)),
  role         public.app_role not null,
  full_name    text,
  therapist_id uuid references public.therapists (id) on delete cascade,
  created_at   timestamptz not null default now()
);

alter table public.invites enable row level security;
create policy "invites: owner only" on public.invites for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Login screen asks this before sending a code: may this email sign in,
-- and may a new account be created for it (only if invited)?
create or replace function public.login_allowed(p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.profiles where lower(email) = lower(trim(p_email))) then 'existing'
    when exists (select 1 from public.invites  where email = lower(trim(p_email)))          then 'invited'
    else null
  end;
$$;

-- New login account: take role / name / therapist link from the invite.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invites;
begin
  select * into v_inv from public.invites where email = lower(new.email);

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(v_inv.full_name, new.raw_user_meta_data ->> 'full_name'),
          v_inv.role);

  if v_inv.therapist_id is not null then
    update public.therapists set profile_id = new.id where id = v_inv.therapist_id;
  end if;
  if v_inv.email is not null then
    delete from public.invites where email = v_inv.email;
  end if;
  return new;
end;
$$;

-- ---------- Grants ----------
grant select, insert, update, delete on public.invites to authenticated;

revoke all on function public.update_client(uuid, text, text, text, int, int, public.payment_method, int, boolean, text, text, text) from public;
grant execute on function public.update_client(uuid, text, text, text, int, int, public.payment_method, int, boolean, text, text, text) to authenticated;

revoke all on function public.login_allowed(text) from public;
grant execute on function public.login_allowed(text) to anon, authenticated;
