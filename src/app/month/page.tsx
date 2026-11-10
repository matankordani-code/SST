import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { StatusBadge } from "@/components/status-badge";
import { Th } from "@/components/my-clients";
import { PAYMENT_LABEL, formatShekel } from "@/lib/clients";
import { SETTLEMENT_LABEL, totals, type Settlement, type SettlementLine } from "@/lib/settlements";
import { addMonths, formatDateTime, formatMonth, isMonthKey, monthOf } from "@/lib/time";
import { setStatusAction } from "./actions";
import { ApproveButton, InvoiceForm } from "./forms";

export default function MonthPage({ searchParams }: PageProps<"/month">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const profile = await requireRole("owner", "therapist");
  const isOwner = profile.role === "owner";
  const supabase = await createClient();
  const { data: myId } = await supabase.rpc("my_therapist_id");

  const month = isMonthKey(sp.m) ? sp.m : monthOf(new Date());
  const therapistId = isOwner && typeof sp.t === "string" ? sp.t : (myId as string | null);
  if (!therapistId) {
    return (
      <AppShell profile={profile} active="/month">
        <Card title="סיכום חודשי">
          <p className="text-muted">המשתמש שלך עוד לא מוגדר כמטפל.</p>
        </Card>
      </AppShell>
    );
  }

  const [{ data: t }, { data: linesData }, { data: st }] = await Promise.all([
    supabase.from("therapists").select("display_name, split").eq("id", therapistId).maybeSingle(),
    supabase.rpc("settlement_lines", { p_therapist: therapistId, p_month: `${month}-01` }),
    supabase
      .from("settlements")
      .select("*")
      .eq("therapist_id", therapistId)
      .eq("month", `${month}-01`)
      .maybeSingle<Settlement>(),
  ]);
  const lines = (linesData ?? []) as SettlementLine[];
  const sum = totals(lines);
  const status = st?.status ?? "open";
  const own = therapistId === myId;
  const expected = st?.therapist_amount ?? sum.toTherapist;

  let invoiceUrl: string | null = null;
  if (st?.invoice_path) {
    const { data } = await supabase.storage.from("invoices").createSignedUrl(st.invoice_path, 600);
    invoiceUrl = data?.signedUrl ?? null;
  }

  const qs = (m: string) => `/month?m=${m}${isOwner && sp.t ? `&t=${therapistId}` : ""}`;

  return (
    <AppShell profile={profile} active={isOwner && !own ? "/owner/settlements" : "/month"}>
      <Card
        title={`סיכום חודשי · ${t?.display_name ?? ""} · ${formatMonth(month)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={qs(addMonths(month, -1))} className={navBtn}>
              → חודש קודם
            </Link>
            <Link href={qs(addMonths(month, 1))} className={navBtn}>
              חודש הבא ←
            </Link>
            <a href={`/api/settlement?m=${month}&t=${therapistId}`} className={navBtn}>
              הורדה לאקסל
            </a>
          </div>
        }
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Kpi label="מפגשים שהתקיימו" value={String(sum.held)} />
          <Kpi label="ביטולים" value={String(sum.cancelled)} />
          <Kpi label="מגיע למטפל" value={formatShekel(sum.toTherapist)} strong />
          <Kpi label="נשאר למרכז" value={formatShekel(sum.toCenter)} />
        </div>

        <p className="text-sm">
          <span className="text-muted">מצב: </span>
          <strong>{SETTLEMENT_LABEL[status]}</strong>
        </p>
        {sum.unreported > 0 && (
          <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
            {sum.unreported} מפגשים בחודש הזה עוד לא דווחו. צריך לדווח עליהם לפני אישור החודש.
          </p>
        )}

        {status === "open" && (own || isOwner) && <ApproveButton therapistId={therapistId} month={month} />}

        {(status === "approved" || status === "invoiced") && (own || isOwner) && (
          <InvoiceForm therapistId={therapistId} month={month} expected={expected} />
        )}

        {st?.invoice_path && (
          <div className="flex flex-col gap-1 rounded-lg bg-sand p-3 text-sm">
            <span>
              חשבונית: {formatShekel(st.invoice_amount ?? 0)}
              {invoiceUrl && (
                <>
                  {" · "}
                  <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    פתיחת הקובץ
                  </a>
                </>
              )}
            </span>
            {st.invoice_amount !== expected && (
              <span className="font-semibold text-alert-ink">
                שים לב: הסכום בחשבונית שונה מהסכום שחושב ({formatShekel(expected)}).
              </span>
            )}
          </div>
        )}

        {isOwner && status !== "open" && (
          <div className="flex flex-wrap gap-2">
            {status !== "closed" && (
              <form action={setStatusAction.bind(null, therapistId, month, "closed")}>
                <button className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white">
                  סגור חודש (שולם)
                </button>
              </form>
            )}
            <form action={setStatusAction.bind(null, therapistId, month, "open")}>
              <button className="min-h-11 rounded-lg border border-field bg-white px-4 text-sm">
                פתיחה מחדש לתיקון
              </button>
            </form>
          </div>
        )}
      </Card>

      <Card title="קובץ המעקב">
        {lines.length === 0 ? (
          <p className="text-muted">אין מפגשים בחודש הזה.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>תאריך ושעה</Th>
                  <Th>מטופל</Th>
                  <Th>סטטוס</Th>
                  <Th>מחיר</Th>
                  <Th>אופן תשלום</Th>
                  <Th>למטפל</Th>
                  <Th>למרכז</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.session_id} className="border-b border-[#EFEAE0]">
                    <td className="px-2 py-2.5 tabular-nums">{formatDateTime(l.starts_at)}</td>
                    <td className="px-2 py-2.5">{l.client_short}</td>
                    <td className="px-2 py-2.5">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{formatShekel(l.price)}</td>
                    <td className="px-2 py-2.5">{PAYMENT_LABEL[l.payment_method]}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatShekel(l.to_therapist)}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatShekel(l.to_center)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[13px] text-muted">
          {t?.split === "full"
            ? "חלוקה: 100% למטפל."
            : "חלוקה: על מפגש שהתקיים 260 ₪ למטפל והשאר למרכז. ביטול מאוחר: הכול למרכז. ביטול בזמן: ללא חיוב."}
        </p>
      </Card>
    </AppShell>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={"tabular-nums " + (strong ? "text-2xl font-bold" : "text-xl font-semibold")}>{value}</span>
    </div>
  );
}

const navBtn = "flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";
