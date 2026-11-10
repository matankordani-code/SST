"use client";

import { useActionState } from "react";
import { createPaymentRequestAction } from "@/app/payments/actions";
import { CARD_PRICE, formatShekel } from "@/lib/clients";
import { inputClass } from "@/components/field";

export function NewPaymentRequest({ clientId, rate }: { clientId: string; rate: number }) {
  const [state, action, pending] = useActionState(createPaymentRequestAction.bind(null, clientId), undefined);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg bg-sand p-3">
      <label className="flex flex-[1_1_220px] flex-col gap-1 text-[13px] text-muted">
        דרישת תשלום
        <select name="kind" defaultValue="single" className={inputClass + " bg-white"}>
          <option value="single">מפגש בודד · {formatShekel(rate)}</option>
          <option value="card4">כרטיסייה 4 · {formatShekel(CARD_PRICE.card4)}</option>
          <option value="card10">כרטיסייה 10 · {formatShekel(CARD_PRICE.card10)}</option>
        </select>
      </label>
      <label className="flex flex-[0_1_160px] flex-col gap-1 text-[13px] text-muted">
        אמצעי תשלום
        <select name="group" defaultValue="100" className={inputClass + " bg-white"}>
          <option value="100">כרטיס אשראי</option>
          <option value="120">ביט</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
      >
        {pending ? "יוצר קישור…" : "יצירת קישור תשלום"}
      </button>
      {state?.error && (
        <p role="alert" className="w-full rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
          {state.error}
        </p>
      )}
      <p className="w-full text-[13px] text-muted">
        אחרי התשלום Morning מפיק חשבונית מס/קבלה ושולח אותה למייל המשלם. כרטיסייה נפתחת אוטומטית.
      </p>
    </form>
  );
}
