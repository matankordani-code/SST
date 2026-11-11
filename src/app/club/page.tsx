import { Suspense } from "react";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Th } from "@/components/my-clients";
import { PLAN_LABEL, WEEKDAY_LABEL, hhmm, type MemberPlan, type Registration, type Training } from "@/lib/club";
import { addDays, dayKey, formatDateTime, formatDay, isDayKey, weekStart } from "@/lib/time";
import { attendanceAction, cancelRegistrationAction, toggleMemberAction, toggleTrainingAction } from "./actions";
import { AddMemberForm, AddTrainingForm } from "./forms";

export default function ClubPage({ searchParams }: PageProps<"/club">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

type Member = { id: string; full_name: string; plan: MemberPlan; is_active: boolean; email: string | null; profile_id: string | null };

async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const profile = await requirePerm("club", 2);
  const supabase = await createClient();
  const today = dayKey(new Date());
  const week = weekStart(isDayKey(sp.week) ? sp.week : today);
  const end = addDays(week, 6);
  const monthAgo = addDays(today, -30);

  const [{ data: tData }, { data: rData }, { data: mData }, { data: recent }, { data: attended }] = await Promise.all([
    supabase.from("trainings").select("*").order("weekday").order("start_time"),
    supabase
      .from("registrations")
      .select("id, training_id, member_id, on_date, status, attended, created_at, member:members(full_name)")
      .gte("on_date", week)
      .lte("on_date", end)
      .neq("status", "cancelled")
      .order("created_at"),
    supabase.from("members").select("id, full_name, plan, is_active, email, profile_id").order("full_name"),
    supabase
      .from("registrations")
      .select("id, on_date, status, created_at, member:members(full_name), training:trainings(name)")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("registrations").select("member_id").eq("attended", true).gte("on_date", monthAgo),
  ]);
  const trainings = (tData ?? []) as Training[];
  const regs = (rData ?? []) as unknown as Registration[];
  const members = (mData ?? []) as Member[];
  const visits = new Map<string, number>();
  for (const a of attended ?? []) visits.set(a.member_id, (visits.get(a.member_id) ?? 0) + 1);

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  // KPIs for the shown week, as in the prototype.
  const active = members.filter((m) => m.is_active);
  const communityCount = active.filter((m) => m.plan === "community").length;
  const storageCount = active.filter((m) => m.plan === "storage").length;
  const weekReg = regs.filter((r) => r.status === "registered").length;
  const weekWait = regs.filter((r) => r.status === "waitlist").length;
  const weekCapacity = trainings.filter((t) => t.is_active).reduce((n, t) => n + t.capacity, 0);
  const occupancy = weekCapacity > 0 ? Math.round((weekReg / weekCapacity) * 100) : 0;
  const fullTrainings = new Set(regs.filter((r) => r.status === "waitlist").map((r) => `${r.training_id}:${r.on_date}`)).size;

  return (
    <AppShell profile={profile} active="/club">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <ClubKpi label="מנויי קהילה" value={String(communityCount)} sub={`${storageCount} מנויי אחסון גלשן`} />
        <ClubKpi label="הרשמות לאימונים" value={String(weekReg)} sub={`בשבוע ${formatDay(week)}`} />
        <ClubKpi label="תפוסה ממוצעת" value={`${occupancy}%`} sub={`${weekReg} מתוך ${weekCapacity} מקומות`} />
        <ClubKpi label="ברשימות המתנה" value={String(weekWait)} sub={fullTrainings ? `ב-${fullTrainings} אימונים מלאים` : "אין אימון מלא"} />
      </div>
      <Card
        title={`לו״ז אימוני קהילה · שבוע ${formatDay(week)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/club?week=${addDays(week, -7)}`} className={navBtn}>
              → שבוע קודם
            </Link>
            <Link href={`/club?week=${weekStart(today)}`} className={navBtn}>
              השבוע
            </Link>
            <Link href={`/club?week=${addDays(week, 7)}`} className={navBtn}>
              שבוע הבא ←
            </Link>
          </div>
        }
      >
        {trainings.filter((t) => t.is_active).length === 0 ? (
          <p className="text-muted">אין עדיין אימונים בלו״ז. הוסף אימון למטה.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {days.map((d) => {
              const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
              const list = trainings.filter((t) => t.is_active && t.weekday === dow);
              if (list.length === 0) return null;
              return (
                <div key={d} className={"rounded-lg border p-3 " + (d === today ? "border-primary bg-[#EEF5F7]" : "border-[#EFEAE0]")}>
                  <h3 className="mb-2 font-semibold">{formatDay(d)}</h3>
                  {list.map((t) => {
                    const here = regs.filter((r) => r.training_id === t.id && r.on_date === d);
                    const reg = here.filter((r) => r.status === "registered");
                    const wait = here.filter((r) => r.status === "waitlist");
                    return (
                      <div key={t.id} className="mb-2 flex flex-col gap-1.5 border-b border-[#EFEAE0] pb-2 last:mb-0 last:border-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <strong dir="ltr" className="tabular-nums">{hhmm(t.start_time)}</strong>
                          <span className="font-semibold">{t.name}</span>
                          {t.coach && <span className="text-muted">· {t.coach}</span>}
                          <span className={"rounded-md px-2 py-0.5 text-[13px] " + (reg.length >= t.capacity ? "bg-alert-bg text-alert-ink" : "bg-[#E3F0F4] text-[#15505F]")}>
                            {reg.length}/{t.capacity}
                          </span>
                          {wait.length > 0 && <span className="text-[13px] text-muted">המתנה: {wait.length}</span>}
                        </div>
                        {reg.length > 0 && (
                          <ul className="flex flex-wrap gap-1.5">
                            {reg.map((r) => (
                              <li key={r.id} className="flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[13px]">
                                {r.member?.full_name}
                                <form action={attendanceAction.bind(null, r.id, !r.attended)}>
                                  <button
                                    aria-label={r.attended ? "סמן שלא הגיע" : "סמן שהגיע"}
                                    className={"min-h-8 rounded px-1.5 " + (r.attended ? "bg-[#E4F1E6] text-[#22582C]" : "text-muted")}
                                  >
                                    {r.attended ? "✓ הגיע" : "הגיע?"}
                                  </button>
                                </form>
                                <form action={cancelRegistrationAction.bind(null, r.id)}>
                                  <button aria-label={`ביטול הרשמה של ${r.member?.full_name}`} className="min-h-8 px-1 text-alert-ink">
                                    ×
                                  </button>
                                </form>
                              </li>
                            ))}
                          </ul>
                        )}
                        {wait.length > 0 && (
                          <p className="text-[13px] text-muted">רשימת המתנה: {wait.map((r) => r.member?.full_name).join(", ")}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="התראות מועדון">
        {(recent ?? []).length === 0 ? (
          <p className="text-muted">אין עדיין הרשמות.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {(recent as unknown as { id: string; on_date: string; status: string; created_at: string; member: { full_name: string } | null; training: { name: string } | null }[]).map((r) => (
              <li key={r.id}>
                <span className="text-muted">{formatDateTime(r.created_at)} · </span>
                {r.member?.full_name}{" "}
                {r.status === "cancelled" ? "ביטל/ה" : r.status === "waitlist" ? "נכנס/ה להמתנה ל" : "נרשם/ה ל"}
                {r.training?.name} ({r.on_date.split("-").reverse().slice(0, 2).join(".")})
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`מנויים · ${members.filter((m) => m.is_active).length} פעילים`}>
        {members.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>שם</Th>
                  <Th>סוג</Th>
                  <Th>הגעות ב-30 יום</Th>
                  <Th>כניסה למערכת</Th>
                  <Th>מצב</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className={"border-b border-[#EFEAE0] " + (m.is_active ? "" : "opacity-50")}>
                    <td className="px-2 py-2.5 font-semibold">
                      <Link href={`/club/members/${m.id}`} className="text-primary underline">
                        {m.full_name}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">{m.plan === "community" ? "קהילה" : "אחסון גלשן"}</td>
                    <td className="px-2 py-2.5 tabular-nums">{visits.get(m.id) ?? 0}</td>
                    <td className="px-2 py-2.5 text-[13px] text-muted">{m.profile_id ? "פעיל" : m.email ? "ממתין לכניסה ראשונה" : "ללא מייל"}</td>
                    <td className="px-2 py-2.5">
                      <form action={toggleMemberAction.bind(null, m.id, !m.is_active)}>
                        <button className="min-h-9 rounded-md border border-field bg-white px-2 text-[13px]">
                          {m.is_active ? "פעיל · השהה" : "מושהה · הפעל"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddMemberForm />
      </Card>

      <Card title="אימונים בלו״ז">
        <ul className="flex flex-col gap-1 text-sm">
          {trainings.map((t) => (
            <li key={t.id} className={"flex flex-wrap items-center gap-2 " + (t.is_active ? "" : "opacity-50")}>
              <span>
                {WEEKDAY_LABEL[t.weekday]} <bdi dir="ltr">{hhmm(t.start_time)}</bdi> · {t.name} · {t.capacity} מקומות
                {t.coach ? ` · ${t.coach}` : ""}
              </span>
              <form action={toggleTrainingAction.bind(null, t.id, !t.is_active)}>
                <button className="min-h-8 rounded-md border border-field bg-white px-2 text-[13px]">
                  {t.is_active ? "הסרה מהלו״ז" : "החזרה ללו״ז"}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <AddTrainingForm />
        <p className="text-[13px] text-muted">{PLAN_LABEL.community}. {PLAN_LABEL.storage}. עד 3 אימונים בשבוע למנוי.</p>
      </Card>
    </AppShell>
  );
}

const navBtn = "flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";

function ClubKpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-white p-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[12px] text-muted">{sub}</span>
    </div>
  );
}
