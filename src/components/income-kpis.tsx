import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { formatShekel } from "@/lib/clients";
import { parseCosts, type MonthIncome } from "@/lib/income";
import { formatMonth, monthOf } from "@/lib/time";

// "ראשי": this month's income so far and the break-even gauge.
export async function IncomeKpis() {
  const supabase = await createClient();
  const month = monthOf(new Date());
  const [{ data }, { data: costsRow }] = await Promise.all([
    supabase.rpc("monthly_income", { p_from: `${month}-01`, p_to: `${month}-01` }),
    supabase.from("app_settings").select("value").eq("key", "monthly_costs").maybeSingle(),
  ]);
  const m = ((data ?? []) as MonthIncome[])[0];
  const costs = parseCosts(costsRow?.value);
  const center = m?.to_center ?? 0;
  const pct = costs > 0 ? Math.min(100, Math.round((center / costs) * 100)) : 0;

  return (
    <Card
      title={`הכנסות ${formatMonth(month)} עד עכשיו`}
      actions={
        <Link href="/owner/income" className="text-sm text-primary underline">
          לכל החודשים
        </Link>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi label="נשאר למרכז" value={formatShekel(center)} strong />
        <Kpi label="סה״כ חיובים" value={formatShekel(m?.billed ?? 0)} />
        <Kpi label="שולם / מגיע למטפלים" value={formatShekel(m?.to_staff ?? 0)} />
        <Kpi label="מפגשים שהתקיימו" value={String(m?.held ?? 0)} />
      </div>
      {costs > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px] text-muted">
            <span>נקודת איזון: {formatShekel(costs)} בחודש</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-[#EFEAE0]"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="התקדמות לנקודת האיזון"
          >
            <div className={"h-full rounded-full " + (pct >= 100 ? "bg-[#2E7D3E]" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[13px] text-muted">
            {center >= costs ? "עברת את נקודת האיזון החודש." : `חסרים ${formatShekel(costs - center)} לנקודת האיזון.`}
          </span>
        </div>
      ) : (
        <p className="text-[13px] text-muted">
          כדי לראות נקודת איזון, הגדר את ההוצאות החודשיות ב
          <Link href="/owner/income" className="text-primary underline">
            מסך ההכנסות
          </Link>
          .
        </p>
      )}
    </Card>
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
