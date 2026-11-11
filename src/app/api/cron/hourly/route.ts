import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { emailConfigured, reminderEmail, sendEmail, settlementEmail } from "@/lib/email";
import { addDays, addMonths, dayKey, formatMonth, timeOf } from "@/lib/time";

// Called every hour by Supabase (pg_cron + pg_net).
//   20:00–22:59 Israel: reminder for each of tomorrow's sessions (once per session).
//   09:00–11:59 Israel: from the 4th, remind therapists who haven't approved last
//   month; from the 6th, those who approved but haven't uploaded an invoice.
// Every email is logged in email_log, so a repeated run never sends twice. That is
// why the call itself needs no password: it only sends what is due, once, and
// returns counts only. CRON_SECRET (server-only) is what lets it read the database.
export async function GET() {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32) return NextResponse.json({ skipped: "CRON_SECRET is not set" });
  if (!emailConfigured()) return NextResponse.json({ skipped: "RESEND_API_KEY is not set" });

  // No login here: the database functions check the same secret.
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const today = dayKey(now);
  const hour = Number(timeOf(now).slice(0, 2));
  const dayOfMonth = Number(today.slice(8, 10));
  const result = { reminders: 0, settlement: 0, errors: 0 };

  const mark = (kind: string, ref: string, to: string) =>
    db.rpc("cron_mark_sent", { p_token: secret, p_kind: kind, p_ref: ref, p_to: to });

  if (hour >= 20 && hour <= 22) {
    const [{ data, error }, { data: loc }] = await Promise.all([
      db.rpc("cron_session_reminders", { p_token: secret, p_day: addDays(today, 1) }),
      db.rpc("cron_location", { p_token: secret }),
    ]);
    const location = typeof loc === "string" && loc.trim() ? loc.trim() : undefined;
    if (error) result.errors++;
    type R = { session_id: string; starts_at: string; client_first: string; therapist_name: string; to_email: string; to_name: string };
    for (const r of (data ?? []) as R[]) {
      const ok = await sendEmail({
        to: r.to_email,
        ...reminderEmail({ toName: r.to_name, clientFirst: r.client_first, therapist: r.therapist_name, startsAt: r.starts_at, location }),
      });
      if (ok) {
        await mark("reminder", r.session_id, r.to_email);
        result.reminders++;
      } else result.errors++;
    }
  }

  if (hour >= 9 && hour <= 11 && dayOfMonth >= 4) {
    const month = addMonths(today.slice(0, 7), -1);
    const { data, error } = await db.rpc("cron_settlement_reminders", { p_token: secret, p_month: `${month}-01` });
    if (error) result.errors++;
    type S = { therapist_id: string; therapist_name: string; to_email: string; stage: "approve" | "invoice"; amount: number | null };
    for (const s of (data ?? []) as S[]) {
      // Invoice reminders start on the 6th (the deadline is the 5th).
      if (s.stage === "invoice" && dayOfMonth < 6) continue;
      const kind = `settle_${s.stage}`;
      const ref = `${s.therapist_id}:${month}`;
      const { data: sent } = await db.rpc("cron_was_sent", { p_token: secret, p_kind: kind, p_ref: ref });
      if (sent) continue;
      const ok = await sendEmail({
        to: s.to_email,
        ...settlementEmail({ therapist: s.therapist_name, month: formatMonth(month), stage: s.stage, amount: s.amount }),
      });
      if (ok) {
        await mark(kind, ref, s.to_email);
        result.settlement++;
      } else result.errors++;
    }
  }

  return NextResponse.json({ ok: true, hour, ...result });
}
