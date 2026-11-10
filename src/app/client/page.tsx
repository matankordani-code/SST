import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { CARD_PRICE, PAYMENT_LABEL, formatShekel, type PaymentMethod } from "@/lib/clients";
import { morningConfigured } from "@/lib/morning";
import { formatDateTime, dayKey, formatDate } from "@/lib/time";
import { portalPayAction } from "./actions";

export default function ClientPortalPage({ searchParams }: PageProps<"/client">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

type Overview = {
  client_id: string;
  first_name: string;
  therapist_name: string;
  payment_method: PaymentMethod;
  rate: number;
  next_session: string | null;
  card_size: number | null;
  card_used: number | null;
  card_purchased_on: string | null;
};
type OpenRequest = { id: string; client_id: string; description: string; amount: number; url: string; created_at: string };
type Payment = { paid_at: string; amount: number; kind: PaymentMethod; description: string; document_number: string | null };

const ERRORS: Record<string, string> = {
  setup: "התשלום באתר עוד לא הופעל. אפשר לשלם ישירות למטפל.",
  pay: "לא הצלחנו לפתוח את דף התשלום. נסו שוב בעוד כמה דקות.",
};

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const profile = await requireRole("client");
  const supabase = await createClient();
  // The owner previewing this portal passes the client; a real client passes nothing.
  const asClient = profile.viewAs?.kind === "client" ? profile.viewAs.id : null;

  const [{ data: ov }, { data: reqs }, { data: pays }] = await Promise.all([
    supabase.rpc("portal_overview", { p_as: asClient }),
    supabase.rpc("portal_open_requests", { p_as: asClient }),
    supabase.rpc("portal_payments", { p_as: asClient }),
  ]);
  const clients = (ov ?? []) as Overview[];
  const open = (reqs ?? []) as OpenRequest[];
  const payments = (pays ?? []) as Payment[];
  const canPay = morningConfigured();
  const err = typeof sp.err === "string" ? ERRORS[sp.err] : undefined;
  const many = clients.length > 1;

  if (clients.length === 0) {
    return (
      <AppShell profile={profile} active="/client">
        <Card title="האזור האישי">
          <p className="text-muted">
            לא מצאנו מטופל שמקושר למייל שלך. אם קיבלת הזמנה מהמטפל, ודא/י שנכנסת עם אותו מייל, או פנה/י למטפל.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell profile={profile} active="/client">
      {err && (
        <p role="alert" className="rounded-lg bg-alert-bg px-4 py-3 text-sm text-alert-ink">
          {err}
        </p>
      )}

      {clients.map((c) => {
        const isCard = c.payment_method !== "single" && c.card_size;
        const left = isCard ? Math.max(0, (c.card_size ?? 0) - (c.card_used ?? 0)) : 0;
        const mine = open.filter((r) => r.client_id === c.client_id);
        return (
          <Card key={c.client_id} title={many ? `${c.first_name} · עם ${c.therapist_name}` : `המטפל/ת: ${c.therapist_name}`}>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              <div className="rounded-lg border border-line bg-sand px-4 py-3">
                <p className="text-[13px] text-muted">המפגש הבא</p>
                <p className="mt-1 text-lg font-bold">{c.next_session ? formatDateTime(c.next_session) : "אין מפגש מתוכנן"}</p>
              </div>
              <div className="rounded-lg border border-line bg-sand px-4 py-3">
                <p className="text-[13px] text-muted">{isCard ? "כרטיסייה" : "אופן תשלום"}</p>
                {isCard ? (
                  <>
                    <p className="mt-1 text-lg font-bold">
                      {c.card_used} מתוך {c.card_size} נוצלו
                    </p>
                    <p className="text-[13px] text-muted">
                      {left === 0 ? "הכרטיסייה נוצלה. אפשר לחדש למטה." : `נשארו ${left}`}
                      {c.card_purchased_on ? ` · נרכשה ב-${formatDate(c.card_purchased_on)}` : ""}
                    </p>
                  </>
                ) : c.payment_method === "single" ? (
                  <p className="mt-1 text-lg font-bold">
                    {PAYMENT_LABEL.single} · {formatShekel(c.rate)}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-bold">{PAYMENT_LABEL[c.payment_method]}</p>
                    <p className="text-[13px] text-muted">אין כרטיסייה פעילה. אפשר לרכוש למטה.</p>
                  </>
                )}
              </div>
            </div>

            {mine.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold">ממתין לתשלום</h3>
                {mine.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#B07A1E] bg-[#FBF3E4] px-4 py-3">
                    <span>
                      {r.description} · <strong>{formatShekel(r.amount)}</strong>
                    </span>
                    <a href={r.url} className="flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-dark">
                      לתשלום
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold">תשלום</h3>
              {canPay ? (
                <div className="flex flex-wrap gap-2">
                  {(["single", "card4", "card10"] as const).map((kind) => (
                    <form key={kind} action={portalPayAction.bind(null, c.client_id, kind)}>
                      <button
                        type="submit"
                        className="min-h-11 rounded-lg border border-primary bg-white px-4 text-[15px] text-primary hover:bg-sand"
                      >
                        {PAYMENT_LABEL[kind]} · {formatShekel(kind === "single" ? c.rate : CARD_PRICE[kind])}
                      </button>
                    </form>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">התשלום באתר עוד לא הופעל. אפשר לשלם ישירות למטפל.</p>
              )}
              <p className="text-[13px] text-muted">
                התשלום מתבצע בדף מאובטח של Morning (אשראי, ביט ועוד). חשבונית מס/קבלה נשלחת למייל מיד אחרי התשלום.
              </p>
            </div>
          </Card>
        );
      })}

      <Card title="החשבוניות שלי">
        {payments.length === 0 ? (
          <p className="text-muted">עדיין אין תשלומים.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <th className="px-2 pb-2 font-semibold">תאריך</th>
                  <th className="px-2 pb-2 font-semibold">עבור</th>
                  <th className="px-2 pb-2 font-semibold">סכום</th>
                  <th className="px-2 pb-2 font-semibold">מסמך</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} className="border-t border-[#EFEAE0]">
                    <td className="px-2 py-3">{formatDate(dayKey(new Date(p.paid_at)))}</td>
                    <td className="px-2 py-3">{p.description}</td>
                    <td className="px-2 py-3 tabular-nums">{formatShekel(p.amount)}</td>
                    <td className="px-2 py-3 text-muted">
                      {p.document_number ? `חשבונית מס/קבלה ${p.document_number} · נשלחה למייל` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
