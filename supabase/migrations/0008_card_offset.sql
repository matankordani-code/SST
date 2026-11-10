-- SST · imported punch cards start part-used ("6 מתוך 10 נוצלו" before the system).
-- Run once in Supabase SQL Editor.

alter table public.punch_cards
  add column used_offset int not null default 0 check (used_offset >= 0);

-- Usage = sessions linked in the system + usage carried over from the spreadsheet.
create or replace view public.punch_card_usage with (security_invoker = true) as
select pc.id, pc.client_id, pc.size, pc.purchased_on, pc.amount_paid, pc.paid_note,
       pc.used_offset + (select count(*) from public.sessions s where s.punch_card_id = pc.id)::int as used
from public.punch_cards pc;

-- Card with room: counts the carried-over usage too.
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
          and pc.used_offset + (select count(*) from public.sessions s where s.punch_card_id = pc.id) < pc.size
        order by pc.purchased_on, pc.created_at
        limit 1;
        new.punch_card_id := v_card;
      end if;
    else
      new.punch_card_id := null;
    end if;
  end if;
  return new;
end;
$$;

grant select on public.punch_card_usage to authenticated;
