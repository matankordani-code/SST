import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { formatShekel } from "@/lib/clients";
import { parseCosts, type IncomeSources, type MonthIncome } from "@/lib/income";
import { formatMonth, monthOf } from "@/lib/time";

// "ראשי": money in this month so far, by source, and the break-even gauge.
// Per the prototype: per-session clients count when the session is held,
// punch cards when they are bought.
export async function IncomeKpis() {
  const supabase = await createClient();
  const month = monthOf(new Date());
  const day1 = `${month}-01`;
  const [{ data: src, error: srcError }, { data: old }, { data: costsRow }] = await Promise.all([
    supabase.rpc("income_sources", { p_from: day1, p_to: day1 }),
    supabase.rpc("monthly_income", { p_from: day1, p_to: day1 }),
    supabase.from("app_settings").select("value").eq("key", "monthly_costs").maybeSingle(),
  ]);
  const costs = parseCosts(costsRow?.value);

  // Before migration 0017: fall back to "billed from reported sessions".
  const s = !srcError ? ((src ?? []) as IncomeSources[])[0] : undefined;
  const o = ((old ?? []) as MonthIncome[])[0];
  const lines = s
    ? [
        { label: `טיפולים בתשלום בודד שהתקיימו (${s.single_count})`, value: s.single_billed },
        { label: `כרטיסיות שנרכשו (${s.card_count})`, value: s.card_sales },
      ]
    : [{ label: `מפגשים שהתקיימו (${o?.held ?? 0})`, value: o?.billed ?? 0 }];
  const total = lines.reduce((n, l) => n + l.value, 0);
  const toStaff = s?.to_staff ?? o?.to_staff ?? 0;
  const center = total - toStaff;
  const held = s?.held ?? o?.held ?? 0;
  const pct = costs > 0 ? Math.max(0, Math.min(100, Math.round((center / costs) * 100))) : 0;

  return (
    <Card
      title={`הכנסות ${formatMonth(month)} עד עכשיו`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/income?m=${month}`}
            className="flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand"
          >
            ייצוא החודש לאקסל (לרואה החשבון)
          </a>
          <Link href="/owner/income" className="text-sm text-primary underline">
            לכל החודשים
          </Link>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[13px] text-muted">סה״כ נכנס החודש</p>
            <p className="text-3xl font-bold tabular-nums">{formatShekel(total)}</p>
          </div>
          <dl className="flex flex-col divide-y divide-[#EDE4D3] text-sm">
            {lines.map((l) => (
              <Row key={l.label} label={l.label} value={formatShekel(l.value)} />
            ))}
            <Row label="לתשלום למטפלים" value={`− ${formatShekel(toStaff)}`} muted />
            <Row label="נשאר למרכז" value={formatShekel(center)} strong />
          </dl>
          <p className="text-[13px] text-muted">
            {held} מפגשים התקיימו החודש. מפגש בכרטיסייה נחשב הכנסה כשהכרטיסייה נרכשת.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-2 rounded-lg border border-line bg-sand p-4">
          <p className="font-semibold">נקודת איזון החודש</p>
          {costs > 0 ? (
            <>
              <div className="flex justify-between text-[13px] text-muted">
                <span>הוצאות קבועות: {formatShekel(costs)}</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
              <div
                className="h-3 overflow-hidden rounded-full bg-[#E3DCCF]"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="התקדמות לנקודת האיזון"
              >
                <div className={"h-full rounded-full " + (pct >= 100 ? "bg-[#2E7D3E]" : "bg-primary")} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[13px] text-muted">
                {center >= costs
                  ? "ההוצאות החודשיות כוסו. מכאן כל מפגש הוא רווח."
                  : `חסרים ${formatShekel(costs - center)} לנקודת האיזון.`}
              </span>
            </>
          ) : (
            <p className="text-[13px] text-muted">
              כדי לראות נקודת איזון, הגדר את ההוצאות החודשיות ב
              <Link href="/owner/income" className="text-primary underline">
                מסך ההכנסות
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={muted ? "text-muted" : ""}>{label}</dt>
      <dd className={"tabular-nums " + (strong ? "text-lg font-bold" : muted ? "text-muted" : "font-semibold")}>{value}</dd>
    </div>
  );
}

export function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={"tabular-nums " + (strong ? "text-2xl font-bold" : "text-xl font-semibold")}>{value}</span>
    </div>
  );
}
