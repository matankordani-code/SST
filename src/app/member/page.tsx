import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { MemberProgress } from "@/components/member-progress";
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

  const [{ data: tData }, countsRes, { data: mine }] = await Promise.all([
    supabase.from("trainings").select("*").eq("is_active", true).order("start_time"),
    // Counts for everyone (a member can't see other members' registrations).
    supabase.rpc("training_counts", { p_from: week, p_to: end }),
    supabase.from("registrations").select("id, training_id, on_date, status").eq("member_id", me.id).gte("on_date", week).lte("on_date", end).neq("status", "cancelled"),
  ]);
  const trainings = (tData ?? []) as Training[];
  const myRegs = (mine ?? []) as Registration[];
  const counts = (countsRes.data ?? []) as { training_id: string; on_date: string; registered: number; waitlist: number }[];
  const takenAt = (id: string, d: string) => counts.find((c) => c.training_id === id && c.on_date === d)?.registered ?? 0;

  const weekCount = myRegs.length;

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  return (
    <AppShell profile={profile} active="/member">
      <Card title={`שלום ${me.full_name.split(" ")[0]}`}>
        <p>
          נרשמת ל-<strong>{weekCount}</strong> מתוך 3 אימונים בשבוע הזה.
        </p>
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
                  const taken = takenAt(t.id, d);
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

      <MemberProgress memberId={me.id} />
    </AppShell>
  );
}

const navBtn = "flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";
