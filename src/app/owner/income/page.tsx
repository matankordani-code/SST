import { Suspense } from "react";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Field, inputClass } from "@/components/field";
import { Th } from "@/components/my-clients";
import { formatShekel } from "@/lib/clients";
import { parseCosts, type IncomeSources, type MonthIncome } from "@/lib/income";
import { addMonths, formatMonth, monthOf } from "@/lib/time";
import { saveCostsAction } from "./actions";

export default function IncomePage({ searchParams }: PageProps<"/owner/income">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

type Row = MonthIncome & { single_billed: number; single_count: number; card_sales: number; card_count: number; total_in: number };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const profile = await requirePerm("income", 2);
  const supabase = await createClient();
  const now = monthOf(new Date());
  const from = addMonths(now, -11);

  const [{ data }, { data: src, error: srcError }, { data: costsRow }] = await Promise.all([
    supabase.rpc("monthly_income", { p_from: `${from}-01`, p_to: `${now}-01` }),
    supabase.rpc("income_sources", { p_from: `${from}-01`, p_to: `${now}-01` }),
    supabase.from("app_settings").select("value").eq("key", "monthly_costs").maybeSingle(),
  ]);
  const sources = srcError ? [] : ((src ?? []) as IncomeSources[]);
  // Money in, as on the dashboard: per-session clients when held, cards when bought.
  // (Before migration 0017: the older "billed from reported sessions".)
  const months: Row[] = ((data ?? []) as MonthIncome[]).map((m) => {
    const s = sources.find((x) => x.month === m.month);
    if (!s) return { ...m, single_billed: m.billed, single_count: m.held, card_sales: 0, card_count: 0, total_in: m.billed };
    const total = s.single_billed + s.card_sales;
    return { ...m, ...s, total_in: total, to_center: total - s.to_staff };
  });
  const costs = parseCosts(costsRow?.value);
  const max = Math.max(costs, ...months.map((m) => m.to_center), 1);
  const wanted = typeof sp.m === "string" ? sp.m : "";
  const selected = wanted && months.some((m) => m.month.startsWith(wanted)) ? wanted : now;
  const detail = months.find((m) => m.month.startsWith(selected));

  return (
    <AppShell profile={profile} active="/owner/income">
      <Card title="הכנסות לפי חודש · 12 חודשים">
        <div
          className="flex h-56 items-end gap-1.5 border-b border-line pt-6"
          role="img"
          aria-label={`הכנסה למרכז לפי חודש: ${months.map((m) => `${formatMonth(m.month.slice(0, 7))} ${m.to_center} ₪`).join(", ")}`}
        >
          {months.map((m) => {
            const h = Math.round((m.to_center / max) * 100);
            return (
              <a
                key={m.month}
                href={`/owner/income?m=${m.month.slice(0, 7)}`}
                aria-label={`פירוט ${formatMonth(m.month.slice(0, 7))}`}
                className={"relative flex h-full flex-1 flex-col justify-end rounded-t " + (m.month.startsWith(selected) ? "outline outline-2 outline-offset-2 outline-primary" : "")}
              >
                <span className="mb-1 text-center text-[10px] tabular-nums text-muted">
                  {m.to_center ? Math.round(m.to_center / 100) / 10 + "K" : ""}
                </span>
                <div
                  className={"rounded-t " + (m.month.startsWith(now) ? "bg-primary" : "bg-[#7FAFBE]")}
                  style={{ height: `${h}%` }}
                />
              </a>
            );
          })}
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {months.map((m) => (
            <span key={m.month} className="flex-1 text-center text-[10px] text-muted">
              {m.month.slice(5, 7)}/{m.month.slice(2, 4)}
            </span>
          ))}
        </div>
        {costs > 0 && (
          <p className="text-[13px] text-muted">
            נקודת איזון: {formatShekel(costs)} בחודש. חודשים מעליה:{" "}
            {months.filter((m) => m.to_center >= costs).length} מתוך {months.length}.
          </p>
        )}
      </Card>

      {detail && (
        <Card
          title={`פירוט · ${formatMonth(detail.month.slice(0, 7))}`}
          actions={
            <a
              href={`/api/income?m=${detail.month.slice(0, 7)}`}
              className="flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand"
            >
              ייצוא {formatMonth(detail.month.slice(0, 7))} לאקסל
            </a>
          }
        >
          <p className="text-[13px] text-muted">{detail.month.startsWith(now) ? "חודש נוכחי · מתעדכן עם כל דיווח ותשלום" : "חודש שהסתיים"}</p>
          <dl className="flex max-w-xl flex-col divide-y divide-[#EDE4D3] text-sm">
            <DRow label={`טיפולים בתשלום בודד (${detail.single_count})`} value={formatShekel(detail.single_billed)} />
            <DRow label={`כרטיסיות שנרכשו (${detail.card_count})`} value={formatShekel(detail.card_sales)} />
            <DRow label="סה״כ נכנס" value={formatShekel(detail.total_in)} strong />
            <DRow label="לתשלום למטפלים" value={`− ${formatShekel(detail.to_staff)}`} />
            <DRow label="נשאר למרכז" value={formatShekel(detail.to_center)} strong />
            {detail.surf_center > 0 && <DRow label="מזה שיעורי גלישה (למרכז)" value={formatShekel(detail.surf_center)} />}
          </dl>
          <p className="text-[12px] text-muted">לחץ על עמודה בגרף, או על חודש בטבלה, כדי לראות את הפירוט שלו.</p>
        </Card>
      )}

      <Card title="פירוט לפי חודש">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="text-right text-[13px] text-muted">
                <Th>חודש</Th>
                <Th>מפגשים</Th>
                <Th>ביטולים מאוחרים</Th>
                <Th>בודדים</Th>
                <Th>כרטיסיות</Th>
                <Th>סה״כ נכנס</Th>
                <Th>למטפלים</Th>
                <Th>למרכז</Th>
                <Th>מזה גלישה</Th>
                <Th>ייצוא</Th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month} className="border-b border-[#EDE4D3]">
                  <td className="px-2 py-2.5 font-semibold">
                    <a href={`/owner/income?m=${m.month.slice(0, 7)}`} className="text-primary underline">
                      {formatMonth(m.month.slice(0, 7))}
                    </a>
                  </td>
                  <td className="px-2 py-2.5 tabular-nums">{m.held}</td>
                  <td className="px-2 py-2.5 tabular-nums">{m.late}</td>
                  <td className="px-2 py-2.5 tabular-nums">{formatShekel(m.single_billed)}</td>
                  <td className="px-2 py-2.5 tabular-nums">{formatShekel(m.card_sales)}</td>
                  <td className="px-2 py-2.5 tabular-nums">{formatShekel(m.total_in)}</td>
                  <td className="px-2 py-2.5 tabular-nums">{formatShekel(m.to_staff)}</td>
                  <td className="px-2 py-2.5 font-semibold tabular-nums">{formatShekel(m.to_center)}</td>
                  <td className="px-2 py-2.5 tabular-nums text-muted">{m.surf_center ? formatShekel(m.surf_center) : "—"}</td>
                  <td className="px-2 py-2.5">
                    <a href={`/api/income?m=${m.month.slice(0, 7)}`} className="text-primary underline">
                      אקסל
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">
          הכול כולל מע״מ. מטופל שמשלם לכל מפגש: הכנסה כשהמפגש התקיים או בוטל מאוחר. כרטיסייה: הכנסה כשהיא נרכשת
          (כרטיסיות שיובאו מהאקסל לא נספרות). ההכנסות מהמפגשים שלך נכנסות במלואן למרכז.
        </p>
      </Card>

      <Card title="נקודת איזון">
        <form action={saveCostsAction} className="flex flex-wrap items-end gap-3">
          <Field label="הוצאות קבועות בחודש (₪)">
            <input name="costs" type="number" min={0} defaultValue={costs || ""} className={inputClass + " max-w-48"} />
          </Field>
          <button type="submit" className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white">
            שמירה
          </button>
        </form>
        <p className="text-[13px] text-muted">שכירות, ביטוחים, מנויים ותוכנות, ציוד וכו׳. משמש למד נקודת האיזון.</p>
      </Card>
    </AppShell>
  );
}

function DRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt>{label}</dt>
      <dd className={"tabular-nums " + (strong ? "text-lg font-bold" : "font-semibold")}>{value}</dd>
    </div>
  );
}
