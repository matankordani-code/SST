-- SST · manual payments (Bit / cash / transfer) and live updates.
-- Run once in Supabase SQL Editor (after 0018).

-- ---------- Manual payments for per-session clients ----------
-- A payment received outside Morning, recorded by the treating therapist or
-- anyone with "clients: all". It closes the open balance in "הקליניקה שלי".
alter table public.payments add column if not exists note text;
alter table public.payments add column if not exists recorded_by uuid default auth.uid() references public.profiles (id) on delete set null;

drop policy if exists "payments: record manual for clients in scope" on public.payments;
create policy "payments: record manual for clients in scope" on public.payments
  for insert to authenticated
  with check (
    source = 'manual' and request_id is null and morning_document_id is null
    and exists (select 1 from public.clients c
                where c.id = payments.client_id and public.in_scope('clients', c.therapist_id))
  );

drop policy if exists "payments: delete own manual" on public.payments;
create policy "payments: delete own manual" on public.payments
  for delete to authenticated
  using (
    source = 'manual'
    and exists (select 1 from public.clients c
                where c.id = payments.client_id and public.in_scope('clients', c.therapist_id))
  );

grant insert, delete on public.payments to authenticated;

-- ---------- Session location for the 20:00 reminder ----------
-- The hourly job has no login; it reads the place set in Settings through this.
create or replace function public.cron_location(p_token text)
returns text language sql stable security definer set search_path = '' as $$
  select value #>> '{}' from public.app_settings
  where key = 'session_location' and public.cron_ok(p_token);
$$;
revoke all on function public.cron_location(text) from public;
grant execute on function public.cron_location(text) to anon, authenticated;

-- ---------- Live updates ----------
-- Screens refresh by themselves when these tables change (Supabase Realtime;
-- RLS still decides who hears about which rows).
do $$
declare t text;
begin
  foreach t in array array['sessions', 'clients', 'payments', 'payment_requests', 'punch_cards',
                           'settlements', 'registrations', 'trainings', 'members', 'declarations']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
