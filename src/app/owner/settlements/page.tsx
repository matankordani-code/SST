import { Suspense } from "react";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Th } from "@/components/my-clients";
import { formatShekel } from "@/lib/clients";
import { SETTLEMENT_LABEL, totals, type Settlement, type SettlementLine } from "@/lib/settlements";
import { addMonths, formatMonth, isMonthKey, monthOf } from "@/lib/time";

export default function SettlementsPage({ searchParams }: PageProps<"/owner/settlements">) {
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
  const profile = await requirePerm("settlements", 2);
  const supabase = await createClient();
  const month = isMonthKey(sp.m) ? sp.m : monthOf(new Date());

  const [{ data: therapists }, { data: sts }] = await Promise.all([
    supabase.from("therapists").select("id, display_name, split").eq("is_active", true).order("display_name"),
    supabase.from("settlements").select("*").eq("month", `${month}-01`),
  ]);
  const byT = new Map(((sts ?? []) as Settlement[]).map((s) => [s.therapist_id, s]));

  const rows = await Promise.all(
    (therapists ?? []).map(async (t) => {
      const { data } = await supabase.rpc("settlement_lines", { p_therapist: t.id, p_month: `${month}-01` });
      return { t, sum: totals((data ?? []) as SettlementLine[]), st: byT.get(t.id) };
    }),
  );
  const center = rows.reduce((n, r) => n + r.sum.toCenter, 0);

  return (
    <AppShell profile={profile} active="/owner/settlements">
      <Card
        title={`התחשבנות עם מטפלים · ${formatMonth(month)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/owner/settlements?m=${addMonths(month, -1)}`} className={navBtn}>
              → חודש קודם
            </Link>
            <Link href={`/owner/settlements?m=${addMonths(month, 1)}`} className={navBtn}>
              חודש הבא ←
            </Link>
          </div>
        }
      >
        <p className="text-sm">
          <span className="text-muted">סה״כ למרכז מכל המטפלים: </span>
          <strong className="tabular-nums">{formatShekel(center)}</strong>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-right text-[13px] text-muted">
                <Th>מטפל</Th>
                <Th>התקיימו</Th>
                <Th>לא דווחו</Th>
                <Th>למטפל</Th>
                <Th>למרכז</Th>
                <Th>חשבונית</Th>
                <Th>מצב</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, sum, st }) => {
                const mismatch = st?.invoice_amount != null && st.invoice_amount !== (st.therapist_amount ?? sum.toTherapist);
                return (
                  <tr key={t.id} className="border-b border-[#EFEAE0]">
                    <td className="px-2 py-3">
                      <Link href={`/month?m=${month}&t=${t.id}`} className="font-semibold text-primary underline">
                        {t.display_name}
                      </Link>
                    </td>
                    <td className="px-2 py-3 tabular-nums">{sum.held}</td>
                    <td className={"px-2 py-3 tabular-nums " + (sum.unreported ? "font-semibold text-alert-ink" : "")}>
                      {sum.unreported}
                    </td>
                    <td className="px-2 py-3 tabular-nums">{formatShekel(sum.toTherapist)}</td>
                    <td className="px-2 py-3 tabular-nums">{formatShekel(sum.toCenter)}</td>
                    <td className="px-2 py-3">
                      {st?.invoice_amount != null ? (
                        <span className={mismatch ? "font-semibold text-alert-ink" : ""}>
                          {formatShekel(st.invoice_amount)}
                          {mismatch && " · פער!"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-3 text-[13px]">{SETTLEMENT_LABEL[st?.status ?? "open"]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">
          לוח זמנים מוצע: אישור עד ה-3 בחודש, חשבונית עד ה-5, ותשלום עד ה-10. לחץ על שם מטפל כדי לראות את הקובץ, את
          החשבונית ולסגור את החודש.
        </p>
      </Card>
    </AppShell>
  );
}

const navBtn = "flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";
