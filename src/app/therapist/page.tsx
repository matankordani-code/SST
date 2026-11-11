import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NO_ID, myTherapistId } from "@/lib/view";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { MyClients, Th, Tile } from "@/components/my-clients";
import { PAYMENT_LABEL, formatShekel, type PaymentMethod } from "@/lib/clients";
import { StatusBadge } from "@/components/status-badge";
import { ReportButton } from "@/components/report-panel";
import { WeekGrid, type GridSession } from "@/app/calendar/week-grid";
import { SESSION_SELECT, type CardUsage, type SessionRow } from "@/lib/sessions";
import { cardStatus } from "@/lib/cards";
import { addDays, dayKey, formatDate, formatDateTime, formatDay, israelToUtc, monthOf, addMonths, timeOf, weekStart } from "@/lib/time";

// The therapist's (or surf instructor's) own dashboard: today, what's waiting
// for a report, payments and links sent, this week's grid and their clients.
// Only their own clients' money; the center's income is not shown here.
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
  // Session reports (summaries) are for therapists, not surf instructors.
  const reports = !instructor;

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
  const [{ data: cardsData }, { data: declData }, { data: payData }, { data: reqData }] = await Promise.all([
    cardClientIds.length ? supabase.from("punch_card_usage").select("*").in("client_id", cardClientIds) : Promise.resolve({ data: [] }),
    supabase.from("declarations").select("client_id, status").in("client_id", allIds),
    // My clients' payments (RLS: the treating therapist sees them).
    supabase
      .from("payments")
      .select("id, amount, kind, source, morning_document_number, paid_at, client:clients(full_name)")
      .in("client_id", allIds)
      .gte("paid_at", iso(addDays(today, -90)))
      .order("paid_at", { ascending: false }),
    supabase
      .from("payment_requests")
      .select("id, amount, kind, created_at, client_id, client:clients(full_name)")
      .in("client_id", allIds)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
  ]);
  type Pay = { id: string; amount: number; kind: PaymentMethod; source: string; morning_document_number: string | null; paid_at: string; client: { full_name: string } | null };
  type Req = { id: string; amount: number; kind: PaymentMethod; created_at: string; client_id: string; client: { full_name: string } | null };
  const pays = (payData ?? []) as unknown as Pay[];
  const openReqs = (reqData ?? []) as unknown as Req[];
  const monthStartIso = iso(`${month}-01`);
  const paidMonth = pays.filter((p) => p.paid_at >= monthStartIso).reduce((n, p) => n + p.amount, 0);

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

  return (
    <AppShell profile={profile} active="/therapist" greet>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        <Tile icon="clock" label="היום" value={String(todayCount)} sub={`${word} ב-${formatDay(today)}`} />
        <Tile icon="calendar" tone="sage" label="השבוע" value={String(weekHeld + weekPlanned)} sub={`${weekHeld} התקיימו · ${weekPlanned} מתוכננים`} />
        <Tile icon="check" tone="sand" label="התקיימו החודש" value={String(heldMonth)} sub={word} />
        <Tile icon="alert" label="ממתינים לדיווח" value={String(pending.length)} sub={pending.length ? "לסמן התקיים או ביטול" : "הכול מדווח"} alert={pending.length > 0} />
        <Tile icon="people" label={instructor ? "תלמידים" : "מטופלים פעילים"} value={String(clients.length)} sub={renew.length ? `${renew.length} כרטיסיות לחידוש` : "אין כרטיסיות לחידוש"} alert={renew.length > 0} />
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
            <ul className="flex flex-col divide-y divide-[#EDE4D3]">
              {dayList.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-bold tabular-nums" dir="ltr">
                    {timeOf(new Date(s.starts_at))}
                  </span>
                  <Link href={`/sessions/${s.id}`} className="font-semibold text-primary underline">
                    {s.client?.full_name}
                  </Link>
                  <StatusBadge status={s.status} />
                  {reports && !s.status.startsWith("cancelled") && new Date(s.starts_at).getTime() <= nowMs + 3600_000 && (
                    <span className="ms-auto">
                      <ReportButton sessionId={s.id} label={s.status === "held" ? "דיווח / עריכה" : "דיווח"} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="דורש טיפול">
          {pending.length === 0 && renew.length === 0 && unsigned.length === 0 ? (
            <p className="text-muted">אין כרגע משהו פתוח.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {pending.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#FBEBDD] px-2 py-0.5 text-[12px] text-[#7A3A0E]">לדווח</span>
                  <Link href={`/sessions/${s.id}`} className="text-primary underline">
                    {s.client?.full_name} · {formatDateTime(s.starts_at)}
                  </Link>
                  {reports && (
                    <span className="ms-auto">
                      <ReportButton sessionId={s.id} />
                    </span>
                  )}
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

      <Card title="תשלומים ומעקב">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
          <Tile icon="money" tone="sage" label="נגבה החודש" value={formatShekel(paidMonth)} sub="מהמטופלים שלך" />
          <Tile
            icon="card"
            label="לינקים פתוחים"
            value={String(openReqs.length)}
            sub={openReqs.length ? `${formatShekel(openReqs.reduce((n, r) => n + r.amount, 0))} ממתינים לתשלום` : "אין לינקים שממתינים"}
            alert={openReqs.length > 0}
          />
        </div>
        <p className="text-[13px] text-muted">
          לינק תשלום שולחים מהשורה של המטופל ברשימה למטה, או מדף המטופל. כשהמשלם משלם, Morning מוציא קבלה, והתשלום נרשם כאן ואצל
          מתניה, משויך אליך.
        </p>
        {openReqs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">נשלחו וממתינים לתשלום</span>
            <ul className="flex flex-col gap-1.5 text-sm">
              {openReqs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/clients/${r.client_id}`} className="text-primary underline">
                    {r.client?.full_name}
                  </Link>
                  <span>
                    {PAYMENT_LABEL[r.kind]} · {formatShekel(r.amount)}
                  </span>
                  <span className="text-muted">נשלח {formatDateTime(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pays.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>תאריך</Th>
                  <Th>מטופל</Th>
                  <Th>סוג</Th>
                  <Th>סכום</Th>
                  <Th>אופן</Th>
                  <Th>קבלה</Th>
                </tr>
              </thead>
              <tbody>
                {pays.slice(0, 12).map((p) => (
                  <tr key={p.id} className="border-b border-[#EDE4D3]">
                    <td className="px-2 py-2">{formatDate(dayKey(new Date(p.paid_at)))}</td>
                    <td className="px-2 py-2">{p.client?.full_name}</td>
                    <td className="px-2 py-2">{PAYMENT_LABEL[p.kind]}</td>
                    <td className="px-2 py-2 tabular-nums">{formatShekel(p.amount)}</td>
                    <td className="px-2 py-2">{p.source === "manual" ? "נרשם ידנית" : "לינק תשלום"}</td>
                    <td className="px-2 py-2 tabular-nums">{p.morning_document_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
