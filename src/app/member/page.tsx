import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Kpi } from "@/components/income-kpis";
import { PLAN_LABEL, hhmm, type MemberPlan, type Registration, type Training } from "@/lib/club";
import { addDays, dayKey, formatDay, isDayKey, weekStart } from "@/lib/time";
import { cancelRegistrationAction } from "@/app/club/actions";
import { JoinButton } from "@/app/club/forms";

export default function MemberPage({ searchParams }: PageProps<"/member">) {
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
  const profile = await requireRole("member");
  const supabase = await createClient();
  const today = dayKey(new Date());
  const week = weekStart(isDayKey(sp.week) ? sp.week : today);
  const end = addDays(week, 6);

  // The owner viewing as a member sees that member; anyone else sees themself.
  const memberQuery = supabase.from("members").select("id, full_name, plan, is_active, joined_on");
  const { data: me } = await (profile.viewAs?.kind === "member"
    ? memberQuery.eq("id", profile.viewAs.id)
    : memberQuery.eq("profile_id", profile.id)
  ).maybeSingle<{ id: string; full_name: string; plan: MemberPlan; is_active: boolean; joined_on: string }>();

  if (!me) {
    return (
      <AppShell profile={profile} active="/member">
        <Card title="המנוי שלי">
          <p className="text-muted">המשתמש שלך עוד לא מקושר למנוי. פנה למנהל המועדון.</p>
        </Card>
      </AppShell>
    );
  }

  const [{ data: tData }, { data: counts }, { data: mine }, { data: history }] = await Promise.all([
    supabase.from("trainings").select("*").eq("is_active", true).order("start_time"),
    supabase.from("registrations").select("training_id, on_date, status").gte("on_date", week).lte("on_date", end).neq("status", "cancelled"),
    supabase.from("registrations").select("id, training_id, on_date, status").eq("member_id", me.id).gte("on_date", week).lte("on_date", end).neq("status", "cancelled"),
    supabase.from("registrations").select("on_date").eq("member_id", me.id).eq("attended", true).order("on_date", { ascending: false }),
  ]);
  const trainings = (tData ?? []) as Training[];
  const myRegs = (mine ?? []) as Registration[];
  const attended = (history ?? []).map((h) => h.on_date as string);

  // Streak: consecutive weeks (up to this one) with at least one attended training.
  const weeks = new Set(attended.map((d) => weekStart(d)));
  // This week may not have a training yet, so the streak can start from last week.
  let w = weeks.has(weekStart(today)) ? weekStart(today) : addDays(weekStart(today), -7);
  let streak = 0;
  while (weeks.has(w)) {
    streak++;
    w = addDays(w, -7);
  }
  const thisMonth = attended.filter((d) => d.startsWith(today.slice(0, 7))).length;
  const weekCount = myRegs.length;

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  return (
    <AppShell profile={profile} active="/member">
      <Card title={`שלום ${me.full_name.split(" ")[0]}`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          <Kpi label="הגעות החודש" value={String(thisMonth)} strong />
          <Kpi label="סה״כ הגעות" value={String(attended.length)} />
          <Kpi label="רצף שבועות" value={String(streak)} />
          <Kpi label="נרשמת השבוע" value={`${weekCount} מתוך 3`} />
        </div>
        <p className="text-[13px] text-muted">
          המנוי: {PLAN_LABEL[me.plan]}{me.is_active ? "" : " · מושהה"}
        </p>
      </Card>

      <Card
        title={`לו״ז אימונים · שבוע ${formatDay(week)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/member?week=${addDays(week, -7)}`} className={navBtn}>→</Link>
            <Link href={`/member?week=${weekStart(today)}`} className={navBtn}>השבוע</Link>
            <Link href={`/member?week=${addDays(week, 7)}`} className={navBtn}>←</Link>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {days.map((d) => {
            const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
            const list = trainings.filter((t) => t.weekday === dow);
            if (list.length === 0) return null;
            return (
              <div key={d} className={"rounded-lg border p-3 " + (d === today ? "border-primary bg-[#EEF5F7]" : "border-[#EFEAE0]")}>
                <h3 className="mb-2 font-semibold">{formatDay(d)}</h3>
                {list.map((t) => {
                  const taken = (counts ?? []).filter((c) => c.training_id === t.id && c.on_date === d && c.status === "registered").length;
                  const my = myRegs.find((r) => r.training_id === t.id && r.on_date === d);
                  const past = d < today;
                  return (
                    <div key={t.id} className="mb-2 flex flex-wrap items-center gap-3 border-b border-[#EFEAE0] pb-2 last:mb-0 last:border-0 last:pb-0">
                      <strong dir="ltr" className="tabular-nums">{hhmm(t.start_time)}</strong>
                      <span>{t.name}{t.coach ? ` · ${t.coach}` : ""}</span>
                      <span className="text-[13px] text-muted">{Math.max(0, t.capacity - taken)} מקומות פנויים</span>
                      <div className="ms-auto">
                        {my ? (
                          <div className="flex items-center gap-2">
                            <span className={"rounded-md px-2 py-0.5 text-[13px] " + (my.status === "registered" ? "bg-[#E4F1E6] text-[#22582C]" : "bg-[#FBF3E4] text-[#6B4A12]")}>
                              {my.status === "registered" ? "רשום/ה" : "ברשימת המתנה"}
                            </span>
                            {!past && (
                              <form action={cancelRegistrationAction.bind(null, my.id)}>
                                <button className="min-h-10 rounded-lg border border-field bg-white px-3 text-sm">ביטול</button>
                              </form>
                            )}
                          </div>
                        ) : (
                          !past && me.is_active && <JoinButton trainingId={t.id} date={d} full={taken >= t.capacity} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {trainings.length === 0 && <p className="text-muted">אין עדיין אימונים בלו״ז.</p>}
        </div>
      </Card>
    </AppShell>
  );
}

const navBtn = "flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";
