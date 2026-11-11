import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { CopyLink } from "@/components/copy-link";
import { NewPaymentRequest } from "@/components/new-payment-request";
import { PAYMENT_LABEL, formatShekel, type PaymentMethod } from "@/lib/clients";
import { morningConfigured, morningMode } from "@/lib/morning";
import { dayKey, formatDateTime } from "@/lib/time";
import { cancelPaymentRequestAction, deleteManualPaymentAction, recordManualPaymentAction } from "@/app/payments/actions";

type Req = {
  id: string;
  kind: PaymentMethod;
  amount: number;
  url: string | null;
  status: "open" | "paid" | "cancelled";
  payer_name: string;
  payer_email: string | null;
  created_at: string;
  paid_at: string | null;
};
type Pay = {
  id: string;
  kind: PaymentMethod;
  amount: number;
  source: string;
  morning_document_number: string | null;
  paid_at: string;
  note: string | null;
};

// Payment requests (Morning links) and received payments for one client.
export async function ClientPayments({ clientId, rate }: { clientId: string; rate: number }) {
  const supabase = await createClient();
  const [{ data: reqs }, paysRes] = await Promise.all([
    supabase
      .from("payment_requests")
      .select("id, kind, amount, url, status, payer_name, payer_email, created_at, paid_at")
      .eq("client_id", clientId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("payments")
      .select("id, kind, amount, source, morning_document_number, paid_at, note")
      .eq("client_id", clientId)
      .order("paid_at", { ascending: false })
      .limit(20),
  ]);
  const open = ((reqs ?? []) as Req[]).filter((r) => r.status === "open");
  // Before migration 0019 there is no "note" column: read without it.
  const pays = paysRes.error
    ? (
        await supabase
          .from("payments")
          .select("id, kind, amount, source, morning_document_number, paid_at")
          .eq("client_id", clientId)
          .order("paid_at", { ascending: false })
          .limit(20)
      ).data
    : paysRes.data;
  const payments = (pays ?? []) as Pay[];
  const configured = morningConfigured();

  return (
    <Card
      title="תשלומים"
      actions={
        configured && morningMode() === "sandbox" ? (
          <span className="rounded-md bg-[#FBF3E4] px-2 py-0.5 text-[13px] text-[#6B4A12]">סביבת בדיקה</span>
        ) : null
      }
    >
      {configured ? (
        <NewPaymentRequest clientId={clientId} rate={rate} />
      ) : (
        <p className="text-sm text-muted">דרישות תשלום יופעלו אחרי שנחבר את Morning.</p>
      )}

      {open.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-muted">ממתינות לתשלום</span>
          {open.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-[#EDE4D3] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{PAYMENT_LABEL[r.kind]}</strong>
                <span className="tabular-nums">{formatShekel(r.amount)}</span>
                <span className="text-muted">
                  · {r.payer_name} · נוצרה {formatDateTime(r.created_at)}
                </span>
              </div>
              {r.url && <CopyLink url={r.url} payer={r.payer_name} amount={r.amount} />}
              <form action={cancelPaymentRequestAction.bind(null, r.id)}>
                <button className="text-[13px] text-alert-ink underline">ביטול הדרישה</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={recordManualPaymentAction.bind(null, clientId)} className="flex flex-col gap-2 rounded-lg bg-sand p-3">
        <span className="text-[13px] font-semibold">רישום תשלום שהתקבל מחוץ למערכת (ביט, מזומן, העברה)</span>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] items-end gap-2">
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            סכום (₪)
            <input name="amount" type="number" min={1} required defaultValue={rate} className="min-h-11 rounded-lg border border-field bg-white px-3 text-[15px] text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            תאריך
            <input name="paid_on" type="date" required defaultValue={dayKey(new Date())} className="min-h-11 rounded-lg border border-field bg-white px-3 text-[15px] text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            הערה
            <input name="note" placeholder="ביט, מזומן…" maxLength={80} className="min-h-11 rounded-lg border border-field bg-white px-3 text-[15px] text-ink" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg border border-primary bg-white px-4 text-sm text-primary hover:bg-sand">
            רישום תשלום
          </button>
        </div>
        <span className="text-[12px] text-muted">לתשלום על מפגשים בודדים. כרטיסייה נרשמת בכרטיס הכרטיסיות.</span>
      </form>

      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-muted">תשלומים שהתקבלו</span>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">עדיין אין.</p>
        ) : (
          <ul className="text-sm">
            {payments.map((p) => (
              <li key={p.id} className="border-b border-[#EDE4D3] py-1.5 last:border-0">
                {formatDateTime(p.paid_at)} · {PAYMENT_LABEL[p.kind]} ·{" "}
                <span className="tabular-nums">{formatShekel(p.amount)}</span>
                {p.morning_document_number && ` · חשבונית ${p.morning_document_number}`}
                {p.source === "manual" && (
                  <>
                    {" "}
                    · <span className="text-muted">רישום ידני{p.note ? `: ${p.note}` : ""}</span>{" "}
                    <form action={deleteManualPaymentAction.bind(null, p.id)} className="inline">
                      <button className="text-[13px] text-alert-ink underline">מחיקה</button>
                    </form>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
