"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string } | undefined;

const monthDate = (m: string) => `${m}-01`;

export async function approveAction(therapistId: string, month: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_settlement", {
    p_therapist: therapistId,
    p_month: monthDate(month),
  });
  if (error) return { error: "האישור נכשל." };
  if (data === "unreported") return { error: "יש מפגשים בחודש שעוד לא דווחו. דווח עליהם קודם." };
  refresh();
  return { ok: "הדיווח אושר והחודש ננעל." };
}

export async function approveFormAction(therapistId: string, month: string, _: FormState): Promise<FormState> {
  return approveAction(therapistId, month);
}

export async function uploadInvoiceAction(
  therapistId: string,
  month: string,
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const file = fd.get("file");
  const amount = Number(fd.get("amount"));
  if (!(file instanceof File) || file.size === 0) return { error: "בחר קובץ חשבונית." };
  if (file.size > 4 * 1024 * 1024) return { error: "הקובץ גדול מ-4MB." };
  if (!Number.isInteger(amount) || amount < 0) return { error: "סכום החשבונית צריך להיות מספר שלם." };

  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const path = `${therapistId}/${month}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from("invoices")
    .upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
  if (upErr) return { error: "העלאת הקובץ נכשלה." };

  const { data } = await supabase.rpc("submit_settlement_invoice", {
    p_therapist: therapistId,
    p_month: monthDate(month),
    p_path: path,
    p_amount: amount,
  });
  if (data !== "ok") return { error: "צריך לאשר את הדיווח לפני העלאת חשבונית." };
  refresh();
  return { ok: "החשבונית הועלתה." };
}

export async function setStatusAction(therapistId: string, month: string, status: "open" | "closed") {
  const supabase = await createClient();
  await supabase.rpc("set_settlement_status", {
    p_therapist: therapistId,
    p_month: monthDate(month),
    p_status: status,
  });
  refresh();
}
