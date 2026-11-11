-- SST · health declaration as two forms: an adult (18+) signs for themself,
-- or a parent signs for their son/daughter. The form collects the
-- participant's details (and the parent's), medical notes and a separate,
-- optional consent to marketing messages.
-- Run once in Supabase SQL Editor (after 0020). Safe to run again.

alter table public.declarations add column if not exists form text not null default 'adult';
alter table public.declarations drop constraint if exists declarations_form_check;
alter table public.declarations add constraint declarations_form_check check (form in ('adult', 'minor'));
alter table public.declarations add column if not exists details jsonb;
alter table public.declarations add column if not exists marketing_ok boolean;

-- The two wordings (editable in Settings). A link keeps the wording it was sent with.
insert into public.app_settings (key, value) values
  ('health_text_adult', to_jsonb($t$הצהרת בריאות עבור משתתף/ת מעל גיל 18

• הנני מצהיר/ה כי אני יודע/ת לשחות.

• הנני מצהיר/ה כי אין לי כל מגבלה או רגישות רפואית אשר עלולה לסכן אותי במהלך הפעילות.

• עליי להישמע להוראות המדריכים וצוות המועדון בכל עת.

• הנני מודע/ת לכך שייתכן שאצולם במהלך הפעילות, וייתכן שהמועדון יעשה שימוש בתמונות אלה.

• במידה שהפעילות במועדון ארוכת טווח, באחריותי לעדכן את צוות המועדון על כל שינוי במצבי הבריאותי.

• מובן לי כי הפעילות הימית היא פעילות אתגרית העלולה לגרום לפציעות. אין לי ולא תהיה לי כל טענה כנגד מפעילי המועדון ו/או מי מטעמם, ואני פוטר/ת אותם מכל אחריות במקרה של נזק לגוף.

הנני מאשר/ת בחתימתי כי קראתי מסמך זה במלואו, הבנתי אותו ואני מסכים/ה לתוכנו.$t$)),
  ('health_text_minor', to_jsonb($t$הצהרת בריאות והסכמת הורה עבור משתתף/ת מתחת לגיל 18

• הנני מצהיר/ה כי בני/בתי יודע/ת לשחות.

• הנני מצהיר/ה כי אין לבני/לבתי כל מגבלה או רגישות רפואית אשר עלולה לסכן אותו/ה במהלך הפעילות.

• על בני/בתי להישמע להוראות המדריכים וצוות המועדון בכל עת.

• הנני מודע/ת לכך שייתכן שבני/בתי יצולם/תצולם במהלך הפעילות, וייתכן שהמועדון יעשה שימוש בתמונות אלה.

• במידה שהפעילות במועדון ארוכת טווח, באחריותי לעדכן את צוות המועדון על כל שינוי במצבו/ה הבריאותי של בני/בתי.

• מובן לי כי הפעילות הימית היא פעילות אתגרית העלולה לגרום לפציעות. אין לי ולא תהיה לי כל טענה כנגד מפעילי המועדון ו/או מי מטעמם, ואני פוטר/ת אותם מכל אחריות במקרה של נזק לגוף.

• הנני מאשר/ת, כהורה/אפוטרופוס, את השתתפות בני/בתי בפעילות.

הנני מאשר/ת בחתימתי כי קראתי מסמך זה במלואו, הבנתי אותו ואני מסכים/ה לתוכנו.$t$))
on conflict (key) do nothing;

-- Public signing page (no login), with the token from the link. Also returns
-- what we already know, to fill the form in advance.
create or replace function public.declaration_for_signing2(p_id uuid, p_token text)
returns table (kind public.declaration_kind, form text, text_snapshot text, client_first text, status text, prefill jsonb)
language sql stable security definer set search_path = '' as $$
  select d.kind, d.form, d.text_snapshot, split_part(c.full_name, ' ', 1), d.status,
         jsonb_build_object(
           'client_name', c.full_name, 'client_phone', c.phone, 'client_email', c.email,
           'payer_name', p.full_name, 'payer_phone', p.phone, 'payer_email', p.email)
  from public.declarations d
  join public.clients c on c.id = d.client_id
  left join public.payers p on p.id = c.payer_id
  where d.id = p_id and d.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;
revoke all on function public.declaration_for_signing2(uuid, text) from public;
grant execute on function public.declaration_for_signing2(uuid, text) to anon, authenticated;

create or replace function public.sign_declaration2(
  p_id uuid, p_token text, p_signer text, p_notes text, p_signature text, p_ua text,
  p_details jsonb, p_marketing boolean
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_signer), '') = '' or coalesce(p_signature, '') not like 'data:image/png;base64,%'
     or length(p_signature) > 300000 or length(coalesce(p_details::text, '')) > 4000 then
    return 'invalid';
  end if;
  update public.declarations
     set status = 'signed', signer_name = trim(p_signer), medical_notes = nullif(trim(p_notes), ''),
         signature = p_signature, signed_at = now(), signed_ua = left(p_ua, 300),
         details = p_details, marketing_ok = coalesce(p_marketing, false)
   where id = p_id and status = 'sent'
     and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return case when found then 'ok' else 'invalid' end;
end;
$$;
revoke all on function public.sign_declaration2(uuid, text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.sign_declaration2(uuid, text, text, text, text, text, jsonb, boolean) to anon, authenticated;
