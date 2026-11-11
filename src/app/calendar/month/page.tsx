import { Suspense } from "react";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NO_ID, myTherapistId } from "@/lib/view";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { SESSION_SELECT, STATUS_CLASS, type SessionRow } from "@/lib/sessions";
import { addDays, addMonths, dayKey, formatMonth, isMonthKey, israelToUtc, monthOf, timeOf, weekStart } from "@/lib/time";

// Monthly board: every day of the month with its sessions; owner can filter by therapist.
export default function MonthCalendarPage({ searchParams }: PageProps<"/calendar/month">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

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
  const month = isMonthKey(sp.m) ? sp.m : monthOf(new Date());
  const filter = typeof sp.t === "string" ? sp.t : "all";
  const first = `${month}-01`;
  const next = `${addMonths(month, 1)}-01`;

  let query = supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .gte("starts_at", israelToUtc(first, "00:00").toISOString())
    .lt("starts_at", israelToUtc(next, "00:00").toISOString())
    .order("starts_at");
  if (isOwner && filter !== "all") query = query.eq("therapist_id", filter);
  // Own calendar only: filter explicitly (the owner viewing as a therapist sees everything through RLS).
  if (!isOwner) query = query.eq("therapist_id", (await myTherapistId(profile, supabase)) ?? NO_ID);

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

  // Grid from the Sunday before the 1st to the Saturday after the last day.
  const start = weekStart(first);
  const days: string[] = [];
  for (let d = start; d < next || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);

  const qs = (m: string) => `/calendar/month?m=${m}${isOwner && filter !== "all" ? `&t=${filter}` : ""}`;

  return (
    <AppShell profile={profile} active="/calendar">
      <Card
        title={`לוח חודשי · ${formatMonth(month)} · ${sessions.length} מפגשים`}
        actions={
          <Link href={`/calendar?week=${weekStart(month === monthOf(new Date()) ? today : first)}`} className={navBtn}>
            תצוגה שבועית
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs(addMonths(month, -1))} className={navBtn}>
            → חודש קודם
          </Link>
          <Link href={qs(monthOf(new Date()))} className={navBtn}>
            החודש
          </Link>
          <Link href={qs(addMonths(month, 1))} className={navBtn}>
            חודש הבא ←
          </Link>
          {therapists && (
            <form method="get" action="/calendar/month" className="ms-auto flex items-center gap-2">
              <input type="hidden" name="m" value={month} />
              <label className="text-[13px] text-muted" htmlFor="t">
                מטפל
              </label>
              <select id="t" name="t" defaultValue={filter} className="min-h-10 rounded-lg border border-field bg-white px-2">
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

        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-center text-[13px] font-semibold text-muted">
                {w}
              </div>
            ))}
            {days.map((d) => {
              const inMonth = d.startsWith(month);
              const list = byDay.get(d) ?? [];
              return (
                <div
                  key={d}
                  className={
                    "flex min-h-24 flex-col gap-0.5 rounded-md border p-1 " +
                    (d === today ? "border-primary bg-[#EEF5F7]" : "border-[#EDE4D3]") +
                    (inMonth ? "" : " opacity-40")
                  }
                >
                  <Link href={`/calendar?week=${weekStart(d)}`} className="text-[12px] font-semibold tabular-nums text-muted">
                    {Number(d.slice(8))}
                  </Link>
                  {list.slice(0, 4).map((s) => (
                    <Link
                      key={s.id}
                      href={`/sessions/${s.id}`}
                      className={`truncate rounded px-1 text-[11px] ${STATUS_CLASS[s.status]}`}
                      title={`${timeOf(new Date(s.starts_at))} ${s.client?.full_name ?? ""}${isOwner ? ` · ${s.therapist?.display_name ?? ""}` : ""}`}
                    >
                      <span dir="ltr" className="tabular-nums">{timeOf(new Date(s.starts_at))}</span> {s.client?.full_name}
                    </Link>
                  ))}
                  {list.length > 4 && (
                    <Link href={`/calendar?week=${weekStart(d)}`} className="text-[11px] text-primary">
                      +{list.length - 4} נוספים
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

const navBtn = "flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";
