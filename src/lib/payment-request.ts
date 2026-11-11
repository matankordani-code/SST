import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { CARD_PRICE, PAYMENT_LABEL, type PaymentMethod } from "@/lib/clients";
import { createPaymentForm, morningConfigured } from "@/lib/morning";
import { siteUrl } from "@/lib/site";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type NewRequest =
  | { ok: true; id: string; url: string; amount: number; description: string; payerName: string; payerEmail: string | null }
  | { ok: false; error: string };

// Creates a payment request + a Morning payment link for a client (staff side;
// RLS decides whether this user may). Used by the client page and the alerts.
export async function createPaymentRequest(
  supabase: Supabase,
  clientId: string,
  kind: PaymentMethod,
  group: 100 | 120 = 100,
): Promise<NewRequest> {
  if (!morningConfigured()) return { ok: false, error: "החיבור ל-Morning עוד לא הוגדר (חסרים מפתחות)." };

  const cols = "full_name, email, phone, rate, payer:payers(full_name, email, phone), therapist:therapists(display_name)";
  const withInvoice = await supabase.from("clients").select(`${cols}, invoice_email, invoice_phone`).eq("id", clientId).maybeSingle();
  // Before migration 0022 there are no invoice contact columns.
  const c = withInvoice.error ? (await supabase.from("clients").select(cols).eq("id", clientId).maybeSingle()).data : withInvoice.data;
  if (!c) return { ok: false, error: "המטופל לא נמצא." };
  const client = c as unknown as {
    full_name: string;
    email: string | null;
    phone: string | null;
    rate: number;
    payer: { full_name: string; email: string | null; phone: string | null } | null;
    therapist: { display_name: string } | null;
    invoice_email?: string | null;
    invoice_phone?: string | null;
  };

  const amount = kind === "single" ? client.rate : CARD_PRICE[kind];
  const payerName = client.payer?.full_name ?? client.full_name;
  // Where Morning sends the receipt/invoice: the invoice contact if set,
  // else the payer (parent), else the client.
  const payerEmail = client.invoice_email || client.payer?.email || client.email;
  const payerPhone = client.invoice_phone || client.payer?.phone || client.phone;
  const description =
    (kind === "single" ? `מפגש טיפולי · ${client.full_name}` : `${PAYMENT_LABEL[kind]} · ${client.full_name}`) +
    (client.therapist ? ` · ${client.therapist.display_name}` : "");

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
  if (error || !req) return { ok: false, error: "יצירת הדרישה נכשלה." };

  const base = await siteUrl();
  try {
    const url = await createPaymentForm({
      description,
      amount,
      client: { name: payerName, emails: payerEmail ? [payerEmail] : undefined, phone: payerPhone ?? undefined },
      successUrl: `${base}/pay/done`,
      failureUrl: `${base}/pay/failed`,
      notifyUrl: `${base}/api/morning/notify?r=${req.id}&t=${token}`,
      custom: req.id,
      group,
    });
    await supabase.from("payment_requests").update({ url }).eq("id", req.id);
    return { ok: true, id: req.id, url, amount, description, payerName, payerEmail };
  } catch (e) {
    await supabase.from("payment_requests").update({ status: "cancelled" }).eq("id", req.id);
    console.error(e);
    return { ok: false, error: "Morning לא יצר קישור תשלום. בדוק את ההגדרות ונסה שוב." };
  }
}
