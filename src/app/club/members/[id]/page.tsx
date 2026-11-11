import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { MemberProgress } from "@/components/member-progress";
import { PLAN_LABEL, SKILLS, SKILL_LABEL, type MemberPlan } from "@/lib/club";
import { addGoalAction, deleteGoalAction, saveSkillsAction } from "@/app/club/progress-actions";

export default function ClubMemberPage({ params }: PageProps<"/club/members/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

// Club staff: one member's progress, today's technique scores, and goals.
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requirePerm("club", 2);
  const supabase = await createClient();

  const [{ data: member }, { data: goals }] = await Promise.all([
    supabase.from("members").select("id, full_name, plan, is_active").eq("id", id).maybeSingle<{ id: string; full_name: string; plan: MemberPlan; is_active: boolean }>(),
    supabase.from("member_goals").select("id, text, done").eq("member_id", id).order("created_at"),
  ]);
  if (!member) notFound();

  const select = "min-h-11 rounded-lg border border-field bg-white px-2 text-[15px]";
  return (
    <AppShell profile={profile} active="/club">
      <div>
        <Link href="/club" className="text-sm text-primary underline">
          → חזרה למועדון
        </Link>
      </div>
      <Card title={member.full_name}>
        <p className="text-sm text-muted">
          {PLAN_LABEL[member.plan]}
          {member.is_active ? "" : " · מושהה"}
        </p>
      </Card>

      <MemberProgress memberId={member.id} title="התקדמות" />

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="ציוני טכניקה להיום">
          <p className="text-[13px] text-muted">1 = מתחיל/ה, 5 = מצוין. שדה ריק נשאר כמו שהיה. המנוי/ה רואה את השינוי מול לפני חודש.</p>
          <form action={saveSkillsAction.bind(null, member.id)} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              {SKILLS.map((s) => (
                <label key={s} className="flex flex-col gap-1 text-[13px] text-muted">
                  {SKILL_LABEL[s]}
                  <select name={s} defaultValue="" className={select}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div>
              <button type="submit" className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark">
                שמירת ציונים
              </button>
            </div>
          </form>
        </Card>

        <Card title="יעדים אישיים">
          {(goals ?? []).length > 0 && (
            <ul className="flex flex-col divide-y divide-[#EFEAE0] text-sm">
              {(goals ?? []).map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2">
                  <span className={g.done ? "text-muted line-through" : ""}>{g.text}</span>
                  <form action={deleteGoalAction.bind(null, g.id)}>
                    <button type="submit" className="min-h-9 rounded-lg border border-field bg-white px-3 text-[13px] hover:bg-sand">
                      הסרה
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={addGoalAction.bind(null, member.id)} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="goal">
              יעד חדש
            </label>
            <input
              id="goal"
              name="text"
              required
              maxLength={200}
              placeholder="למשל: לתפוס גל ירוק לבד"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-field px-3 text-[15px]"
            />
            <button type="submit" className="min-h-11 rounded-lg border border-primary bg-white px-4 text-primary hover:bg-sand">
              הוספה
            </button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
