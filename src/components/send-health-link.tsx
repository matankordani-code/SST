"use client";

import { useActionState, useState } from "react";
import { sendHealthAction } from "@/app/declarations/actions";

type Form = "adult" | "minor";
const LABEL: Record<Form, string> = { adult: "מבוגר/ת (מעל 18)", minor: "הורה עבור בן/בת" };

// Sends the health declaration: pick the form (adult signs for themself, or a
// parent for their child). It is emailed to the client / the parent, and the
// link is shown once to send by WhatsApp or copy.
export function SendHealthLink({ clientId, suggested }: { clientId: string; suggested: Form }) {
  const [form, setForm] = useState<Form>(suggested);
  const [state, action, pending] = useActionState(() => sendHealthAction(clientId, form), undefined);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="סוג הטופס">
        <span className="text-[13px] text-muted">טופס:</span>
        {(["adult", "minor"] as Form[]).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={form === f}
            onClick={() => setForm(f)}
            className={
              "min-h-10 rounded-lg px-3 text-sm " +
              (form === f ? "bg-primary font-semibold text-white" : "border border-field bg-white hover:bg-sand")
            }
          >
            {LABEL[f]}
          </button>
        ))}
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-lg border border-primary bg-white px-3 text-sm font-semibold text-primary disabled:opacity-60"
          >
            {pending ? "שולח…" : "שליחת קישור לחתימה"}
          </button>
        </form>
      </div>
      {state?.error && <p className="text-sm text-alert-ink">{state.error}</p>}
      {state?.url && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sand p-2 text-sm">
          <span>{state.sentTo
              ? `✓ נשלח במייל ל-${state.sentTo}. אפשר גם:`
              : state.failed
                ? `השליחה במייל ל-${state.failed} נכשלה. שלח/י את הקישור (מוצג פעם אחת):`
                : "אין מייל במערכת. שלח/י את הקישור (מוצג פעם אחת):"}</span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.url!);
                setCopied(true);
              } catch {}
            }}
            className="min-h-10 rounded-lg border border-primary bg-white px-3 text-primary"
          >
            {copied ? "✓ הועתק" : "העתקה"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`שלום, זה קישור למילוי וחתימה על הצהרת הבריאות: ${state.url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center rounded-lg border border-field bg-white px-3"
          >
            שליחה בוואטסאפ
          </a>
        </div>
      )}
    </div>
  );
}
