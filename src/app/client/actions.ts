"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPaymentMethod } from "@/lib/clients";
import { createPaymentForm, morningConfigured } from "@/lib/morning";
import { siteUrl } from "@/lib/site";

// A client / parent pays from their portal: single session, card 4 or card 10.
// The amount is set by the database (portal_create_request), never here.
export async function portalPayAction(clientId: string, kind: string) {
  const profile = await requireRole("client");
  if (profile.viewAs || !isPaymentMethod(kind)) redirect("/client");
  if (!morningConfigured()) redirect("/client?err=setup");

  const token = randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("portal_create_request", { p_client: clientId, p_kind: kind, p_token_hash: tokenHash })
    .maybeSingle<{ id: string; amount: number; description: string; payer_name: string; payer_email: string | null; payer_phone: string | null }>();
  if (error || !data) redirect("/client?err=pay");

  const base = await siteUrl();
  let url: string | null = null;
  try {
    url = await createPaymentForm({
      description: data.description,
      amount: data.amount,
      client: {
        name: data.payer_name,
        emails: data.payer_email ? [data.payer_email] : undefined,
        phone: data.payer_phone ?? undefined,
      },
      successUrl: `${base}/pay/done`,
      failureUrl: `${base}/pay/failed`,
      notifyUrl: `${base}/api/morning/notify?r=${data.id}&t=${token}`,
      custom: data.id,
    });
  } catch (e) {
    console.error(e);
  }
  await supabase.rpc("portal_finish_request", { p_id: data.id, p_url: url });
  redirect(url ?? "/client?err=pay");
}
