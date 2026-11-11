import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { sendEmail } from "@/lib/email";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type DeclarationKind = "health" | "parental";

export const DECLARATION_LABEL: Record<DeclarationKind, string> = {
  health: "הצהרת בריאות",
  parental: "הסכמת הורה",
};

// Creates a signing link. The token is in the link only; just its hash is stored.
export async function createDeclaration(
  supabase: Supabase,
  clientId: string,
  kind: DeclarationKind,
): Promise<{ url: string } | { error: string }> {
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", kind === "health" ? "health_text" : "parental_text")
    .maybeSingle();
  const text = typeof setting?.value === "string" ? setting.value : "";
  if (!text) return { error: "חסר נוסח. הגדר אותו במסך ההגדרות." };

  const token = randomBytes(24).toString("hex");
  const { data, error } = await supabase
    .from("declarations")
    .insert({
      client_id: clientId,
      kind,
      token_hash: createHash("sha256").update(token).digest("hex"),
      text_snapshot: text,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "יצירת הקישור נכשלה." };
  return { url: `${await siteUrl()}/sign/${data.id}?t=${token}` };
}

// New client: email the health declaration (and, for a minor, the parental
// consent) to whoever pays, so it is signed before the first session.
// Best effort: no email on file, or email not set up, simply skips.
export async function sendIntakeDeclarations(
  supabase: Supabase,
  input: { clientId: string; clientName: string; age: number | null; toEmail: string | null; toName: string },
) {
  if (!input.toEmail) return;
  const kinds: DeclarationKind[] = input.age !== null && input.age < 18 ? ["health", "parental"] : ["health"];
  for (const kind of kinds) {
    const res = await createDeclaration(supabase, input.clientId, kind);
    if ("error" in res) continue;
    await sendEmail({
      to: input.toEmail,
      subject: `${DECLARATION_LABEL[kind]} לחתימה · ${input.clientName}`,
      body: [
        `שלום ${input.toName},`,
        `לפני המפגש הראשון של ${input.clientName.split(" ")[0]}, נבקש למלא ולחתום על ${DECLARATION_LABEL[kind]}.`,
        "זה לוקח דקה, וחותמים באצבע או בעכבר.",
      ],
      link: { label: "למילוי וחתימה", url: res.url },
    });
  }
}
