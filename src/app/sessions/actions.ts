"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSessionStatus, type SessionStatus } from "@/lib/sessions";
import { addDays, israelToUtc, isDayKey, weekStart } from "@/lib/time";

export type FormState = { error?: string } | undefined;

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const TIME_RE = /^\d{2}:\d{2}$/;

export async function createSessionAction(_: FormState, fd: FormData): Promise<FormState> {
  const clientId = text(fd, "client_id");
  const date = text(fd, "date");
  const time = text(fd, "time");
  const duration = Number(text(fd, "duration_min") || 60);
  const repeat = fd.get("repeat") === "on";
  const count = repeat ? Number(text(fd, "count") || 1) : 1;

  if (!clientId) return { error: "בחר מטופל." };
  if (!isDayKey(date) || !TIME_RE.test(time)) return { error: "תאריך או שעה לא תקינים." };
  if (!Number.isInteger(duration) || duration < 15 || duration > 240)
    return { error: "משך המפגש צריך להיות בין 15 ל-240 דקות." };
  if (!Number.isInteger(count) || count < 1 || count > 52)
    return { error: "מספר המפגשים הקבועים צריך להיות בין 1 ל-52." };

  const seriesId = count > 1 ? crypto.randomUUID() : null;
  const rows = Array.from({ length: count }, (_, i) => ({
    client_id: clientId,
    starts_at: israelToUtc(addDays(date, i * 7), time).toISOString(),
    duration_min: duration,
    series_id: seriesId,
  }));

  const supabase = await createClient();
  // therapist_id and price are filled by a DB trigger from the client.
  const { error } = await supabase.from("sessions").insert(rows as never);
  if (error) return { error: "הקביעה נכשלה. ודא שהמטופל שייך לך ונסה שוב." };

  redirect(`/calendar?week=${weekStart(date)}`);
}

export async function reportAction(sessionId: string, status: SessionStatus) {
  if (!isSessionStatus(status)) return;
  const supabase = await createClient();
  await supabase.from("sessions").update({ status }).eq("id", sessionId);
  refresh();
}

export async function saveSummaryAction(sessionId: string, fd: FormData) {
  const did = text(fd, "did");
  if (!did) return;
  const moodRaw = Number(text(fd, "mood"));
  const mood = Number.isInteger(moodRaw) && moodRaw >= 1 && moodRaw <= 5 ? moodRaw : null;

  const supabase = await createClient();
  await supabase.from("session_summaries").upsert({
    session_id: sessionId,
    did,
    mood,
    next_goal: text(fd, "next_goal") || null,
    updated_at: new Date().toISOString(),
  });
  // Writing a summary means the session took place.
  await supabase.from("sessions").update({ status: "held" }).eq("id", sessionId).eq("status", "planned");
  refresh();
}

export async function moveSessionAction(sessionId: string, fd: FormData) {
  const date = text(fd, "date");
  const time = text(fd, "time");
  if (!isDayKey(date) || !TIME_RE.test(time)) return;
  const supabase = await createClient();
  await supabase
    .from("sessions")
    .update({ starts_at: israelToUtc(date, time).toISOString() })
    .eq("id", sessionId)
    .eq("status", "planned");
  refresh();
}

export async function deleteSessionAction(
  sessionId: string,
  seriesId: string | null,
  startsAt: string,
  scope: "one" | "series",
) {
  const supabase = await createClient();
  if (scope === "series" && seriesId) {
    await supabase
      .from("sessions")
      .delete()
      .eq("series_id", seriesId)
      .eq("status", "planned")
      .gte("starts_at", startsAt);
  } else {
    await supabase.from("sessions").delete().eq("id", sessionId).eq("status", "planned");
  }
  redirect("/calendar");
}

export async function addCardAction(clientId: string, fd: FormData) {
  const size = Number(text(fd, "size"));
  const amount = Number(text(fd, "amount_paid"));
  const date = text(fd, "purchased_on");
  if (![4, 10].includes(size) || !Number.isInteger(amount) || amount < 0 || !isDayKey(date)) return;

  const supabase = await createClient();
  await supabase.from("punch_cards").insert({
    client_id: clientId,
    size,
    amount_paid: amount,
    purchased_on: date,
    paid_note: text(fd, "paid_note") || null,
  });
  refresh();
}
