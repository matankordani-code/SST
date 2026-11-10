-- SST · stage 1: user profiles and roles.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- The six roles. Must match src/lib/roles.ts.
create type public.app_role as enum (
  'owner',
  'club_manager',
  'therapist',
  'surf_instructor',
  'client',
  'member'
);

-- One row per login user. Created automatically when a user is added.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  email      text,
  phone      text,
  role       public.app_role,          -- null = no access until the owner sets it
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- The current user's role. SECURITY DEFINER so policies can call it
-- without recursing into the profiles policies.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

-- Everyone sees their own profile. The owner sees everyone.
create policy "profiles: read own or owner reads all"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.current_app_role() = 'owner');

-- Only the owner can change profiles (including roles).
-- Users cannot change their own role.
create policy "profiles: owner updates"
  on public.profiles for update
  to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

-- No insert/delete policies: rows are created by the trigger below
-- and removed when the auth user is deleted.

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for users that already existed before this script ran.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;
