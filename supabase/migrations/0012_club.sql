-- SST · community club: weekly trainings, members, registration with waitlist, attendance.
-- Run once in Supabase SQL Editor.

create or replace function public.is_club_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'club_manager'));
$$;

-- ---------- Members ----------
create type public.member_plan as enum ('community', 'storage');

create table public.members (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name  text not null,
  phone      text,
  email      text,
  plan       public.member_plan not null default 'community',
  is_active  boolean not null default true,
  joined_on  date not null default current_date,
  created_at timestamptz not null default now()
);

create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.members where profile_id = auth.uid();
$$;

alter table public.members enable row level security;
create policy "members: staff all, member self" on public.members for select to authenticated
  using (public.is_club_staff() or profile_id = auth.uid());
create policy "members: staff manages" on public.members for all to authenticated
  using (public.is_club_staff()) with check (public.is_club_staff());

-- ---------- Weekly trainings ----------
create table public.trainings (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  weekday      int  not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time   time not null,
  duration_min int  not null default 60 check (duration_min between 15 and 240),
  coach        text,
  capacity     int  not null check (capacity > 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.trainings enable row level security;
create policy "trainings: everyone signed in reads" on public.trainings for select to authenticated using (true);
create policy "trainings: staff manages" on public.trainings for all to authenticated
  using (public.is_club_staff()) with check (public.is_club_staff());

-- ---------- Registrations (one per member per training date) ----------
create table public.registrations (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  on_date     date not null,
  status      text not null check (status in ('registered', 'waitlist', 'cancelled')),
  attended    boolean,
  created_at  timestamptz not null default now(),
  unique (training_id, member_id, on_date)
);
create index registrations_date_idx on public.registrations (on_date, training_id);

alter table public.registrations enable row level security;
create policy "registrations: staff all, member own" on public.registrations for select to authenticated
  using (public.is_club_staff() or member_id = public.my_member_id());

-- Join a training on a date: up to 3 a week (Sun–Sat); full → waitlist.
create or replace function public.club_register(p_training uuid, p_date date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := public.my_member_id();
  t public.trainings;
  v_week_start date := p_date - extract(dow from p_date)::int;
  v_week int; v_taken int; v_status text;
begin
  if v_member is null then return 'not_member'; end if;
  if exists (select 1 from public.registrations where training_id = p_training and member_id = v_member
             and on_date = p_date and status <> 'cancelled') then
    return 'already';
  end if;
  select * into t from public.trainings where id = p_training and is_active;
  if t.id is null or extract(dow from p_date)::int <> t.weekday then return 'bad_date'; end if;
  if p_date < (now() at time zone 'Asia/Jerusalem')::date then return 'past'; end if;

  select count(*) into v_week from public.registrations
   where member_id = v_member and status in ('registered', 'waitlist')
     and on_date between v_week_start and v_week_start + 6;
  if v_week >= 3 then return 'week_full'; end if;

  select count(*) into v_taken from public.registrations
   where training_id = p_training and on_date = p_date and status = 'registered';
  v_status := case when v_taken < t.capacity then 'registered' else 'waitlist' end;

  insert into public.registrations (training_id, member_id, on_date, status)
  values (p_training, v_member, p_date, v_status)
  on conflict (training_id, member_id, on_date) do update set status = excluded.status, created_at = now()
    where public.registrations.status = 'cancelled';
  return v_status;
end;
$$;

-- Cancel (member: own; staff: any). The first on the waitlist moves up.
create or replace function public.club_cancel(p_registration uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.registrations; v_next uuid;
begin
  select * into r from public.registrations where id = p_registration for update;
  if r.id is null or not (public.is_club_staff() or r.member_id = public.my_member_id()) then return 'not_allowed'; end if;
  if r.status = 'cancelled' then return 'already'; end if;
  update public.registrations set status = 'cancelled' where id = r.id;
  if r.status = 'registered' then
    select id into v_next from public.registrations
     where training_id = r.training_id and on_date = r.on_date and status = 'waitlist'
     order by created_at limit 1;
    if v_next is not null then update public.registrations set status = 'registered' where id = v_next; end if;
  end if;
  return 'ok';
end;
$$;

create or replace function public.club_attendance(p_registration uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_club_staff() then raise exception 'not allowed'; end if;
  update public.registrations set attended = p_attended where id = p_registration and status = 'registered';
end;
$$;

-- ---------- Logins for members / club manager ----------
alter table public.invites add column if not exists member_id uuid references public.members (id) on delete cascade;

-- Club staff may invite members (owner may invite anyone).
drop policy if exists "invites: owner only" on public.invites;
create policy "invites: owner, or staff for members" on public.invites for all to authenticated
  using (public.is_owner() or (public.is_club_staff() and role = 'member'))
  with check (public.is_owner() or (public.is_club_staff() and role = 'member'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invites;
begin
  select * into v_inv from public.invites where email = lower(new.email);

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(v_inv.full_name, new.raw_user_meta_data ->> 'full_name'), v_inv.role);

  if v_inv.therapist_id is not null then
    update public.therapists set profile_id = new.id where id = v_inv.therapist_id;
  end if;
  if v_inv.member_id is not null then
    update public.members set profile_id = new.id where id = v_inv.member_id;
  end if;
  if v_inv.email is not null then
    delete from public.invites where email = v_inv.email;
  end if;
  return new;
end;
$$;

-- ---------- Grants ----------
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.trainings to authenticated;
grant select on public.registrations to authenticated;
revoke all on function public.club_register(uuid, date) from public;
revoke all on function public.club_cancel(uuid) from public;
revoke all on function public.club_attendance(uuid, boolean) from public;
grant execute on function public.is_club_staff(), public.my_member_id() to authenticated;
grant execute on function public.club_register(uuid, date), public.club_cancel(uuid),
  public.club_attendance(uuid, boolean) to authenticated;
