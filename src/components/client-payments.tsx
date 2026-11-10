import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { CopyLink } from "@/components/copy-link";
import { NewPaymentRequest } from "@/components/new-payment-request";
import { PAYMENT_LABEL, formatShekel, type PaymentMethod } from "@/lib/clients";
import { morningConfigured, morningMode } from "@/lib/morning";
import { formatDateTime } from "@/lib/time";
import { cancelPaymentRequestAction } from "@/app/payments/actions";

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
};

// Payment requests (Morning links) and received payments for one client.
export async function ClientPayments({ clientId, rate }: { clientId: string; rate: number }) {
  const supabase = await createClient();
  const [{ data: reqs }, { data: pays }] = await Promise.all([
    supabase
      .from("payment_requests")
      .select("id, kind, amount, url, status, payer_name, payer_email, created_at, paid_at")
      .eq("client_id", clientId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("payments")
      .select("id, kind, amount, source, morning_document_number, paid_at")
      .eq("client_id", clientId)
      .order("paid_at", { ascending: false })
      .limit(20),
  ]);
  const open = ((reqs ?? []) as Req[]).filter((r) => r.status === "open");
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
            <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-[#EFEAE0] p-3 text-sm">
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

      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-muted">תשלומים שהתקבלו</span>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">עדיין אין.</p>
        ) : (
          <ul className="text-sm">
            {payments.map((p) => (
              <li key={p.id} className="border-b border-[#EFEAE0] py-1.5 last:border-0">
                {formatDateTime(p.paid_at)} · {PAYMENT_LABEL[p.kind]} ·{" "}
                <span className="tabular-nums">{formatShekel(p.amount)}</span>
                {p.morning_document_number && ` · חשבונית ${p.morning_document_number}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
