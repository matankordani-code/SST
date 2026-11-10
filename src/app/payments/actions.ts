"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CARD_PRICE, PAYMENT_LABEL, isPaymentMethod } from "@/lib/clients";
import { createPaymentForm, morningConfigured } from "@/lib/morning";

export type FormState = { error?: string } | undefined;

async function siteUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `https://${host}`;
}

// Creates a payment request + a Morning payment link for a client.
export async function createPaymentRequestAction(
  clientId: string,
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  if (!morningConfigured()) return { error: "החיבור ל-Morning עוד לא הוגדר (חסרים מפתחות)." };
  const kind = fd.get("kind");
  if (!isPaymentMethod(kind)) return { error: "בחר סוג תשלום." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("clients")
    .select("full_name, email, phone, rate, payer:payers(full_name, email, phone)")
    .eq("id", clientId)
    .maybeSingle();
  if (!c) return { error: "המטופל לא נמצא." };
  const client = c as unknown as {
    full_name: string;
    email: string | null;
    phone: string | null;
    rate: number;
    payer: { full_name: string; email: string | null; phone: string | null } | null;
  };

  const amount = kind === "single" ? client.rate : CARD_PRICE[kind];
  const payerName = client.payer?.full_name ?? client.full_name;
  const payerEmail = client.payer?.email ?? client.email;
  const payerPhone = client.payer?.phone ?? client.phone;
  const description =
    kind === "single" ? `מפגש טיפולי · ${client.full_name}` : `${PAYMENT_LABEL[kind]} · ${client.full_name}`;

  // Secret token: only Morning gets it (inside notifyUrl); we keep its hash.
  const token = randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: req, error } = await supabase
    .from("payment_requests")
    .insert({
      client_id: clientId,
      kind,
      amount,
      description,
      payer_name: payerName,
      payer_email: payerEmail,
      notify_token_hash: tokenHash,
    })
    .select("id")
    .single();
  if (error || !req) return { error: "יצירת הדרישה נכשלה." };

  const base = await siteUrl();
  try {
    const url = await createPaymentForm({
      description,
      amount,
      client: {
        name: payerName,
        emails: payerEmail ? [payerEmail] : undefined,
        phone: payerPhone ?? undefined,
      },
      successUrl: `${base}/pay/done`,
      failureUrl: `${base}/pay/failed`,
      notifyUrl: `${base}/api/morning/notify?r=${req.id}&t=${token}`,
      custom: req.id,
    });
    await supabase.from("payment_requests").update({ url }).eq("id", req.id);
  } catch (e) {
    await supabase.from("payment_requests").update({ status: "cancelled" }).eq("id", req.id);
    console.error(e);
    return { error: "Morning לא יצר קישור תשלום. בדוק את ההגדרות ונסה שוב." };
  }

  refresh();
  return undefined;
}

export async function cancelPaymentRequestAction(requestId: string) {
  const supabase = await createClient();
  await supabase.from("payment_requests").update({ status: "cancelled" }).eq("id", requestId).eq("status", "open");
  refresh();
}
