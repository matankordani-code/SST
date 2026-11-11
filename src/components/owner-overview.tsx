import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { Tile } from "@/components/stat-tile";
import { addDays, addMonths, dayKey, israelToUtc, monthOf, weekStart } from "@/lib/time";

const COLORS = ["#2F5D73", "#2F7B96", "#CCB89E", "#E3A97C", "#9DB8A6", "#7FA6B8"];
const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"];

// The owner's overview at the top of the dashboard: four tiles, then clients by
// therapist (donut), sessions per day this week (bars) and signed health
// declarations (ring). Everything from live data.
export async function OwnerOverview() {
  const supabase = await createClient();
  const now = new Date();
  const today = dayKey(now);
  const month = monthOf(now);
  const iso = (day: string) => israelToUtc(day, "00:00").toISOString();
  const week = weekStart(today);
  // Same point in last month, for a fair comparison.
  const lastMonthSameDay = `${addMonths(month, -1)}-${today.slice(8, 10)}`;

  const [{ data: clientRows }, { data: therapists }, { data: monthRows }, { data: lastRows }, { data: weekRows }, { count: unreported }, { data: decl }] =
    await Promise.all([
      supabase.from("clients").select("id, therapist_id").eq("is_active", true),
      supabase.from("therapists").select("id, display_name").eq("is_active", true),
      supabase.from("sessions").select("id").eq("status", "held").gte("starts_at", iso(`${month}-01`)).lt("starts_at", now.toISOString()),
      supabase
        .from("sessions")
        .select("id")
        .eq("status", "held")
        .gte("starts_at", iso(`${addMonths(month, -1)}-01`))
        .lt("starts_at", iso(lastMonthSameDay)),
      supabase.from("sessions").select("starts_at, status").gte("starts_at", iso(week)).lt("starts_at", iso(addDays(week, 7))).neq("status", "cancelled_ontime"),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "planned")
        .lt("starts_at", now.toISOString())
        .gte("starts_at", iso(addDays(today, -60))),
      supabase.from("declarations").select("client_id").eq("kind", "health").eq("status", "signed"),
    ]);

  const clients = (clientRows ?? []) as { id: string; therapist_id: string }[];
  const names = new Map(((therapists ?? []) as { id: string; display_name: string }[]).map((t) => [t.id, t.display_name]));
  const held = (monthRows ?? []).length;
  const heldLast = (lastRows ?? []).length;
  const change = heldLast ? Math.round(((held - heldLast) / heldLast) * 100) : null;

  // Donut: active clients per therapist (largest first, the rest grouped).
  const byTherapist = [...clients.reduce((m, c) => m.set(c.therapist_id, (m.get(c.therapist_id) ?? 0) + 1), new Map<string, number>())]
    .map(([id, n]) => ({ name: names.get(id) ?? "אחר", n }))
    .sort((a, b) => b.n - a.n);
  const slices = byTherapist.length > 5 ? [...byTherapist.slice(0, 4), { name: "אחרים", n: byTherapist.slice(4).reduce((s, x) => s + x.n, 0) }] : byTherapist;
  const totalClients = clients.length;

  // Bars: this week's sessions per day (Sunday to Friday), held or planned.
  const perDay = DAY_SHORT.map((label, i) => {
    const d = addDays(week, i);
    const rows = ((weekRows ?? []) as { starts_at: string; status: string }[]).filter((r) => dayKey(new Date(r.starts_at)) === d);
    return { label, d, n: rows.length, past: d < today, isToday: d === today };
  });
  const maxDay = Math.max(4, ...perDay.map((p) => p.n));
  const step = maxDay <= 8 ? 2 : maxDay <= 20 ? 5 : 10;
  const top = Math.ceil(maxDay / step) * step;

  // Ring: active clients with a signed health declaration.
  const signedIds = new Set(((decl ?? []) as { client_id: string }[]).map((d) => d.client_id));
  const signed = clients.filter((c) => signedIds.has(c.id)).length;
  const pct = totalClients ? Math.round((signed / totalClients) * 100) : 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon="people" label="מטופלים פעילים" value={String(totalClients)} sub={`אצל ${byTherapist.length} מטפלים`} />
        <Tile
          icon="check"
          tone="sage"
          label="טיפולים החודש"
          value={String(held)}
          sub={change === null ? "התקיימו עד היום" : `${change >= 0 ? "↑" : "↓"} ${Math.abs(change)}% מאותה נקודה בחודש שעבר`}
        />
        <Tile
          icon="alert"
          label="ממתינים לדיווח"
          value={String(unreported ?? 0)}
          sub={unreported ? "מפגשים שעברו ולא סומנו" : "הכול מדווח"}
          alert={!!unreported}
        />
        <Tile icon="check" tone="sand" label="הצהרות חתומות" value={`${pct}%`} sub={`${signed} מתוך ${totalClients} מטופלים`} alert={pct < 80 && totalClients > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr_0.9fr]">
        <Card title="מטופלים לפי מטפל">
          {totalClients === 0 ? (
            <p className="text-muted">אין עדיין מטופלים פעילים.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-5">
              <Donut slices={slices} total={totalClients} />
              <ul className="flex min-w-[140px] flex-1 flex-col gap-2 text-sm">
                {slices.map((s, i) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <i className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {s.name}
                    <span className="ms-auto tabular-nums text-muted">
                      {s.n} · {Math.round((s.n / totalClients) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="מפגשים השבוע">
          <svg viewBox="0 0 360 190" className="w-full" role="img" aria-label={`מפגשים לפי יום: ${perDay.map((p) => `${p.label} ${p.n}`).join(", ")}`}>
            {Array.from({ length: top / step + 1 }, (_, k) => k * step).map((v) => {
              const y = 160 - (v / top) * 140;
              return (
                <g key={v}>
                  <line x1="40" x2="352" y1={y} y2={y} stroke="#E6DCC8" />
                  <text x="30" y={y + 4} textAnchor="end" fontSize="11" fill="#66767D">
                    {v}
                  </text>
                </g>
              );
            })}
            {perDay.map((p, i) => {
              // Right-to-left: Sunday on the right.
              const x = 318 - i * 52;
              const h = (p.n / top) * 140;
              return (
                <g key={p.d}>
                  <rect x={x} y={160 - h} width="30" height={Math.max(h, p.n ? 2 : 0)} rx="7" fill={p.isToday ? "#E3A97C" : p.past ? "#2F5D73" : "#9FC2D0"} />
                  {p.n > 0 && (
                    <text x={x + 15} y={152 - h} textAnchor="middle" fontSize="11" fontWeight="600" fill="#2F5D73">
                      {p.n}
                    </text>
                  )}
                  <text x={x + 15} y="180" textAnchor="middle" fontSize="12" fill={p.isToday ? "#2F5D73" : "#66767D"} fontWeight={p.isToday ? 700 : 400}>
                    {p.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="flex flex-wrap gap-3 text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-primary" />עבר</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-peach" />היום</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#9FC2D0]" />מתוכנן</span>
          </p>
        </Card>

        <Card title="הצהרות בריאות">
          <div className="relative flex flex-col items-center overflow-hidden pb-12">
            <svg width="150" height="150" viewBox="0 0 42 42" role="img" aria-label={`${pct}% מהמטופלים חתמו`}>
              <circle cx="21" cy="21" r="16" fill="none" stroke="#EFE7D8" strokeWidth="3.4" />
              <circle
                cx="21"
                cy="21"
                r="16"
                fill="none"
                stroke="#2F5D73"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 100.5} 100.5`}
                transform="rotate(-90 21 21)"
              />
              <text x="21" y="22.5" textAnchor="middle" fontSize="8" fontWeight="600" fill="#2F5D73">
                {pct}%
              </text>
              <text x="21" y="28" textAnchor="middle" fontSize="3.2" fill="#66767D">
                {signed} מתוך {totalClients}
              </text>
            </svg>
            <svg className="absolute inset-x-0 bottom-0 h-14 w-full" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 30 C40 14 80 44 130 28 S220 12 300 26 V60 H0Z" fill="#2F7B96" opacity=".22" />
              <path d="M0 42 C50 30 100 56 160 40 S250 30 300 40 V60 H0Z" fill="#2F5D73" opacity=".3" />
            </svg>
          </div>
        </Card>
      </div>
    </>
  );
}

function Donut({ slices, total }: { slices: { name: string; n: number }[]; total: number }) {
  // Each slice starts where the previous ended, from 12 o'clock.
  const arcs = slices.map((s, i) => {
    const before = slices.slice(0, i).reduce((n, x) => n + (x.n / total) * 100, 0);
    return { ...s, len: (s.n / total) * 100, offset: 25 - before };
  });
  return (
    <svg width="140" height="140" viewBox="0 0 42 42" aria-hidden="true">
      <circle cx="21" cy="21" r="15.915" fill="none" stroke="#EFE7D8" strokeWidth="7" />
      {arcs.map((a, i) => (
        <circle
          key={a.name}
          cx="21"
          cy="21"
          r="15.915"
          fill="none"
          stroke={COLORS[i % COLORS.length]}
          strokeWidth="7"
          strokeDasharray={`${a.len} ${100 - a.len}`}
          strokeDashoffset={a.offset}
        />
      ))}
      <text x="21" y="23" textAnchor="middle" fontSize="7" fontWeight="600" fill="#2F5D73">
        {total}
      </text>
    </svg>
  );
}
