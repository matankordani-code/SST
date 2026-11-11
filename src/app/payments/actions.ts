"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPaymentMethod } from "@/lib/clients";
import { morningMode } from "@/lib/morning";
import { createPaymentRequest } from "@/lib/payment-request";
import { paymentRequestEmail, sendEmail } from "@/lib/email";

export type FormState = { error?: string } | undefined;

// Creates a payment request + a Morning payment link for a client.
export async function createPaymentRequestAction(
  clientId: string,
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const kind = fd.get("kind");
  if (!isPaymentMethod(kind)) return { error: "בחר סוג תשלום." };
  const supabase = await createClient();
  const res = await createPaymentRequest(supabase, clientId, kind, fd.get("group") === "120" ? 120 : 100);
  if (!res.ok) return { error: res.error };
  refresh();
  return undefined;
}

export type SendState = { error?: string; sent?: string } | undefined;

// From the owner's alerts: create a renewal / payment link and email it to the payer.
// In Morning's sandbox the link is created but not emailed (it isn't a real payment page).
export async function sendPaymentLinkAction(clientId: string, kind: string): Promise<SendState> {
  if (!isPaymentMethod(kind)) return { error: "סוג תשלום לא תקין." };
  const supabase = await createClient();
  const res = await createPaymentRequest(supabase, clientId, kind);
  if (!res.ok) return { error: res.error };
  refresh();
  if (!res.payerEmail) return { sent: "הקישור נוצר. אין מייל למשלם, אפשר להעתיק אותו מדף המטופל." };
  if (morningMode() !== "production") return { sent: "הקישור נוצר (סביבת בדיקה של Morning, לא נשלח למשלם)." };
  const mail = paymentRequestEmail({ toName: res.payerName, description: res.description, amount: res.amount, url: res.url });
  after(() => sendEmail({ to: res.payerEmail!, ...mail }));
  return { sent: `נשלח ל-${res.payerEmail}` };
}

export async function cancelPaymentRequestAction(requestId: string) {
  const supabase = await createClient();
  await supabase.from("payment_requests").update({ status: "cancelled" }).eq("id", requestId).eq("status", "open");
  refresh();
}
