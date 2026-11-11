"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createDeclaration, isHealthForm, sendHealthDeclaration } from "@/lib/declarations";

export type CreateState = { url?: string; error?: string } | undefined;

// Creates a signing link. The token is shown once; only its hash is stored.
export async function createDeclarationAction(
  clientId: string,
  kind: "health" | "parental",
  _: CreateState,
): Promise<CreateState> {
  const supabase = await createClient();
  const res = await createDeclaration(supabase, clientId, kind);
  if ("error" in res) return { error: res.error };
  refresh();
  return { url: res.url };
}

export type SendState = { url?: string; sentTo?: string | null; error?: string } | undefined;

// Health declaration in the chosen form (adult / parent for a minor): creates
// the link and emails it to the right person. The link is also returned, to
// send by WhatsApp or copy.
export async function sendHealthAction(clientId: string, form: string): Promise<SendState> {
  if (!isHealthForm(form)) return { error: "בחר טופס." };
  const supabase = await createClient();
  const res = await sendHealthDeclaration(supabase, clientId, form);
  if ("error" in res) return { error: res.error };
  refresh();
  return { url: res.url, sentTo: res.sentTo };
}

export type SignState = { ok?: boolean; error?: string } | undefined;

const field = (fd: FormData, k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);

function ageOn(birth: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  return age;
}

// Public: the client/parent signs. Authorised only by the token in the link.
export async function signDeclarationAction(id: string, token: string, _: SignState, fd: FormData): Promise<SignState> {
  const form = String(fd.get("form") ?? "");
  const signature = String(fd.get("signature") ?? "");
  let signer = field(fd, "signer");
  let details: Record<string, string> | null = null;
  const idOk = (v: string) => /^\d{5,9}$/.test(v);

  // The two health forms collect the participant's (and parent's) details.
  if (form === "adult") {
    details = {
      first_name: field(fd, "first_name"),
      last_name: field(fd, "last_name"),
      id_number: field(fd, "id_number", 12),
      birth_date: field(fd, "birth_date", 10),
      city: field(fd, "city"),
      phone: field(fd, "phone", 20),
      email: field(fd, "email"),
    };
    if (!details.first_name || !details.last_name) return { error: "חסר שם פרטי ושם משפחה." };
    if (!idOk(details.id_number)) return { error: "מספר תעודת זהות לא תקין." };
    const age = ageOn(details.birth_date);
    if (age === null) return { error: "חסר תאריך לידה." };
    if (age < 18) return { error: "הטופס הזה למבוגרים מעל 18. לקטין/ה, ההורה חותם/ת בטופס ההורה. בקש/י קישור מתאים." };
    if (!details.phone) return { error: "חסר טלפון נייד." };
    signer = `${details.first_name} ${details.last_name}`;
  } else if (form === "minor") {
    details = {
      child_first: field(fd, "child_first"),
      child_last: field(fd, "child_last"),
      child_id: field(fd, "child_id", 12),
      child_birth: field(fd, "child_birth", 10),
      parent_name: field(fd, "parent_name"),
      parent_id: field(fd, "parent_id", 12),
      phone: field(fd, "phone", 20),
      email: field(fd, "email"),
      city: field(fd, "city"),
    };
    if (!details.child_first || !details.child_last) return { error: "חסר שם הילד/ה." };
    if (!details.child_birth) return { error: "חסר תאריך הלידה של הילד/ה." };
    if (details.child_id && !idOk(details.child_id)) return { error: "תעודת הזהות של הילד/ה לא תקינה." };
    if (!details.parent_name) return { error: "חסר שם ההורה." };
    if (!idOk(details.parent_id)) return { error: "תעודת הזהות של ההורה לא תקינה." };
    if (!details.phone) return { error: "חסר טלפון נייד." };
    signer = details.parent_name;
  }
  if (!signer) return { error: "חסר שם מלא." };
  if (fd.get("agree") !== "on") return { error: "צריך לסמן שקראת ואת/ה מאשר/ת." };
  if (!signature.startsWith("data:image/png;base64,")) return { error: "חסרה חתימה." };

  const supabase = createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const h = await headers();
  const base = {
    p_id: id,
    p_token: token,
    p_signer: signer,
    p_notes: String(fd.get("notes") ?? "").slice(0, 2000),
    p_signature: signature,
    p_ua: h.get("user-agent") ?? "",
  };
  const { data } = details
    ? await supabase.rpc("sign_declaration2", { ...base, p_details: details, p_marketing: fd.get("marketing") === "on" })
    : await supabase.rpc("sign_declaration", base);
  if (data !== "ok") return { error: "לא ניתן לחתום: הקישור לא תקין או שכבר נחתם." };
  return { ok: true };
}

export async function saveTextsAction(fd: FormData) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("app_settings").upsert([
    { key: "health_text_adult", value: String(fd.get("health_text_adult") ?? ""), updated_at: now },
    { key: "health_text_minor", value: String(fd.get("health_text_minor") ?? ""), updated_at: now },
  ]);
  refresh();
}
