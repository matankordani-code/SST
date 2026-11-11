-- SST · payment attribution: every payment link and payment is tagged with the
-- therapist it belongs to (the client's therapist when the link was sent), so
-- the owner sees exactly where each shekel came from, even after a transfer.
-- Run once in Supabase SQL Editor (after 0019). Safe to run again.

alter table public.payment_requests add column if not exists therapist_id uuid references public.therapists (id) on delete set null;
alter table public.payments add column if not exists therapist_id uuid references public.therapists (id) on delete set null;
create index if not exists payments_therapist_idx on public.payments (therapist_id, paid_at desc);
create index if not exists payment_requests_therapist_idx on public.payment_requests (therapist_id, created_at desc);

-- Fill the tag on insert: the request's therapist, else the client's therapist.
create or replace function public.tag_request_therapist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.therapist_id is null then
    select c.therapist_id into new.therapist_id from public.clients c where c.id = new.client_id;
  end if;
  return new;
end $$;

create or replace function public.tag_payment_therapist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.therapist_id is null and new.request_id is not null then
    select r.therapist_id into new.therapist_id from public.payment_requests r where r.id = new.request_id;
  end if;
  if new.therapist_id is null then
    select c.therapist_id into new.therapist_id from public.clients c where c.id = new.client_id;
  end if;
  return new;
end $$;

drop trigger if exists payment_requests_tag_therapist on public.payment_requests;
create trigger payment_requests_tag_therapist before insert on public.payment_requests
  for each row execute function public.tag_request_therapist();

drop trigger if exists payments_tag_therapist on public.payments;
create trigger payments_tag_therapist before insert on public.payments
  for each row execute function public.tag_payment_therapist();

-- Existing rows: tag them the same way.
update public.payment_requests r set therapist_id = c.therapist_id
  from public.clients c where c.id = r.client_id and r.therapist_id is null;
update public.payments p set therapist_id = r.therapist_id
  from public.payment_requests r where r.id = p.request_id and p.therapist_id is null;
update public.payments p set therapist_id = c.therapist_id
  from public.clients c where c.id = p.client_id and p.therapist_id is null;
