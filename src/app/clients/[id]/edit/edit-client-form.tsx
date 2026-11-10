"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { updateClientAction } from "@/app/clients/actions";
import { PAYMENT_LABEL, PAYMENT_METHODS, type ClientRow } from "@/lib/clients";
import { Field, inputClass } from "@/components/field";

export function EditClientForm({ client }: { client: ClientRow }) {
  const [state, action, pending] = useActionState(updateClientAction.bind(null, client.id), undefined);
  const [payerOther, setPayerOther] = useState(!!client.payer);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-white p-5">
      <h2 className="text-xl font-bold">עריכת פרטים · {client.full_name}</h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Field label="שם מלא *">
          <input name="full_name" required defaultValue={client.full_name} className={inputClass} />
        </Field>
        <Field label="טלפון">
          <input name="phone" type="tel" dir="ltr" defaultValue={client.phone ?? ""} className={inputClass + " text-right"} />
        </Field>
        <Field label="מייל (לחשבוניות ולתזכורות)">
          <input name="email" type="email" dir="ltr" defaultValue={client.email ?? ""} className={inputClass + " text-right"} />
        </Field>
        <Field label="גיל">
          <input name="age" type="number" min={0} max={120} defaultValue={client.age ?? ""} className={inputClass} />
        </Field>
        <Field label="כמות טיפולים מתוכננת">
          <input name="planned_sessions" type="number" min={1} defaultValue={client.planned_sessions ?? ""} className={inputClass} />
        </Field>
        <Field label="אופן תשלום">
          <select name="payment_method" defaultValue={client.payment_method} className={inputClass + " bg-white"}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תעריף למפגש (₪)">
          <input name="rate" type="number" min={0} defaultValue={client.rate} className={inputClass} />
        </Field>
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
              <input name="payer_name" required defaultValue={client.payer?.full_name ?? ""} className={inputClass + " bg-white"} />
            </Field>
            <Field label="טלפון המשלם">
              <input name="payer_phone" type="tel" dir="ltr" defaultValue={client.payer?.phone ?? ""} className={inputClass + " bg-white text-right"} />
            </Field>
            <Field label="מייל המשלם (לחשבוניות)">
              <input name="payer_email" type="email" dir="ltr" defaultValue={client.payer?.email ?? ""} className={inputClass + " bg-white text-right"} />
            </Field>
          </div>
        )}
      </fieldset>

      <p className="text-[13px] text-muted">
        שינוי תעריף חל על מפגשים שייקבעו מעכשיו. מפגשים שכבר נקבעו שומרים את המחיר שלהם.
      </p>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "שומר…" : "שמירה"}
        </button>
        <Link href={`/clients/${client.id}`} className="flex min-h-11 items-center rounded-lg border border-field bg-white px-5 text-[15px]">
          ביטול
        </Link>
      </div>
    </form>
  );
}
