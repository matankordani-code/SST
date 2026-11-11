"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ContactState = { ok?: boolean; error?: string } | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-\s()]{7,20}$/;

// Phone/email from the clients list, plus the invoice contact for Morning.
export async function updateContactAction(clientId: string, _: ContactState, fd: FormData): Promise<ContactState> {
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const phone = get("phone");
  const email = get("email");
  const invoiceEmail = get("invoice_email");
  const invoicePhone = get("invoice_phone");
  for (const e of [email, invoiceEmail]) if (e && !EMAIL.test(e)) return { error: `כתובת מייל לא תקינה: ${e}` };
  for (const p of [phone, invoicePhone]) if (p && !PHONE.test(p)) return { error: `מספר טלפון לא תקין: ${p}` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_client_contact", {
    p_client_id: clientId,
    p_phone: phone,
    p_email: email,
    p_invoice_email: invoiceEmail,
    p_invoice_phone: invoicePhone,
  });
  if (error) return { error: "השמירה נכשלה. ייתכן שצריך להריץ את מיגרציה 0022." };
  if (data !== "ok") return { error: "אין לך הרשאה לעדכן את המטופל הזה." };
  refresh();
  return { ok: true };
}
