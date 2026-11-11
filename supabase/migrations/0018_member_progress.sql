-- SST · member progress: technique scores from the coach, personal goals,
-- and true occupancy for members. Run once in Supabase SQL Editor (after 0017).

-- ---------- Technique scores (1–5), one row per scoring ----------
create table if not exists public.member_skills (
  id        uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  skill     text not null check (skill in ('takeoff', 'paddling', 'wave_reading', 'turns')),
  score     int  not null check (score between 1 and 5),
  scored_on date not null default current_date,
  scored_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create index if not exists member_skills_member_idx on public.member_skills (member_id, skill, scored_on);

alter table public.member_skills enable row level security;
drop policy if exists "skills: staff or own reads" on public.member_skills;
drop policy if exists "skills: staff writes" on public.member_skills;
create policy "skills: staff or own reads" on public.member_skills for select to authenticated
  using (public.is_club_staff() or member_id = public.my_member_id());
create policy "skills: staff writes" on public.member_skills for all to authenticated
  using (public.is_club_staff()) with check (public.is_club_staff());
grant select, insert, update, delete on public.member_skills to authenticated;

-- ---------- Personal goals ----------
create table if not exists public.member_goals (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members (id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.member_goals enable row level security;
drop policy if exists "goals: staff or own reads" on public.member_goals;
drop policy if exists "goals: staff writes" on public.member_goals;
create policy "goals: staff or own reads" on public.member_goals for select to authenticated
  using (public.is_club_staff() or member_id = public.my_member_id());
create policy "goals: staff writes" on public.member_goals for all to authenticated
  using (public.is_club_staff()) with check (public.is_club_staff());
grant select, insert, update, delete on public.member_goals to authenticated;

-- A member ticks their own goal (only the "done" flag).
create or replace function public.toggle_my_goal(p_goal uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.member_goals set done = p_done
   where id = p_goal and (member_id = public.my_member_id() or public.is_club_staff());
end;
$$;

-- ---------- Occupancy for everyone ----------
-- Members only see their own registrations, so they counted free spots wrong.
-- Counts only (no names).
create or replace function public.training_counts(p_from date, p_to date)
returns table (training_id uuid, on_date date, registered int, waitlist int)
language sql stable security definer set search_path = '' as $$
  select r.training_id, r.on_date,
         count(*) filter (where r.status = 'registered')::int,
         count(*) filter (where r.status = 'waitlist')::int
  from public.registrations r
  where auth.uid() is not null and r.on_date between p_from and p_to and r.status <> 'cancelled'
  group by r.training_id, r.on_date;
$$;

revoke all on function public.toggle_my_goal(uuid, boolean), public.training_counts(date, date) from public;
grant execute on function public.toggle_my_goal(uuid, boolean), public.training_counts(date, date) to authenticated;
