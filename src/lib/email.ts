import "server-only";
import { formatDateTime } from "@/lib/time";

// Emails through Resend (https://resend.com). Swappable: only this file talks to it.
// Env: RESEND_API_KEY, EMAIL_FROM (e.g. "SST · מרכז <noreply@your-domain>"), APP_URL.
// Emails never carry therapeutic content: only time, therapist and a link.

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function appUrl() {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

export async function sendEmail(input: { to: string; subject: string; body: string[] }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("Email skipped: RESEND_API_KEY is not set");
    return false;
  }
  const from = process.env.EMAIL_FROM || "SST <onboarding@resend.dev>";
  const url = appUrl();
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f7f3ec;font-family:Arial,sans-serif;color:#12303b">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#fff;border:1px solid #e3dccf;border-radius:12px;padding:24px;direction:rtl;text-align:right">
${input.body.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.6">${esc(p)}</p>`).join("")}
${url ? `<p style="margin:16px 0 0"><a href="${url}" style="color:#1d6a80">לאזור האישי</a></p>` : ""}
</div>
<p style="font-size:12px;color:#55656b;text-align:center;margin-top:12px">SST™ · המרכז</p>
</div></body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html, text: input.body.join("\n\n") }),
      cache: "no-store",
    });
    if (!res.ok) console.error(`Resend failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.ok;
  } catch (e) {
    console.error("Resend failed", e);
    return false;
  }
}

// ---------- Templates ----------

const when = (iso: string) => formatDateTime(iso);

export function reminderEmail(p: { toName: string; clientFirst: string; therapist: string; startsAt: string }) {
  return {
    subject: `תזכורת: מפגש מחר, ${when(p.startsAt)}`,
    body: [
      `שלום ${p.toName},`,
      `תזכורת למפגש של ${p.clientFirst} עם ${p.therapist} מחר, ${when(p.startsAt)}.`,
      "ביטול עד 24 שעות לפני המפגש, בהודעה אישית למטפל, אינו כרוך בחיוב.",
    ],
  };
}

export function movedEmail(p: { toName: string; clientFirst: string; therapist: string; startsAt: string }) {
  return {
    subject: `המפגש הועבר ל${when(p.startsAt)}`,
    body: [`שלום ${p.toName},`, `המפגש של ${p.clientFirst} עם ${p.therapist} הועבר ל${when(p.startsAt)}.`],
  };
}

export function cancelledEmail(p: { toName: string; clientFirst: string; therapist: string; startsAt: string; count?: number }) {
  const more = p.count && p.count > 1 ? ` ועוד ${p.count - 1} מפגשים קבועים אחריו` : "";
  return {
    subject: `המפגש ב${when(p.startsAt)} בוטל`,
    body: [`שלום ${p.toName},`, `המפגש של ${p.clientFirst} עם ${p.therapist} ב${when(p.startsAt)}${more} בוטל.`],
  };
}

export function settlementEmail(p: { therapist: string; month: string; stage: "approve" | "invoice"; amount: number | null }) {
  return p.stage === "approve"
    ? {
        subject: `תזכורת: אישור הדיווח לחודש ${p.month}`,
        body: [
          `שלום ${p.therapist},`,
          `הדיווח לחודש ${p.month} עדיין לא אושר. המועד המוצע לאישור הוא ה-3 בחודש.`,
          "אפשר לאשר במסך \"סיכום חודשי\" במערכת.",
        ],
      }
    : {
        subject: `תזכורת: חשבונית לחודש ${p.month}`,
        body: [
          `שלום ${p.therapist},`,
          `הדיווח לחודש ${p.month} אושר, אבל עוד לא הועלתה חשבונית${p.amount ? ` על ${p.amount.toLocaleString("he-IL")} ₪` : ""}. המועד המוצע הוא ה-5 בחודש.`,
          "אפשר להעלות אותה במסך \"סיכום חודשי\" במערכת.",
        ],
      };
}
