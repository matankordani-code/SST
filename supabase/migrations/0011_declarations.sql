-- SST · health declaration and parental consent, signed online through a private link.
-- Run once in Supabase SQL Editor.

create type public.declaration_kind as enum ('health', 'parental');

create table public.declarations (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  kind          public.declaration_kind not null,
  token_hash    text not null,             -- sha256 of the secret in the link
  text_snapshot text not null,             -- the wording the person saw and signed
  status        text not null default 'sent' check (status in ('sent', 'signed')),
  signer_name   text,
  medical_notes text,
  signature     text,                      -- PNG data URL of the drawn signature
  signed_at     timestamptz,
  signed_ua     text,
  created_by    uuid default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now()
);
create index declarations_client_idx on public.declarations (client_id, created_at desc);

alter table public.declarations enable row level security;

-- Health data: treating therapist (not surf instructors) and the owner.
create policy "declarations: owner or treating therapist" on public.declarations for select to authenticated
  using (public.is_owner() or (not public.is_instructor() and exists (
    select 1 from public.clients c where c.id = declarations.client_id and c.therapist_id = public.my_therapist_id())));

create policy "declarations: create for own clients" on public.declarations for insert to authenticated
  with check (public.is_owner() or exists (
    select 1 from public.clients c where c.id = declarations.client_id and c.therapist_id = public.my_therapist_id()));

-- Public signing page (no login): read and sign only with the right token.
create or replace function public.declaration_for_signing(p_id uuid, p_token text)
returns table (kind public.declaration_kind, text_snapshot text, client_first text, status text)
language sql stable security definer set search_path = '' as $$
  select d.kind, d.text_snapshot, split_part(c.full_name, ' ', 1), d.status
  from public.declarations d join public.clients c on c.id = d.client_id
  where d.id = p_id and d.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

create or replace function public.sign_declaration(
  p_id uuid, p_token text, p_signer text, p_notes text, p_signature text, p_ua text
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_signer), '') = '' or coalesce(p_signature, '') not like 'data:image/png;base64,%'
     or length(p_signature) > 300000 then
    return 'invalid';
  end if;
  update public.declarations
     set status = 'signed', signer_name = trim(p_signer), medical_notes = nullif(trim(p_notes), ''),
         signature = p_signature, signed_at = now(), signed_ua = left(p_ua, 300)
   where id = p_id and status = 'sent'
     and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return case when found then 'ok' else 'invalid' end;
end;
$$;

grant select, insert on public.declarations to authenticated;
revoke all on function public.declaration_for_signing(uuid, text) from public;
revoke all on function public.sign_declaration(uuid, text, text, text, text, text) from public;
grant execute on function public.declaration_for_signing(uuid, text) to anon, authenticated;
grant execute on function public.sign_declaration(uuid, text, text, text, text, text) to anon, authenticated;

-- Default wording (the owner replaces it in Settings with the forms used today).
insert into public.app_settings (key, value) values
  ('health_text', to_jsonb('הצהרת בריאות — נוסח לדוגמה. יש להחליף בנוסח המלא במסך ההגדרות.

אני מצהיר/ה כי מסרתי מידע מלא ונכון על מצבי הבריאותי, כולל מגבלות, מחלות, תרופות ופציעות, וכי אעדכן על כל שינוי. ידוע לי שהטיפול כולל פעילות בים ובמים.'::text)),
  ('parental_text', to_jsonb('הסכמת הורה — נוסח לדוגמה. יש להחליף בנוסח המלא במסך ההגדרות.

אני, הורה/אפוטרופוס של הקטין/ה, מאשר/ת את השתתפותו/ה בטיפול ובפעילות בים, ומצהיר/ה שמסרתי מידע מלא על מצבו/ה הבריאותי.'::text))
on conflict (key) do nothing;
