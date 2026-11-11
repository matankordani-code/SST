-- SST · quick login from a remembered device (pilot convenience, owner only).
-- Run once in Supabase SQL Editor (after 0015).
--
-- The device keeps a random secret in an httpOnly cookie; only its sha256 is
-- stored here. Rows are written by the server with the secret key (service
-- role); the user can see and revoke their own devices.

create table if not exists public.trusted_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.trusted_devices enable row level security;
drop policy if exists "devices: own reads" on public.trusted_devices;
drop policy if exists "devices: own deletes" on public.trusted_devices;
create policy "devices: own reads" on public.trusted_devices for select to authenticated using (user_id = auth.uid());
create policy "devices: own deletes" on public.trusted_devices for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.trusted_devices to authenticated;
