"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createDeclaration } from "@/lib/declarations";

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
