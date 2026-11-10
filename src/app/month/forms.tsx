"use client";

import { useActionState } from "react";
import { approveFormAction, uploadInvoiceAction } from "./actions";
import { Field, inputClass } from "@/components/field";
import { formatShekel } from "@/lib/clients";

function Msg({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="rounded-lg bg-[#E4F1E6] px-3 py-2 text-sm text-[#22582C]">
        {state.ok}
      </p>
    );
  return null;
}

export function ApproveButton({ therapistId, month }: { therapistId: string; month: string }) {
  const [state, action, pending] = useActionState(approveFormAction.bind(null, therapistId, month), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        עבור על הקובץ למטה. אחרי האישור החודש ננעל, ותיקון אפשרי רק דרך מתניה.
      </p>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "מאשר…" : "אישור הדיווח"}
        </button>
      </div>
      <Msg state={state} />
    </form>
  );
}

export function InvoiceForm({
  therapistId,
  month,
  expected,
}: {
  therapistId: string;
  month: string;
  expected: number;
}) {
  const [state, action, pending] = useActionState(uploadInvoiceAction.bind(null, therapistId, month), undefined);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-primary bg-[#EEF5F7] p-3">
      <p className="text-sm">
        הסכום לחשבונית למרכז: <strong className="tabular-nums">{formatShekel(expected)}</strong>. מוציאים אותה
        מהמערכת שלך ומעלים כאן קובץ PDF.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-end gap-3">
        <Field label="קובץ החשבונית">
          <input name="file" type="file" accept="application/pdf,image/*" required className="text-sm" />
        </Field>
        <Field label="הסכום בחשבונית (₪)">
          <input name="amount" type="number" min={0} defaultValue={expected} required className={inputClass + " bg-white"} />
        </Field>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white disabled:opacity-60"
          >
            {pending ? "מעלה…" : "העלאת חשבונית"}
          </button>
        </div>
      </div>
      <Msg state={state} />
    </form>
  );
}
