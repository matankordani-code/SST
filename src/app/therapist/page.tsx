import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NO_ID, myTherapistId } from "@/lib/view";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { MyClients, Tile } from "@/components/my-clients";
import { StatusBadge } from "@/components/status-badge";
import { WeekGrid, type GridSession } from "@/app/calendar/week-grid";
import { SESSION_SELECT, type CardUsage, type SessionRow } from "@/lib/sessions";
import { cardStatus } from "@/lib/cards";
import { addDays, dayKey, formatDateTime, formatDay, israelToUtc, monthOf, addMonths, timeOf, weekStart } from "@/lib/time";

// The therapist's (or surf instructor's) own dashboard: today, what's waiting
// for a report, this week's grid and their clients. No center money here.
export default function TherapistPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await requireRole("therapist", "surf_instructor");
  const supabase = await createClient();
  const myId = (await myTherapistId(profile, supabase)) ?? NO_ID;
  const instructor = profile.role === "surf_instructor";
  const word = instructor ? "שיעורים" : "טיפולים";

  const now = new Date();
  const nowMs = now.getTime();
  const today = dayKey(now);
  const week = weekStart(today);
  const month = monthOf(now);
  const iso = (day: string) => israelToUtc(day, "00:00").toISOString();

  const [{ data: weekData }, { data: pendingData }, { data: monthData }, { data: nextData }, { data: clientRows }] = await Promise.all([
    supabase.from("sessions").select(SESSION_SELECT).eq("therapist_id", myId).gte("starts_at", iso(week)).lt("starts_at", iso(addDays(week, 7))).order("starts_at"),
    // Past sessions still marked "planned" (last 60 days): waiting for a report.
    supabase
      .from("sessions")
      .select(SESSION_SELECT)
      .eq("therapist_id", myId)
      .eq("status", "planned")
      .gte("starts_at", iso(addDays(today, -60)))
      .lt("starts_at", now.toISOString())
      .order("starts_at"),
    supabase
      .from("sessions")
      .select("id")
      .eq("therapist_id", myId)
      .eq("status", "held")
      .gte("starts_at", iso(`${month}-01`))
      .lt("starts_at", iso(`${addMonths(month, 1)}-01`)),
    // The next sessions from now (for "today / next work day").
    supabase.from("sessions").select(SESSION_SELECT).eq("therapist_id", myId).gte("starts_at", iso(today)).lt("starts_at", iso(addDays(today, 15))).order("starts_at"),
    supabase.from("clients").select("id, full_name, payment_method").eq("therapist_id", myId).eq("is_active", true).order("full_name"),
  ]);

  const weekSessions = (weekData ?? []) as unknown as SessionRow[];
  const pending = (pendingData ?? []) as unknown as SessionRow[];
  const heldMonth = (monthData ?? []).length;
  const upcoming = ((nextData ?? []) as unknown as SessionRow[]).filter((s) => s.status === "planned" || dayKey(new Date(s.starts_at)) === today);
  const nextDay = upcoming.length ? dayKey(new Date(upcoming[0].starts_at)) : today;
  const dayList = upcoming.filter((s) => dayKey(new Date(s.starts_at)) === nextDay);
  const clients = (clientRows ?? []) as { id: string; full_name: string; payment_method: string }[];

  // Cards about to run out, and intake declarations not signed yet.
  const cardClientIds = clients.filter((c) => c.payment_method !== "single").map((c) => c.id);
  const allIds = clients.length ? clients.map((c) => c.id) : [NO_ID];
  const [{ data: cardsData }, { data: declData }] = await Promise.all([
    cardClientIds.length ? supabase.from("punch_card_usage").select("*").in("client_id", cardClientIds) : Promise.resolve({ data: [] }),
    supabase.from("declarations").select("client_id, status").in("client_id", allIds),
  ]);
  const cards = (cardsData ?? []) as CardUsage[];
  const renew = clients
    .filter((c) => c.payment_method !== "single")
    .map((c) => ({ c, st: cardStatus(cards.filter((k) => k.client_id === c.id), today) }))
    .filter((x) => !x.st || x.st.renew);
  const decl = (declData ?? []) as { client_id: string; status: string }[];
  const unsigned = clients.filter((c) => decl.some((d) => d.client_id === c.id) && !decl.some((d) => d.client_id === c.id && d.status === "signed"));

  const weekHeld = weekSessions.filter((s) => s.status === "held").length;
  const weekPlanned = weekSessions.filter((s) => s.status === "planned").length;
  const todayCount = weekSessions.filter((s) => dayKey(new Date(s.starts_at)) === today && !s.status.startsWith("cancelled")).length;

  const grid: GridSession[] = weekSessions.map((s) => ({
    id: s.id,
    day: dayKey(new Date(s.starts_at)),
    time: timeOf(new Date(s.starts_at)),
    client: s.client?.full_name ?? "",
    therapist: s.therapist?.display_name ?? "",
    status: s.status,
    past: new Date(s.starts_at).getTime() < nowMs,
  }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const name = (profile.viewAs?.name ?? profile.full_name ?? "").split(" ")[0];

  return (
    <AppShell profile={profile} active="/therapist">
      <h2 className="text-xl font-bold">שלום{name ? `, ${name}` : ""}</h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <Tile label="היום" value={String(todayCount)} sub={`${word} ב-${formatDay(today)}`} />
        <Tile label="השבוע" value={String(weekHeld + weekPlanned)} sub={`${weekHeld} התקיימו · ${weekPlanned} מתוכננים`} />
        <Tile label="התקיימו החודש" value={String(heldMonth)} sub={word} />
        <Tile label="ממתינים לדיווח" value={String(pending.length)} sub={pending.length ? "לסמן התקיים או ביטול" : "הכול מדווח"} alert={pending.length > 0} />
        <Tile label={instructor ? "תלמידים" : "מטופלים פעילים"} value={String(clients.length)} sub={renew.length ? `${renew.length} כרטיסיות לחידוש` : "אין כרטיסיות לחידוש"} alert={renew.length > 0} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title={nextDay === today ? "היום שלי" : `יום העבודה הבא · ${formatDay(nextDay)}`}
          actions={
            <Link href="/today" className="text-sm text-primary underline">
              פירוט מלא
            </Link>
          }
        >
          {dayList.length === 0 ? (
            <p className="text-muted">אין {word} בשבועיים הקרובים.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#EFEAE0]">
              {dayList.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-bold tabular-nums" dir="ltr">
                    {timeOf(new Date(s.starts_at))}
                  </span>
                  <Link href={`/sessions/${s.id}`} className="font-semibold text-primary underline">
                    {s.client?.full_name}
                  </Link>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="דורש טיפול">
          {pending.length === 0 && renew.length === 0 && unsigned.length === 0 ? (
            <p className="text-muted">אין כרגע משהו פתוח. 👌</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {pending.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#FBEBDD] px-2 py-0.5 text-[12px] text-[#7A3A0E]">לדווח</span>
                  <Link href={`/sessions/${s.id}`} className="text-primary underline">
                    {s.client?.full_name} · {formatDateTime(s.starts_at)}
                  </Link>
                </li>
              ))}
              {renew.map(({ c, st }) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#FBF1DD] px-2 py-0.5 text-[12px] text-[#6B4A12]">כרטיסייה</span>
                  <Link href={`/clients/${c.id}`} className="text-primary underline">
                    {c.full_name}
                  </Link>
                  <span className="text-muted">{st ? (st.remaining === 0 ? "נגמרה" : "נשאר מפגש אחד") : "אין כרטיסייה רשומה"}</span>
                </li>
              ))}
              {unsigned.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#E3F0F4] px-2 py-0.5 text-[12px] text-[#15505F]">הצהרה</span>
                  <Link href={`/clients/${c.id}`} className="text-primary underline">
                    {c.full_name}
                  </Link>
                  <span className="text-muted">עוד לא חתם/ה</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title={`השבוע שלי · ${formatDay(week)}`}
        actions={
          <Link href="/calendar" className="flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand">
            ליומן המלא
          </Link>
        }
      >
        <WeekGrid
          key={weekSessions.map((x) => x.id + x.starts_at + x.status).join("|")}
          days={days}
          today={today}
          sessions={grid}
          clients={clients.map((c) => ({ id: c.id, label: c.full_name }))}
          showTherapist={false}
        />
      </Card>

      <MyClients profile={profile} tiles={false} />
    </AppShell>
  );
}
