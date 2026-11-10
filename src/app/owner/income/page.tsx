import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Field, inputClass } from "@/components/field";
import { Th } from "@/components/my-clients";
import { formatShekel } from "@/lib/clients";
import { parseCosts, type MonthIncome } from "@/lib/income";
import { addMonths, formatMonth, monthOf } from "@/lib/time";
import { saveCostsAction } from "./actions";

export default function IncomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await requireRole("owner");
  const supabase = await createClient();
  const now = monthOf(new Date());
  const from = addMonths(now, -11);

  const [{ data }, { data: costsRow }] = await Promise.all([
    supabase.rpc("monthly_income", { p_from: `${from}-01`, p_to: `${now}-01` }),
    supabase.from("app_settings").select("value").eq("key", "monthly_costs").maybeSingle(),
  ]);
  const months = (data ?? []) as MonthIncome[];
  const costs = parseCosts(costsRow?.value);
  const max = Math.max(costs, ...months.map((m) => m.to_center), 1);

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
              <div key={m.month} className="relative flex h-full flex-1 flex-col justify-end">
                <span className="mb-1 text-center text-[10px] tabular-nums text-muted">
                  {m.to_center ? Math.round(m.to_center / 100) / 10 + "K" : ""}
                </span>
                <div
                  className={"rounded-t " + (m.month.startsWith(now) ? "bg-primary" : "bg-[#7FAFBE]")}
                  style={{ height: `${h}%` }}
                />
              </div>
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

      <Card title="פירוט לפי חודש">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-right text-[13px] text-muted">
                <Th>חודש</Th>
                <Th>מפגשים</Th>
                <Th>ביטולים מאוחרים</Th>
                <Th>סה״כ חיובים</Th>
                <Th>למטפלים</Th>
                <Th>למרכז</Th>
                <Th>ייצוא</Th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month} className="border-b border-[#EFEAE0]">
                  <td className="px-2 py-2.5 font-semibold">{formatMonth(m.month.slice(0, 7))}</td>
                  <td className="px-2 py-2.5 tabular-nums">{m.held}</td>
                  <td className="px-2 py-2.5 tabular-nums">{m.late}</td>
                  <td className="px-2 py-2.5 tabular-nums">{formatShekel(m.billed)}</td>
                  <td className="px-2 py-2.5 tabular-nums">{formatShekel(m.to_staff)}</td>
                  <td className="px-2 py-2.5 font-semibold tabular-nums">{formatShekel(m.to_center)}</td>
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
          לפי מפגשים שדווחו (כולל מע״מ): מפגש שהתקיים או בוטל מאוחר נחשב הכנסה. ההכנסות מהמפגשים שלך נכנסות במלואן
          למרכז.
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
