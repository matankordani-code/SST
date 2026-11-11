import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { sendEmail } from "@/lib/email";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type DeclarationKind = "health" | "parental";
// Health declaration: an adult (18+) signs for themself, or a parent for a minor.
export type HealthForm = "adult" | "minor";

export const DECLARATION_LABEL: Record<DeclarationKind, string> = {
  health: "הצהרת בריאות",
  parental: "הסכמת הורה",
};

export const FORM_LABEL: Record<HealthForm, string> = {
  adult: "מבוגר/ת (מעל 18)",
  minor: "הורה עבור בן/בת",
};

export function isHealthForm(v: unknown): v is HealthForm {
  return v === "adult" || v === "minor";
}

// The form a client should get: a minor, or anyone with a separate payer (a parent).
export function defaultForm(client: { age: number | null; payer_id?: string | null }): HealthForm {
  if (client.age !== null && client.age < 18) return "minor";
  if (client.age === null && client.payer_id) return "minor";
  return "adult";
}

// Creates a signing link. The token is in the link only; just its hash is stored.
export async function createDeclaration(
  supabase: Supabase,
  clientId: string,
  kind: DeclarationKind,
  form: HealthForm = "adult",
): Promise<{ url: string } | { error: string }> {
  const keys = kind === "health" ? [`health_text_${form}`, "health_text"] : ["parental_text"];
  const { data: settings } = await supabase.from("app_settings").select("key, value").in("key", keys);
  // The form's own wording; before migration 0021, the older single wording.
  const text = keys.map((k) => settings?.find((s) => s.key === k)?.value).find((v): v is string => typeof v === "string" && !!v.trim()) ?? "";
  if (!text) return { error: "חסר נוסח. הגדר אותו במסך ההגדרות." };

  const token = randomBytes(24).toString("hex");
  const row: Record<string, unknown> = {
    client_id: clientId,
    kind,
    token_hash: createHash("sha256").update(token).digest("hex"),
    text_snapshot: text,
  };
  if (kind === "health") row.form = form;
  let { data, error } = await supabase.from("declarations").insert(row).select("id").single();
  // Before migration 0021 there is no "form" column.
  if (error && "form" in row) {
    delete row.form;
    ({ data, error } = await supabase.from("declarations").insert(row).select("id").single());
  }
  if (error || !data) return { error: "יצירת הקישור נכשלה." };
  return { url: `${await siteUrl()}/sign/${data.id}?t=${token}` };
}

export type SendResult = { url: string; sentTo: string | null } | { error: string };

// Creates the health declaration link and emails it: to the parent/payer for a
// minor, to the client for an adult. With no email on file, returns the link
// to send another way (WhatsApp, copy).
export async function sendHealthDeclaration(supabase: Supabase, clientId: string, form: HealthForm): Promise<SendResult> {
  const { data: c } = await supabase
    .from("clients")
    .select("full_name, email, payer:payers(full_name, email)")
    .eq("id", clientId)
    .maybeSingle();
  if (!c) return { error: "המטופל לא נמצא." };
  const client = c as unknown as { full_name: string; email: string | null; payer: { full_name: string; email: string | null } | null };

  const res = await createDeclaration(supabase, clientId, "health", form);
  if ("error" in res) return res;

  const to = form === "minor" ? (client.payer?.email ?? client.email) : (client.email ?? client.payer?.email);
  const toName = form === "minor" ? (client.payer?.full_name ?? client.full_name) : client.full_name;
  if (!to) return { url: res.url, sentTo: null };
  const first = client.full_name.split(" ")[0];
  const ok = await sendEmail({
    to,
    subject: `הצהרת בריאות לחתימה · ${client.full_name}`,
    body: [
      `שלום ${toName},`,
      form === "minor"
        ? `לפני הפעילות של ${first}, נבקש שתמלא/י ותחתום/י על הצהרת הבריאות עבורו/ה.`
        : "לפני הפעילות, נבקש שתמלא/י ותחתום/י על הצהרת הבריאות.",
      "זה לוקח דקה-שתיים, וחותמים באצבע או בעכבר.",
    ],
    link: { label: "למילוי וחתימה", url: res.url },
  });
  return { url: res.url, sentTo: ok ? to : null };
}

// New client: email the health declaration in the right form, so it is
// signed before the first session. Best effort: no email simply skips.
export async function sendIntakeDeclarations(
  supabase: Supabase,
  input: { clientId: string; clientName: string; age: number | null; toEmail: string | null; toName: string; hasPayer?: boolean },
) {
  if (!input.toEmail) return;
  const form: HealthForm = input.age !== null && input.age < 18 ? "minor" : input.age === null && input.hasPayer ? "minor" : "adult";
  await sendHealthDeclaration(supabase, input.clientId, form);
}
