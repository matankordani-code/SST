"use server";

import { createClient } from "@/lib/supabase/server";
import type { SessionStatus } from "@/lib/sessions";

// The quick report panel ("דיווח"): opens on any session of the therapist's
// own client, and saves by itself while typing and when it closes.

export type ReportData = {
  sessionId: string;
  clientId: string;
  clientName: string;
  startsAt: string;
  status: SessionStatus;
  did: string;
  mood: number | null;
  nextGoal: string;
  updatedAt: string | null;
  prev: { startsAt: string; did: string; nextGoal: string | null } | null;
  goal: string | null;
};

export async function loadReportAction(sessionId: string): Promise<ReportData | { error: string }> {
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("sessions")
    .select("id, client_id, starts_at, status, client:clients(full_name, therapist_id)")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; client_id: string; starts_at: string; status: SessionStatus; client: { full_name: string; therapist_id: string } | null }>();
  if (!s) return { error: "המפגש לא נמצא." };
  const { data: myId } = await supabase.rpc("my_therapist_id");
  if (!s.client || s.client.therapist_id !== myId) return { error: "רק המטפל של המטופל יכול לדווח." };

  const [{ data: summary }, { data: prev }, { data: file }] = await Promise.all([
    supabase.from("session_summaries").select("did, mood, next_goal, updated_at").eq("session_id", sessionId).maybeSingle(),
    supabase
      .from("sessions")
      .select("starts_at, summary:session_summaries(did, next_goal)")
      .eq("client_id", s.client_id)
      .eq("status", "held")
      .lt("starts_at", s.starts_at)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("client_files").select("goal").eq("client_id", s.client_id).maybeSingle(),
  ]);
  const p = prev as unknown as { starts_at: string; summary: { did: string; next_goal: string | null } | null } | null;

  return {
    sessionId: s.id,
    clientId: s.client_id,
    clientName: s.client.full_name,
    startsAt: s.starts_at,
    status: s.status,
    did: summary?.did ?? "",
    mood: summary?.mood ?? null,
    nextGoal: summary?.next_goal ?? "",
    updatedAt: summary?.updated_at ?? null,
    prev: p?.summary ? { startsAt: p.starts_at, did: p.summary.did, nextGoal: p.summary.next_goal } : null,
    goal: (file as { goal: string | null } | null)?.goal ?? null,
  };
}

export type SaveResult = { ok: true; savedAt: string; held: boolean } | { ok: false; error: string };

// Autosave: no page refresh here (the panel refreshes the screen when it closes).
export async function autosaveReportAction(
  sessionId: string,
  input: { did: string; mood: number | null; nextGoal: string },
): Promise<SaveResult> {
  const did = input.did.trim().slice(0, 8000);
  if (!did) return { ok: false, error: "כדי לשמור, כתוב מה עשינו במפגש." };
  const mood = Number.isInteger(input.mood) && input.mood! >= 1 && input.mood! <= 5 ? input.mood : null;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("session_summaries").upsert({
    session_id: sessionId,
    did,
    mood,
    next_goal: input.nextGoal.trim().slice(0, 500) || null,
    updated_at: now,
  });
  if (error) return { ok: false, error: "השמירה נכשלה. נסה שוב." };
  // A report on a session that already started means it took place.
  const { data: changed } = await supabase
    .from("sessions")
    .update({ status: "held" })
    .eq("id", sessionId)
    .eq("status", "planned")
    .lte("starts_at", now)
    .select("id")
    .maybeSingle();
  return { ok: true, savedAt: now, held: !!changed };
}
