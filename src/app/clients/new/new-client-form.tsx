"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createClientAction } from "@/app/clients/actions";
import { DEFAULT_RATE, PAYMENT_LABEL, PAYMENT_METHODS } from "@/lib/clients";
import { Field, inputClass } from "@/components/field";

export function NewClientForm({
  therapists,
  defaultTherapistId,
  cancelHref,
  defaultRate = DEFAULT_RATE,
  instructor = false,
}: {
  therapists: { id: string; display_name: string }[] | null;
  defaultTherapistId?: string;
  cancelHref: string;
  defaultRate?: number;
  instructor?: boolean;
}) {
  const [state, action, pending] = useActionState(createClientAction, undefined);
  const [payerOther, setPayerOther] = useState(false);

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-white p-5"
    >
      <h2 className="text-xl font-bold">{instructor ? "תלמיד חדש" : "מטופל חדש"}</h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Field label="שם מלא *">
          <input name="full_name" required className={inputClass} />
        </Field>
        <Field label="טלפון">
          <input name="phone" type="tel" dir="ltr" className={inputClass + " text-right"} />
        </Field>
        <Field label="מייל (לחשבוניות ולתזכורות)">
          <input name="email" type="email" dir="ltr" className={inputClass + " text-right"} />
        </Field>
        <Field label="גיל">
          <input name="age" type="number" min={0} max={120} className={inputClass} />
        </Field>
        <Field label="כמות טיפולים מתוכננת">
          <input name="planned_sessions" type="number" min={1} className={inputClass} />
        </Field>
        <Field label="אופן תשלום">
          <select name="payment_method" defaultValue="single" className={inputClass + " bg-white"}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תעריף למפגש (₪)">
          <input
            name="rate"
            type="number"
            min={0}
            defaultValue={defaultRate}
            className={inputClass}
          />
        </Field>
        {therapists && (
          <Field label="מטפל">
            <select
              name="therapist_id"
              defaultValue={defaultTherapistId}
              className={inputClass + " bg-white"}
            >
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg bg-sand p-3">
        <legend className="sr-only">משלם</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
          <input
            type="checkbox"
            name="payer_other"
            checked={payerOther}
            onChange={(e) => setPayerOther(e.target.checked)}
            className="size-5 accent-primary"
          />
          מישהו אחר משלם (למשל הורה של קטין)
        </label>
        {payerOther && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <Field label="שם המשלם *">
              <input name="payer_name" required className={inputClass + " bg-white"} />
            </Field>
            <Field label="טלפון המשלם">
              <input
                name="payer_phone"
                type="tel"
                dir="ltr"
                className={inputClass + " bg-white text-right"}
              />
            </Field>
            <Field label="מייל המשלם (לחשבוניות)">
              <input
                name="payer_email"
                type="email"
                dir="ltr"
                className={inputClass + " bg-white text-right"}
              />
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl bg-sand p-4">
        <legend className="px-1 text-sm font-semibold">חשבונית והצהרת בריאות</legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <Field label="מייל לחשבונית (אם שונה)">
            <input name="invoice_email" type="email" dir="ltr" className={inputClass + " bg-white text-right"} />
          </Field>
          <Field label="טלפון לחשבונית (אם שונה)">
            <input name="invoice_phone" type="tel" dir="ltr" className={inputClass + " bg-white text-right"} />
          </Field>
          <Field label="טופס הצהרת בריאות">
            <select name="health_form" defaultValue="auto" className={inputClass + " bg-white"}>
              <option value="auto">אוטומטי לפי הגיל והמשלם</option>
              <option value="adult">מבוגר/ת (מעל 18)</option>
              <option value="minor">הורה עבור בן/בת</option>
              <option value="none">לא לשלוח עכשיו</option>
            </select>
          </Field>
        </div>
      </fieldset>

      {!instructor && (
        <>
          <Field label="מטרת הטיפול">
            <input name="goal" className={inputClass} />
          </Field>
          <Field label="תקציר ראשוני">
            <textarea name="intro" rows={4} className={inputClass + " py-2.5"} />
          </Field>
          <p className="text-[13px] text-muted">
            המטרה והתקציר נשמרים בתיק האישי. רק המטפל רואה אותם, אלא אם הוא משתף את התיק.
          </p>
        </>
      )}

      {state?.error && (
        <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
          {state.error}
        </p>
      )}

      <p className="text-[13px] text-muted">
        בשמירה תישלח הצהרת בריאות לחתימה במייל: טופס ההורה למשלם (לקטין/ה), או טופס המבוגר למטופל.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "שומר…" : "שמירת מטופל"}
        </button>
        <Link
          href={cancelHref}
          className="flex min-h-11 items-center rounded-lg border border-field bg-white px-5 text-[15px]"
        >
          ביטול
        </Link>
      </div>
    </form>
  );
}
