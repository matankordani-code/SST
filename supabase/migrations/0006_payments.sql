-- SST · payments through Morning: payment requests (links) and payments.
-- Run once in Supabase SQL Editor.

create type public.request_status as enum ('open', 'paid', 'cancelled');

-- A payment link sent to a client (single session / card 4 / card 10).
create table public.payment_requests (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  kind              public.payment_method not null,
  amount            int not null check (amount > 0),
  description       text not null,
  payer_name        text not null,
  payer_email       text,
  url               text,                    -- Morning hosted payment form
  status            public.request_status not null default 'open',
  notify_token_hash text not null,           -- sha256 of the secret in notifyUrl
  created_by        uuid default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  paid_at           timestamptz
);
create index payment_requests_client_idx on public.payment_requests (client_id, created_at desc);

-- Money actually received.
create table public.payments (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients (id) on delete cascade,
  request_id             uuid references public.payment_requests (id) on delete set null,
  kind                   public.payment_method not null,
  amount                 int not null check (amount >= 0),
  source                 text not null default 'morning',   -- morning / manual
  morning_document_id    text,
  morning_document_number text,
  raw                    jsonb,
  paid_at                timestamptz not null default now()
);
create index payments_client_idx on public.payments (client_id, paid_at desc);

-- Link a punch card to the payment that bought it.
alter table public.punch_cards add column payment_id uuid references public.payments (id) on delete set null;

-- ---------- RLS: owner, or the client's treating therapist ----------
alter table public.payment_requests enable row level security;
alter table public.payments enable row level security;

create policy "requests: owner or treating therapist" on public.payment_requests
  for select to authenticated
  using (public.is_owner() or exists (
    select 1 from public.clients c where c.id = payment_requests.client_id and c.therapist_id = public.my_therapist_id()));

create policy "requests: create for own clients" on public.payment_requests
  for insert to authenticated
  with check (public.is_owner() or exists (
    select 1 from public.clients c where c.id = payment_requests.client_id and c.therapist_id = public.my_therapist_id()));

create policy "requests: update own (url / cancel)" on public.payment_requests
  for update to authenticated
  using (public.is_owner() or exists (
    select 1 from public.clients c where c.id = payment_requests.client_id and c.therapist_id = public.my_therapist_id()));

create policy "payments: owner or treating therapist" on public.payments
  for select to authenticated
  using (public.is_owner() or exists (
    select 1 from public.clients c where c.id = payments.client_id and c.therapist_id = public.my_therapist_id()));

-- ---------- Morning notifies here (no user session): verify token, record payment ----------
create or replace function public.mark_request_paid(
  p_request_id uuid,
  p_token      text,
  p_doc_id     text,
  p_doc_number text,
  p_raw        jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r       public.payment_requests;
  v_pay   uuid;
begin
  select * into r from public.payment_requests where id = p_request_id for update;
  if r.id is null or r.notify_token_hash <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    return 'invalid';
  end if;
  if r.status = 'paid' then
    return 'already';
  end if;

  insert into public.payments (client_id, request_id, kind, amount, source,
                               morning_document_id, morning_document_number, raw)
  values (r.client_id, r.id, r.kind, r.amount, 'morning', p_doc_id, p_doc_number, p_raw)
  returning id into v_pay;

  update public.payment_requests set status = 'paid', paid_at = now() where id = r.id;

  -- Buying a card opens it right away.
  if r.kind in ('card4', 'card10') then
    insert into public.punch_cards (client_id, size, amount_paid, paid_note, payment_id, created_by)
    values (r.client_id, case r.kind when 'card4' then 4 else 10 end, r.amount,
            'Morning' || coalesce(' #' || p_doc_number, ''), v_pay, null);
  end if;

  return 'ok';
end;
$$;

-- ---------- Grants ----------
grant select, insert, update on public.payment_requests to authenticated;
grant select                 on public.payments         to authenticated;

revoke all on function public.mark_request_paid(uuid, text, text, text, jsonb) from public;
grant execute on function public.mark_request_paid(uuid, text, text, text, jsonb) to anon, authenticated;
