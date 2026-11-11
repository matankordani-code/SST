import { Suspense } from "react";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NO_ID, myTherapistId } from "@/lib/view";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { SESSION_SELECT, type SessionRow } from "@/lib/sessions";
import { addDays, dayKey, formatDay, israelToUtc, isDayKey, timeOf, weekStart } from "@/lib/time";
import { WeekGrid, type GridSession } from "./week-grid";

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
  const profile = await requirePerm("calendar");
  const isOwner = profile.perms.calendar === 2; // sees every therapist
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
  // Own calendar only: filter explicitly (the owner viewing as a therapist sees everything through RLS).
  const myId = isOwner ? null : await myTherapistId(profile, supabase);
  if (!isOwner) query = query.eq("therapist_id", myId ?? NO_ID);

  const [{ data }, { data: therapists }] = await Promise.all([
    query,
    isOwner
      ? supabase.from("therapists").select("id, display_name").eq("is_active", true).order("display_name")
      : Promise.resolve({ data: null }),
  ]);
  const sessions = (data ?? []) as unknown as SessionRow[];
  const now = new Date().getTime();
  const grid: GridSession[] = sessions.map((s) => ({
    id: s.id,
    day: dayKey(new Date(s.starts_at)),
    time: timeOf(new Date(s.starts_at)),
    client: s.client?.full_name ?? "",
    therapist: s.therapist?.display_name ?? "",
    status: s.status,
    past: new Date(s.starts_at).getTime() < now,
  }));

  // Who can be booked from the grid: every client (whole calendar) or my own.
  let clientsQuery = supabase
    .from("clients")
    .select("id, full_name, therapist:therapists(display_name)")
    .eq("is_active", true)
    .order("full_name");
  if (!isOwner) clientsQuery = clientsQuery.eq("therapist_id", myId ?? NO_ID);
  const { data: clientRows } = await clientsQuery;
  const clientOptions = ((clientRows ?? []) as unknown as { id: string; full_name: string; therapist: { display_name: string } | null }[]).map(
    (c) => ({ id: c.id, label: isOwner && c.therapist ? `${c.full_name} · ${c.therapist.display_name}` : c.full_name }),
  );

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
          <Link
            href={`/calendar/month?m=${week.slice(0, 7)}${isOwner && filter && filter !== "all" ? `&t=${filter}` : ""}`}
            className={navBtn}
          >
            תצוגה חודשית
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

        <WeekGrid
          key={sessions.map((x) => x.id + x.starts_at + x.status).join("|")}
          days={days}
          today={today}
          sessions={grid}
          clients={clientOptions}
          showTherapist={isOwner}
        />
      </Card>
    </AppShell>
  );
}

const navBtn =
  "flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";
