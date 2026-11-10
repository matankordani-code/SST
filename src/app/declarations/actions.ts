"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type CreateState = { url?: string; error?: string } | undefined;

async function siteUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

// Creates a signing link. The token is shown once; only its hash is stored.
export async function createDeclarationAction(
  clientId: string,
  kind: "health" | "parental",
  _: CreateState,
): Promise<CreateState> {
  const supabase = await createClient();
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

  refresh();
  return { url: `${await siteUrl()}/sign/${data.id}?t=${token}` };
}

export type SignState = { ok?: boolean; error?: string } | undefined;

// Public: the client/parent signs. Authorised only by the token in the link.
export async function signDeclarationAction(id: string, token: string, _: SignState, fd: FormData): Promise<SignState> {
  const signer = String(fd.get("signer") ?? "").trim();
  const signature = String(fd.get("signature") ?? "");
  if (!signer) return { error: "חסר שם מלא." };
  if (fd.get("agree") !== "on") return { error: "צריך לסמן שקראת ואת/ה מאשר/ת." };
  if (!signature.startsWith("data:image/png;base64,")) return { error: "חסרה חתימה." };

  const supabase = createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const h = await headers();
  const { data } = await supabase.rpc("sign_declaration", {
    p_id: id,
    p_token: token,
    p_signer: signer,
    p_notes: String(fd.get("notes") ?? ""),
    p_signature: signature,
    p_ua: h.get("user-agent") ?? "",
  });
  if (data !== "ok") return { error: "לא ניתן לחתום: הקישור לא תקין או שכבר נחתם." };
  return { ok: true };
}

export async function saveTextsAction(fd: FormData) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("app_settings").upsert([
    { key: "health_text", value: String(fd.get("health_text") ?? ""), updated_at: now },
    { key: "parental_text", value: String(fd.get("parental_text") ?? ""), updated_at: now },
  ]);
  refresh();
}
