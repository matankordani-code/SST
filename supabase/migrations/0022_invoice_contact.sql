-- SST · invoice contact: an email (and phone) that Morning's receipt/invoice
-- goes to, when it isn't the client's or the parent's usual one (an employer,
-- a spouse, a health fund...). Plus quick editing of phone and email from the
-- clients list.
-- Run once in Supabase SQL Editor (after 0021). Safe to run again.

alter table public.clients add column if not exists invoice_email text;
alter table public.clients add column if not exists invoice_phone text;

-- Updates the contact details from the list: the payer's (parent's) phone and
-- email when someone else pays, the client's own otherwise, and the invoice
-- contact. Allowed to whoever may edit this client (clients: own / all).
create or replace function public.update_client_contact(
  p_client_id uuid, p_phone text, p_email text, p_invoice_email text, p_invoice_phone text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_therapist uuid;
  v_payer uuid;
begin
  select therapist_id, payer_id into v_therapist, v_payer from public.clients where id = p_client_id;
  if not found or not public.in_scope('clients', v_therapist) then
    return 'forbidden';
  end if;
  if v_payer is not null then
    update public.payers set phone = nullif(trim(p_phone), ''), email = nullif(lower(trim(p_email)), '')
     where id = v_payer;
  else
    update public.clients set phone = nullif(trim(p_phone), ''), email = nullif(lower(trim(p_email)), '')
     where id = p_client_id;
  end if;
  update public.clients
     set invoice_email = nullif(lower(trim(p_invoice_email)), ''),
         invoice_phone = nullif(trim(p_invoice_phone), '')
   where id = p_client_id;
  return 'ok';
end;
$$;
revoke all on function public.update_client_contact(uuid, text, text, text, text) from public;
grant execute on function public.update_client_contact(uuid, text, text, text, text) to authenticated;
