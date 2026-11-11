import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { GoalToggle } from "@/components/goal-toggle";
import { SKILL_LABEL, skillProgress, type Goal, type SkillRow } from "@/lib/club";
import { addDays, dayKey, formatDate, weekStart } from "@/lib/time";

// "ההתקדמות שלי" (prototype): attendance, streak, weekly average, the last
// 8 weeks as bars, technique scores (a month ago → now), goals, recent visits.
// Shared by the member's own screen and the coach's view of a member.
export async function MemberProgress({ memberId, title = "ההתקדמות שלי" }: { memberId: string; title?: string }) {
  const supabase = await createClient();
  const today = dayKey(new Date());
  const monthAgo = addDays(today, -28);

  const [{ data: att }, { data: skills, error: skillsError }, { data: goals }] = await Promise.all([
    supabase
      .from("registrations")
      .select("on_date, training:trainings(name)")
      .eq("member_id", memberId)
      .eq("attended", true)
      .order("on_date", { ascending: false }),
    supabase.from("member_skills").select("skill, score, scored_on").eq("member_id", memberId),
    supabase.from("member_goals").select("id, text, done").eq("member_id", memberId).order("created_at"),
  ]);
  const visits = (att ?? []) as unknown as { on_date: string; training: { name: string } | null }[];

  // Weeks (Sun–Sat), oldest → this one.
  const thisWeek = weekStart(today);
  const bars = Array.from({ length: 8 }, (_, i) => {
    const w = addDays(thisWeek, (i - 7) * 7);
    return { w, n: visits.filter((v) => weekStart(v.on_date) === w).length };
  });
  const maxBar = Math.max(3, ...bars.map((b) => b.n));

  const weeks = new Set(visits.map((v) => weekStart(v.on_date)));
  let cur = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let streak = 0;
  while (weeks.has(cur)) {
    streak++;
    cur = addDays(cur, -7);
  }
  const first = visits.length ? visits[visits.length - 1].on_date : null;
  const spanWeeks = first ? Math.max(1, Math.round((new Date(thisWeek).getTime() - new Date(weekStart(first)).getTime()) / (7 * 864e5)) + 1) : 0;
  const avg = spanWeeks ? (visits.length / spanWeeks).toFixed(1) : "0";

  const progress = skillsError ? [] : skillProgress((skills ?? []) as SkillRow[], monthAgo);
  const scored = progress.filter((p) => p.to !== null);

  return (
    <Card title={title}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Tile label={first ? `הגעות מאז ${formatDate(first).slice(0, -5)}` : "הגעות"} value={String(visits.length)} />
        <Tile label="רצף שבועות" value={String(streak)} />
        <Tile label="ממוצע שבועי" value={avg} sub="מתוך 3 במנוי" />
      </div>

      <div>
        <p className="mb-2 text-[13px] text-muted">הגעות לפי שבוע</p>
        <div className="flex h-28 items-end gap-2" role="img" aria-label={`הגעות ב-8 השבועות האחרונים: ${bars.map((b) => b.n).join(", ")}`}>
          {bars.map((b) => (
            <div key={b.w} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[12px] tabular-nums text-muted">{b.n}</span>
              <div
                className={"w-full rounded-t-md " + (b.w === thisWeek ? "bg-primary" : "bg-[#9CC3CF]")}
                style={{ height: `${Math.max(4, (b.n / maxBar) * 72)}px` }}
              />
              <span className="text-[11px] text-muted">{formatDate(b.w).slice(0, -5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 font-semibold">שיפורי טכניקה</p>
          <p className="mb-2 text-[12px] text-muted">ציון המאמן מ-1 עד 5 (לפני חודש ← היום)</p>
          {scored.length === 0 ? (
            <p className="text-sm text-muted">עדיין אין ציונים מהמאמן.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {scored.map((p) => {
                const delta = (p.to ?? 0) - (p.from ?? 0);
                return (
                  <li key={p.skill} className="flex items-center justify-between gap-2">
                    <span>{SKILL_LABEL[p.skill]}</span>
                    <span className="tabular-nums">
                      {p.from} ← {p.to}{" "}
                      {delta !== 0 && (
                        <span className={delta > 0 ? "text-[#22582C]" : "text-alert-ink"}>({delta > 0 ? `+${delta}` : delta})</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 font-semibold">יעדים אישיים</p>
          {(goals ?? []).length === 0 ? (
            <p className="text-sm text-muted">עדיין לא הוגדרו יעדים.</p>
          ) : (
            <div className="flex flex-col text-sm">
              {((goals ?? []) as Goal[]).map((g) => (
                <GoalToggle key={g.id} id={g.id} text={g.text} done={g.done} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 font-semibold">הגעות אחרונות</p>
        {visits.length === 0 ? (
          <p className="text-sm text-muted">עדיין אין הגעות רשומות.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EDE4D3] text-sm">
            {visits.slice(0, 5).map((v, i) => (
              <li key={i} className="py-1.5">
                {formatDate(v.on_date)} · {v.training?.name ?? ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      {sub && <span className="text-[12px] text-muted">{sub}</span>}
    </div>
  );
}
