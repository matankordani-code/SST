import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { StatusBadge } from "@/components/status-badge";
import { SESSION_SELECT, type SessionRow } from "@/lib/sessions";
import { addDays, dayKey, formatDay, israelToUtc, isDayKey, timeOf, weekStart } from "@/lib/time";

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
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
  const profile = await requireRole("owner", "therapist");
  const isOwner = profile.role === "owner";
  const supabase = await createClient();

  const today = dayKey(new Date());
  const week = weekStart(isDayKey(sp.week) ? sp.week : today);
  const filter = typeof sp.t === "string" ? sp.t : isOwner ? "all" : "";

  let query = supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .gte("starts_at", israelToUtc(week, "00:00").toISOString())
    .lt("starts_at", israelToUtc(addDays(week, 7), "00:00").toISOString())
    .order("starts_at");
  if (isOwner && filter && filter !== "all") query = query.eq("therapist_id", filter);

  const [{ data }, { data: therapists }] = await Promise.all([
    query,
    isOwner
      ? supabase.from("therapists").select("id, display_name").eq("is_active", true).order("display_name")
      : Promise.resolve({ data: null }),
  ]);
  const sessions = (data ?? []) as unknown as SessionRow[];

  const byDay = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const k = dayKey(new Date(s.starts_at));
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const qs = (w: string) => `/calendar?week=${w}${isOwner && filter ? `&t=${filter}` : ""}`;

  return (
    <AppShell profile={profile} active="/calendar">
      <Card
        title={`יומן · שבוע ${formatDay(week)}`}
        actions={
          <Link
            href={`/sessions/new?date=${week === weekStart(today) ? today : week}`}
            className="flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-dark"
          >
            + קביעת מפגש
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs(addDays(week, -7))} className={navBtn}>
            → שבוע קודם
          </Link>
          <Link href={qs(weekStart(today))} className={navBtn}>
            השבוע
          </Link>
          <Link href={qs(addDays(week, 7))} className={navBtn}>
            שבוע הבא ←
          </Link>
          {therapists && (
            <form method="get" action="/calendar" className="flex items-center gap-2 ms-auto">
              <input type="hidden" name="week" value={week} />
              <label className="text-[13px] text-muted" htmlFor="t">
                מטפל
              </label>
              <select
                id="t"
                name="t"
                defaultValue={filter}
                className="min-h-10 rounded-lg border border-field bg-white px-2"
              >
                <option value="all">כל המטפלים</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </select>
              <button type="submit" className={navBtn}>
                הצג
              </button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            return (
              <div
                key={d}
                className={
                  "rounded-lg border p-3 " +
                  (d === today ? "border-primary bg-[#EEF5F7]" : "border-[#EFEAE0]")
                }
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{formatDay(d)}</h3>
                  <Link href={`/sessions/new?date=${d}`} className="text-[13px] text-primary underline">
                    + מפגש
                  </Link>
                </div>
                {list.length === 0 ? (
                  <p className="text-[13px] text-muted">אין מפגשים</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {list.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/sessions/${s.id}`}
                          className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 hover:bg-white"
                        >
                          <span className="font-semibold tabular-nums" dir="ltr">
                            {timeOf(new Date(s.starts_at))}
                          </span>
                          <span>{s.client?.full_name}</span>
                          {isOwner && (
                            <span className="text-[13px] text-muted">{s.therapist?.display_name}</span>
                          )}
                          <StatusBadge status={s.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}

const navBtn =
  "flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";
