import { Suspense } from "react";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { myTherapistId } from "@/lib/view";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { StatusBadge } from "@/components/status-badge";
import { SESSION_SELECT, type CardUsage, type SessionRow } from "@/lib/sessions";
import { cardStatus } from "@/lib/cards";
import { addDays, dayKey, formatDay, israelToUtc, timeOf } from "@/lib/time";

export default function TodayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

type Prev = { client_id: string; summary: { did: string; next_goal: string | null } | null };

async function Content() {
  const profile = await requirePerm("calendar");
  const supabase = await createClient();
  const myId = await myTherapistId(profile, supabase);
  const today = dayKey(new Date());

  // Today, or the next work day (within two weeks) that has sessions.
  const { data } = myId
    ? await supabase
        .from("sessions")
        .select(SESSION_SELECT)
        .eq("therapist_id", myId)
        .gte("starts_at", israelToUtc(today, "00:00").toISOString())
        .lt("starts_at", israelToUtc(addDays(today, 15), "00:00").toISOString())
        .order("starts_at")
    : { data: [] };
  const upcoming = (data ?? []) as unknown as SessionRow[];
  const day = upcoming.length ? dayKey(new Date(upcoming[0].starts_at)) : today;
  const sessions = upcoming.filter((s) => dayKey(new Date(s.starts_at)) === day);
  const clientIds = [...new Set(sessions.map((s) => s.client_id))];

  const [{ data: prevData }, { data: cardsData }] = clientIds.length
    ? await Promise.all([
        supabase
          .from("sessions")
          .select("client_id, summary:session_summaries(did, next_goal)")
          .in("client_id", clientIds)
          .eq("status", "held")
          .lt("starts_at", israelToUtc(day, "00:00").toISOString())
          .order("starts_at", { ascending: false }),
        supabase.from("punch_card_usage").select("*").in("client_id", clientIds),
      ])
    : [{ data: [] }, { data: [] }];

  const lastSummary = new Map<string, Prev["summary"]>();
  for (const p of (prevData ?? []) as unknown as Prev[]) {
    if (!lastSummary.has(p.client_id) && p.summary) lastSummary.set(p.client_id, p.summary);
  }
  const cards = (cardsData ?? []) as CardUsage[];

  const title = day === today ? `היום שלי · ${formatDay(day)}` : `יום העבודה הבא · ${formatDay(day)}`;

  return (
    <AppShell profile={profile} active="/today">
      <Card title={title}>
        {!myId ? (
          <p className="text-muted">המשתמש שלך עוד לא מוגדר כמטפל. פנה למתניה.</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted">
            אין מפגשים בשבועיים הקרובים.{" "}
            <Link href="/sessions/new" className="text-primary underline">
              קביעת מפגש
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => {
              const prev = lastSummary.get(s.client_id);
              const card = cardStatus(
                cards.filter((c) => c.client_id === s.client_id),
                today,
              );
              return (
                <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-[#EDE4D3] p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-lg font-bold tabular-nums" dir="ltr">
                      {timeOf(new Date(s.starts_at))}
                    </span>
                    <Link href={`/clients/${s.client_id}`} className="font-semibold text-primary underline">
                      {s.client?.full_name}
                    </Link>
                    <StatusBadge status={s.status} />
                    {card && (
                      <span
                        className={
                          "text-[13px] " + (card.renew ? "font-semibold text-alert-ink" : "text-muted")
                        }
                      >
                        כרטיסייה: {card.text}
                        {card.renew && " · לחדש"}
                      </span>
                    )}
                  </div>
                  {prev && (
                    <div className="rounded-md bg-sand p-2.5 text-sm">
                      <span className="text-muted">במפגש הקודם: </span>
                      <span className="line-clamp-3 whitespace-pre-wrap">{prev.did}</span>
                      {prev.next_goal && (
                        <div>
                          <span className="text-muted">מטרה למפגש הזה: </span>
                          {prev.next_goal}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-dark"
                    >
                      {s.status === "planned" ? "התקיים + סיכום" : "פתיחת המפגש"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
