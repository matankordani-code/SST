"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CARD_PRICE, isPaymentMethod } from "@/lib/clients";
import type { ImportRow } from "@/lib/import-parse";
import { dayKey } from "@/lib/time";

export type ImportResult = { created: number; skipped: string[]; failed: string[] };

// Creates clients (+ payer + current punch card) from the previewed rows.
export async function importClientsAction(therapistId: string, rows: ImportRow[]): Promise<ImportResult> {
  await requireRole("owner");
  const supabase = await createClient();

  const { data: existing } = await supabase.from("clients").select("full_name").eq("therapist_id", therapistId);
  const taken = new Set((existing ?? []).map((c) => c.full_name.trim()));

  const result: ImportResult = { created: 0, skipped: [], failed: [] };
  for (const r of rows) {
    if (!r.include || !r.name.trim()) continue;
    if (taken.has(r.name.trim())) {
      result.skipped.push(r.name);
      continue;
    }
    const method = isPaymentMethod(r.method) ? r.method : "single";
    const { data: id, error } = await supabase.rpc("create_client", {
      p_full_name: r.name,
      p_phone: "",
      p_email: "",
      p_age: null,
      p_planned_sessions: null,
      p_payment_method: method,
      p_rate: Number.isInteger(r.rate) && r.rate > 0 ? r.rate : 350,
      p_goal: "",
      p_intro: "",
      p_payer_name: r.payer,
      p_payer_phone: "",
      p_payer_email: "",
      p_therapist_id: therapistId,
    });
    if (error || !id) {
      result.failed.push(r.name);
      continue;
    }
    if (method !== "single") {
      const size = method === "card4" ? 4 : 10;
      await supabase.from("punch_cards").insert({
        client_id: id,
        size,
        amount_paid: CARD_PRICE[method],
        purchased_on: dayKey(new Date()),
        paid_note: "ייבוא מהאקסל",
        used_offset: Math.max(0, Math.min(size, Math.round(r.used) || 0)),
      });
    }
    taken.add(r.name.trim());
    result.created++;
  }
  return result;
}
