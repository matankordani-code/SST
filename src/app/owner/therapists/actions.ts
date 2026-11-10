"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string } | undefined;

const STATUSES = ["exempt", "licensed", "company", "nonprofit"] as const;
const SPLITS = ["split_260_90", "full", "per_lesson"] as const;

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function pick<T extends string>(v: string, list: readonly T[], fallback: T): T {
  return (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

export async function addTherapistAction(_: FormState, fd: FormData): Promise<FormState> {
  const name = text(fd, "display_name");
  const email = text(fd, "email").toLowerCase();
  if (!name) return { error: "חסר שם." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "כתובת המייל לא תקינה." };

  const supabase = await createClient();
  const isInstructor = text(fd, "role") === "surf_instructor";
  const role = isInstructor ? "surf_instructor" : "therapist";
  const pay = Number(text(fd, "per_lesson_pay"));

  const { data: therapist, error } = await supabase
    .from("therapists")
    .insert({
      display_name: name,
      business_status: pick(text(fd, "business_status"), STATUSES, "exempt"),
      split: isInstructor ? "per_lesson" : pick(text(fd, "split"), SPLITS, "split_260_90"),
      per_lesson_pay: isInstructor ? (Number.isInteger(pay) && pay > 0 ? pay : 100) : null,
    })
    .select("id")
    .single();
  if (error || !therapist) return { error: "השמירה נכשלה." };

  // Already has a login? Link it. Otherwise invite: the first login creates it.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, role")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    await supabase.from("therapists").update({ profile_id: existing.id }).eq("id", therapist.id);
    if (!existing.role) await supabase.from("profiles").update({ role, full_name: name }).eq("id", existing.id);
  } else {
    const { error: invErr } = await supabase
      .from("invites")
      .insert({ email, role, full_name: name, therapist_id: therapist.id });
    if (invErr) return { error: "המטפל נשמר, אבל ההזמנה למייל נכשלה (אולי המייל כבר הוזמן)." };
  }

  refresh();
  return { ok: `${name} נוסף/ה. אפשר להיכנס למערכת עם המייל ${email}.` };
}

export async function updateTherapistAction(therapistId: string, fd: FormData) {
  const supabase = await createClient();
  await supabase
    .from("therapists")
    .update({
      display_name: text(fd, "display_name") || undefined,
      business_status: pick(text(fd, "business_status"), STATUSES, "exempt"),
      split: pick(text(fd, "split"), SPLITS, "split_260_90"),
      per_lesson_pay: fd.get("per_lesson_pay") ? Math.max(0, Math.round(Number(fd.get("per_lesson_pay")) || 0)) : null,
      is_active: fd.get("is_active") === "on",
    })
    .eq("id", therapistId);
  refresh();
}
