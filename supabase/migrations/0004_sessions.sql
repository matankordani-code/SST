-- SST · stage 1: calendar sessions, session summaries, punch cards.
-- Run once in Supabase SQL Editor.

create type public.session_status as enum ('planned', 'held', 'cancelled_ontime', 'cancelled_late');

-- ---------- Punch cards (כרטיסיות) — payment recorded manually for now ----------
create table public.punch_cards (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  size         int  not null check (size in (4, 10)),
  purchased_on date not null default current_date,
  amount_paid  int  not null check (amount_paid >= 0),
  paid_note    text,                       -- e.g. "ביט", "העברה"
  created_by   uuid default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index punch_cards_client_idx on public.punch_cards (client_id);

-- ---------- Sessions (מפגשים) ----------
create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  therapist_id  uuid not null references public.therapists (id),
  starts_at     timestamptz not null,
  duration_min  int not null default 60 check (duration_min between 15 and 240),
  status        public.session_status not null default 'planned',
  price         int not null check (price >= 0),          -- client's rate when booked
  series_id     uuid,                                     -- weekly recurring group
  punch_card_id uuid references public.punch_cards (id) on delete set null,
  reported_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index sessions_therapist_time_idx on public.sessions (therapist_id, starts_at);
create index sessions_client_time_idx on public.sessions (client_id, starts_at);

-- ---------- Session summaries (therapeutic content) ----------
create table public.session_summaries (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  did        text not null,
  mood       int check (mood between 1 and 5),
  next_goal  text,
  updated_at timestamptz not null default now()
);

-- ---------- Triggers ----------

-- New session: therapist and price always come from the client.
create or replace function public.sessions_fill_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select c.therapist_id, coalesce(new.price, c.rate)
    into new.therapist_id, new.price
  from public.clients c where c.id = new.client_id;
  return new;
end;
$$;

create trigger sessions_fill_defaults
  before insert on public.sessions
  for each row execute function public.sessions_fill_defaults();

-- Status change: stamp reported_at and keep the punch-card link in sync.
-- Held / late-cancelled sessions of a card client use the oldest card with room.
create or replace function public.sessions_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_method public.payment_method;
  v_card   uuid;
begin
  if new.status is distinct from old.status then
    new.reported_at := case when new.status = 'planned' then null else now() end;

    if new.status in ('held', 'cancelled_late') then
      select payment_method into v_method from public.clients where id = new.client_id;
      if new.punch_card_id is null and v_method in ('card4', 'card10') then
        select pc.id into v_card
        from public.punch_cards pc
        where pc.client_id = new.client_id
          and (select count(*) from public.sessions s where s.punch_card_id = pc.id) < pc.size
        order by pc.purchased_on, pc.created_at
        limit 1;
        new.punch_card_id := v_card;   -- null if no card has room
      end if;
    else
      new.punch_card_id := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger sessions_status_change
  before update on public.sessions
  for each row execute function public.sessions_status_change();

-- Transfer: when a client moves therapist, their future planned sessions move too.
create or replace function public.clients_transfer_sessions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.therapist_id is distinct from old.therapist_id then
    update public.sessions
       set therapist_id = new.therapist_id
     where client_id = new.id and status = 'planned' and starts_at >= now();
  end if;
  return new;
end;
$$;

create trigger clients_transfer_sessions
  after update of therapist_id on public.clients
  for each row execute function public.clients_transfer_sessions();

-- ---------- RLS ----------
alter table public.sessions enable row level security;

create policy "sessions: owner all, therapist own" on public.sessions
  for select to authenticated
  using (public.is_owner() or therapist_id = public.my_therapist_id());

create policy "sessions: book for own clients" on public.sessions
  for insert to authenticated
  with check (public.is_owner() or therapist_id = public.my_therapist_id());

create policy "sessions: report own" on public.sessions
  for update to authenticated
  using (public.is_owner() or therapist_id = public.my_therapist_id())
  with check (public.is_owner() or therapist_id = public.my_therapist_id());

create policy "sessions: delete planned" on public.sessions
  for delete to authenticated
  using (status = 'planned' and (public.is_owner() or therapist_id = public.my_therapist_id()));

alter table public.session_summaries enable row level security;

-- Same rule as the personal file: current treating therapist, or owner when shared.
create policy "summaries: treating therapist, or owner when shared" on public.session_summaries
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    join public.clients c on c.id = s.client_id
    left join public.client_files f on f.client_id = c.id
    where s.id = session_summaries.session_id
      and (c.therapist_id = public.my_therapist_id()
           or (public.is_owner() and coalesce(f.shared_with_owner, false)))
  ));

create policy "summaries: treating therapist writes" on public.session_summaries
  for all to authenticated
  using (exists (
    select 1 from public.sessions s join public.clients c on c.id = s.client_id
    where s.id = session_summaries.session_id and c.therapist_id = public.my_therapist_id()
  ))
  with check (exists (
    select 1 from public.sessions s join public.clients c on c.id = s.client_id
    where s.id = session_summaries.session_id and c.therapist_id = public.my_therapist_id()
  ));

alter table public.punch_cards enable row level security;

create policy "cards: owner or treating therapist" on public.punch_cards
  for select to authenticated
  using (public.is_owner() or exists (
    select 1 from public.clients c
    where c.id = punch_cards.client_id and c.therapist_id = public.my_therapist_id()
  ));

create policy "cards: owner or treating therapist records" on public.punch_cards
  for insert to authenticated
  with check (public.is_owner() or exists (
    select 1 from public.clients c
    where c.id = punch_cards.client_id and c.therapist_id = public.my_therapist_id()
  ));

-- Card usage, respecting the caller's RLS.
create view public.punch_card_usage with (security_invoker = true) as
select pc.id, pc.client_id, pc.size, pc.purchased_on, pc.amount_paid, pc.paid_note,
       (select count(*) from public.sessions s where s.punch_card_id = pc.id)::int as used
from public.punch_cards pc;

-- ---------- Grants ----------
grant select, insert, update, delete on public.sessions          to authenticated;
grant select, insert, update         on public.session_summaries to authenticated;
grant select, insert                 on public.punch_cards       to authenticated;
grant select                         on public.punch_card_usage  to authenticated;
