"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { after } from "next/server";
import { sendIntakeDeclarations } from "@/lib/declarations";
import { createClient } from "@/lib/supabase/server";
import { isPaymentMethod } from "@/lib/clients";

export type FormState = { error?: string } | undefined;

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function int(fd: FormData, key: string): number | null {
  const v = text(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

export async function createClientAction(_: FormState, fd: FormData): Promise<FormState> {
  const fullName = text(fd, "full_name");
  if (!fullName) return { error: "חסר שם מלא." };

  const age = int(fd, "age");
  const planned = int(fd, "planned_sessions");
  const rate = int(fd, "rate");
  if (Number.isNaN(age) || Number.isNaN(planned) || Number.isNaN(rate)) {
    return { error: "גיל, כמות טיפולים ותעריף צריכים להיות מספרים שלמים." };
  }

  const method = text(fd, "payment_method");
  const payerIsOther = fd.get("payer_other") === "on";
  const payerName = payerIsOther ? text(fd, "payer_name") : "";
  if (payerIsOther && !payerName) return { error: "חסר שם המשלם." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_client", {
    p_full_name: fullName,
    p_phone: text(fd, "phone"),
    p_email: text(fd, "email"),
    p_age: age,
    p_planned_sessions: planned,
    p_payment_method: isPaymentMethod(method) ? method : "single",
    p_rate: rate ?? 350,
    p_goal: text(fd, "goal"),
    p_intro: text(fd, "intro"),
    p_payer_name: payerName,
    p_payer_phone: payerIsOther ? text(fd, "payer_phone") : "",
    p_payer_email: payerIsOther ? text(fd, "payer_email") : "",
    p_therapist_id: text(fd, "therapist_id") || null,
  });

  if (error || !data) return { error: "השמירה נכשלה. נסה שוב." };

  // Invoice contact (Morning's receipt), when it isn't the usual email.
  const invoiceEmail = text(fd, "invoice_email");
  const invoicePhone = text(fd, "invoice_phone");
  if (invoiceEmail || invoicePhone) {
    const contact = payerIsOther
      ? { phone: text(fd, "payer_phone"), email: text(fd, "payer_email") }
      : { phone: text(fd, "phone"), email: text(fd, "email") };
    await supabase.rpc("update_client_contact", {
      p_client_id: data as string,
      p_phone: contact.phone,
      p_email: contact.email,
      p_invoice_email: invoiceEmail,
      p_invoice_phone: invoicePhone,
    });
  }

  // Health declaration goes out by email right away: the parent's form for a minor
  // (or when someone else pays), the adult form otherwise.
  const payerEmail = payerIsOther ? text(fd, "payer_email") : text(fd, "email");
  const intake = {
    clientId: data as string,
    clientName: fullName,
    age,
    toEmail: payerEmail || null,
    toName: payerIsOther ? payerName : fullName,
    hasPayer: payerIsOther,
    form: text(fd, "health_form"),
  };
  after(() => sendIntakeDeclarations(supabase, intake));
  redirect(`/clients/${data}`);
}

export async function updateClientAction(
  clientId: string,
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const fullName = text(fd, "full_name");
  if (!fullName) return { error: "חסר שם מלא." };
  const age = int(fd, "age");
  const planned = int(fd, "planned_sessions");
  const rate = int(fd, "rate");
  if (Number.isNaN(age) || Number.isNaN(planned) || Number.isNaN(rate)) {
    return { error: "גיל, כמות טיפולים ותעריף צריכים להיות מספרים שלמים." };
  }
  const method = text(fd, "payment_method");
  const payerOther = fd.get("payer_other") === "on";
  if (payerOther && !text(fd, "payer_name")) return { error: "חסר שם המשלם." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_client", {
    p_client_id: clientId,
    p_full_name: fullName,
    p_phone: text(fd, "phone"),
    p_email: text(fd, "email"),
    p_age: age,
    p_planned_sessions: planned,
    p_payment_method: isPaymentMethod(method) ? method : "single",
    p_rate: rate ?? 350,
    p_payer_other: payerOther,
    p_payer_name: text(fd, "payer_name"),
    p_payer_phone: text(fd, "payer_phone"),
    p_payer_email: text(fd, "payer_email"),
  });
  if (error) return { error: "השמירה נכשלה. נסה שוב." };
  redirect(`/clients/${clientId}`);
}

export async function updateFileAction(clientId: string, fd: FormData) {
  const supabase = await createClient();
  await supabase
    .from("client_files")
    .update({
      goal: text(fd, "goal") || null,
      intro: text(fd, "intro") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId);
  refresh();
}

export async function setShareAction(clientId: string, shared: boolean) {
  const supabase = await createClient();
  await supabase
    .from("client_files")
    .update({ shared_with_owner: shared, owner_requested_at: null })
    .eq("client_id", clientId);
  refresh();
}

export async function requestAccessAction(clientId: string) {
  const supabase = await createClient();
  await supabase.rpc("request_file_access", { p_client_id: clientId });
  refresh();
}

export async function transferClientAction(clientId: string, fd: FormData) {
  const therapistId = text(fd, "therapist_id");
  if (!therapistId) return;
  const supabase = await createClient();
  await supabase.from("clients").update({ therapist_id: therapistId }).eq("id", clientId);
  refresh();
}

export type InviteState = { error?: string; email?: string } | undefined;

// Opens the personal area for this client's payer (or the client).
export async function inviteToPortalAction(clientId: string): Promise<InviteState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_to_portal", { p_client: clientId });
  if (error) return { error: "ההזמנה נכשלה." };
  if (!data) return { error: "אין מייל למשלם או למטופל. הוסף מייל בעריכת הפרטים." };
  return { email: data as string };
}
