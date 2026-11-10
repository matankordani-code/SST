"use server";

import { refresh } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REGISTER_MESSAGE } from "@/lib/club";

export type FormState = { error?: string; ok?: string } | undefined;

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function addTrainingAction(_: FormState, fd: FormData): Promise<FormState> {
  await requirePerm("club", 2);
  const weekday = Number(text(fd, "weekday"));
  const capacity = Number(text(fd, "capacity"));
  const time = text(fd, "start_time");
  if (!text(fd, "name")) return { error: "חסר שם לאימון." };
  if (!(weekday >= 0 && weekday <= 6) || !/^\d{2}:\d{2}$/.test(time) || !(capacity > 0)) {
    return { error: "בדוק יום, שעה ומספר מקומות." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("trainings").insert({
    name: text(fd, "name"),
    weekday,
    start_time: time,
    duration_min: Number(text(fd, "duration_min")) || 60,
    coach: text(fd, "coach") || null,
    capacity,
  });
  if (error) return { error: "השמירה נכשלה." };
  refresh();
  return { ok: "האימון נוסף ללו״ז." };
}

export async function toggleTrainingAction(id: string, active: boolean) {
  await requirePerm("club", 2);
  const supabase = await createClient();
  await supabase.from("trainings").update({ is_active: active }).eq("id", id);
  refresh();
}

export async function addMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  await requirePerm("club", 2);
  const name = text(fd, "full_name");
  const email = text(fd, "email").toLowerCase();
  if (!name) return { error: "חסר שם." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "כתובת המייל לא תקינה." };
  const supabase = await createClient();
  const { data: m, error } = await supabase
    .from("members")
    .insert({
      full_name: name,
      email: email || null,
      phone: text(fd, "phone") || null,
      plan: text(fd, "plan") === "storage" ? "storage" : "community",
    })
    .select("id")
    .single();
  if (error || !m) return { error: "השמירה נכשלה." };

  if (email) {
    const { data: existing } = await supabase.from("profiles").select("id, role").ilike("email", email).maybeSingle();
    if (existing) {
      await supabase.from("members").update({ profile_id: existing.id }).eq("id", m.id);
    } else {
      await supabase.from("invites").insert({ email, role: "member", full_name: name, member_id: m.id });
    }
  }
  refresh();
  return { ok: `${name} נוסף/ה למנויים${email ? " ויכול/ה להיכנס עם המייל" : ""}.` };
}

export async function toggleMemberAction(id: string, active: boolean) {
  await requirePerm("club", 2);
  const supabase = await createClient();
  await supabase.from("members").update({ is_active: active }).eq("id", id);
  refresh();
}

export async function attendanceAction(registrationId: string, attended: boolean) {
  const supabase = await createClient();
  await supabase.rpc("club_attendance", { p_registration: registrationId, p_attended: attended });
  refresh();
}

export async function cancelRegistrationAction(registrationId: string) {
  const supabase = await createClient();
  await supabase.rpc("club_cancel", { p_registration: registrationId });
  refresh();
}

export async function registerAction(trainingId: string, date: string, _: FormState): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("club_register", { p_training: trainingId, p_date: date });
  if (error) return { error: "ההרשמה נכשלה." };
  refresh();
  const msg = REGISTER_MESSAGE[String(data)] ?? "בוצע.";
  return data === "registered" || data === "waitlist" ? { ok: msg } : { error: msg };
}
