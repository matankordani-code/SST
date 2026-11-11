"use server";

import { refresh } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SKILLS } from "@/lib/club";

// Coach / club manager: today's technique scores for a member (empty = unchanged).
export async function saveSkillsAction(memberId: string, fd: FormData) {
  await requirePerm("club", 2);
  const rows = SKILLS.flatMap((skill) => {
    const n = Number(fd.get(skill));
    return Number.isInteger(n) && n >= 1 && n <= 5 ? [{ member_id: memberId, skill, score: n }] : [];
  });
  if (rows.length === 0) return;
  const supabase = await createClient();
  await supabase.from("member_skills").insert(rows);
  refresh();
}

export async function addGoalAction(memberId: string, fd: FormData) {
  await requirePerm("club", 2);
  const text = String(fd.get("text") ?? "").trim();
  if (!text) return;
  const supabase = await createClient();
  await supabase.from("member_goals").insert({ member_id: memberId, text: text.slice(0, 200) });
  refresh();
}

export async function deleteGoalAction(goalId: string) {
  await requirePerm("club", 2);
  const supabase = await createClient();
  await supabase.from("member_goals").delete().eq("id", goalId);
  refresh();
}

// The member (or staff) ticks a goal.
export async function toggleGoalAction(goalId: string, done: boolean) {
  const supabase = await createClient();
  await supabase.rpc("toggle_my_goal", { p_goal: goalId, p_done: done });
  refresh();
}
