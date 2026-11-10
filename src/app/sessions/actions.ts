"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { after } from "next/server";
import { notifyCancelled, notifyMoved, sessionContact } from "@/lib/session-mail";
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
  const cancelling = status === "cancelled_ontime" || status === "cancelled_late";
  // A planned session that is now cancelled: tell the payer (after the response is sent).
  const { data: changed } = await supabase
    .from("sessions")
    .update({ status })
    .eq("id", sessionId)
    .neq("status", status)
    .select("id")
    .maybeSingle();
  if (changed && cancelling) {
    const contact = await sessionContact(supabase, sessionId);
    if (contact && new Date(contact.startsAt) > new Date()) after(() => notifyCancelled(contact));
  }
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
  const startsAt = israelToUtc(date, time).toISOString();
  const { data: moved } = await supabase
    .from("sessions")
    .update({ starts_at: startsAt })
    .eq("id", sessionId)
    .eq("status", "planned")
    .neq("starts_at", startsAt)
    .select("id")
    .maybeSingle();
  if (moved) {
    const contact = await sessionContact(supabase, sessionId);
    after(() => notifyMoved(contact));
  }
  refresh();
}

export async function deleteSessionAction(
  sessionId: string,
  seriesId: string | null,
  startsAt: string,
  scope: "one" | "series",
) {
  const supabase = await createClient();
  // Read who to tell before the row is gone.
  const contact = await sessionContact(supabase, sessionId);
  let deleted: { id: string }[] | null;
  if (scope === "series" && seriesId) {
    ({ data: deleted } = await supabase
      .from("sessions")
      .delete()
      .eq("series_id", seriesId)
      .eq("status", "planned")
      .gte("starts_at", startsAt)
      .select("id"));
  } else {
    ({ data: deleted } = await supabase.from("sessions").delete().eq("id", sessionId).eq("status", "planned").select("id"));
  }
  const count = deleted?.length ?? 0;
  if (count > 0 && contact && new Date(contact.startsAt) > new Date()) after(() => notifyCancelled(contact, count));
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
