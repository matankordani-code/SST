import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { formatShekel } from "@/lib/clients";
import { WEEKDAY_LABEL, hhmm, type MemberPlan, type Training } from "@/lib/club";
import { addDays, dayKey, formatDate, weekStart } from "@/lib/time";

const PLAN: Record<MemberPlan, { label: string; price: number }> = {
  community: { label: "מנוי קהילה", price: 220 },
  storage: { label: "אחסון גלשן", price: 70 },
};

// "ראשי" · this week's community trainings (occupancy, waitlists) and the active subscriptions.
export async function ClubSummary() {
  const supabase = await createClient();
  const week = weekStart(dayKey(new Date()));
  const end = addDays(week, 6);

  const [{ data: tData }, { data: regs }, { data: members }] = await Promise.all([
    supabase.from("trainings").select("*").eq("is_active", true).order("weekday").order("start_time"),
    supabase.from("registrations").select("training_id, status").gte("on_date", week).lte("on_date", end).neq("status", "cancelled"),
    supabase.from("members").select("plan").eq("is_active", true),
  ]);
  const trainings = (tData ?? []) as Training[];
  const r = (regs ?? []) as { training_id: string; status: string }[];
  const count = (id: string, status: string) => r.filter((x) => x.training_id === id && x.status === status).length;

  const totalReg = r.filter((x) => x.status === "registered").length;
  const waiting = r.filter((x) => x.status === "waitlist").length;
  const capacity = trainings.reduce((n, t) => n + t.capacity, 0);
  const occupancy = capacity > 0 ? Math.round((totalReg / capacity) * 100) : 0;

  const byPlan = (Object.keys(PLAN) as MemberPlan[]).map((p) => {
    const n = (members ?? []).filter((m) => m.plan === p).length;
    return { ...PLAN[p], n, monthly: n * PLAN[p].price };
  });

  return (
    <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
      <Card
        title={`אימוני קהילה · ${formatDate(week).slice(0, -5)}–${formatDate(end).slice(0, -5)}`}
        actions={
          <Link href="/club" className="text-sm text-primary underline">
            למועדון
          </Link>
        }
      >
        {trainings.length === 0 ? (
          <p className="text-muted">אין עדיין אימונים בלו״ז.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {totalReg} הרשמות · תפוסה ממוצעת {occupancy}%{waiting > 0 ? ` · ${waiting} ברשימות המתנה` : ""}
            </p>
            <ul className="flex flex-col divide-y divide-[#EDE4D3] text-sm">
              {trainings.map((t) => {
                const reg = count(t.id, "registered");
                const wait = count(t.id, "waitlist");
                const full = reg >= t.capacity;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="text-muted">
                        {WEEKDAY_LABEL[t.weekday]} {hhmm(t.start_time)}
                      </span>{" "}
                      <strong>{t.name}</strong>
                      {t.coach ? <span className="text-muted"> · {t.coach}</span> : null}
                    </span>
                    <span className={"tabular-nums " + (full ? "font-semibold text-alert-ink" : "")}>
                      {reg}/{t.capacity}
                      {wait > 0 ? ` · ${wait} בהמתנה` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <Card title="מנויים פעילים">
        <ul className="flex flex-col divide-y divide-[#EDE4D3] text-sm">
          {byPlan.map((p) => (
            <li key={p.label} className="flex items-center justify-between gap-2 py-2">
              <span>
                <strong>{p.label}</strong> <span className="text-muted">· {formatShekel(p.price)} לחודש</span>
              </span>
              <span className="tabular-nums">
                {p.n} · {formatShekel(p.monthly)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted">הסכום הוא הצפי לחודש. גביית המנויים במערכת תתווסף עם התשלום החודשי והוראת הקבע.</p>
      </Card>
    </div>
  );
}
