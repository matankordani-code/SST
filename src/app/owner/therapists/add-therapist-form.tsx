"use client";

import { useActionState, useState } from "react";
import { addTherapistAction } from "./actions";
import { Field, inputClass } from "@/components/field";
import { BUSINESS_STATUS_LABEL, SPLIT_LABEL } from "@/lib/therapists";

export function AddTherapistForm() {
  const [state, action, pending] = useActionState(addTherapistAction, undefined);
  const [role, setRole] = useState("therapist");
  const instructor = role === "surf_instructor";

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-white p-5">
      <h2 className="text-lg font-bold">הוספת מטפל או מדריך גלישה</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Field label="תפקיד">
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass + " bg-white"}>
            <option value="therapist">מטפל</option>
            <option value="surf_instructor">מדריך גלישה</option>
          </select>
        </Field>
        <Field label="שם *">
          <input name="display_name" required className={inputClass} />
        </Field>
        <Field label="מייל לכניסה למערכת *">
          <input name="email" type="email" required dir="ltr" className={inputClass + " text-right"} />
        </Field>
        <Field label="סטטוס עוסק">
          <select name="business_status" defaultValue="exempt" className={inputClass + " bg-white"}>
            {Object.entries(BUSINESS_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {instructor ? (
          <Field label="תשלום למדריך לשיעור (₪)">
            <input name="per_lesson_pay" type="number" min={0} defaultValue={100} className={inputClass} />
          </Field>
        ) : (
          <Field label="חלוקה">
            <select name="split" defaultValue="split_260_90" className={inputClass + " bg-white"}>
              {Object.entries(SPLIT_LABEL)
                .filter(([v]) => v !== "per_lesson")
                .map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
            </select>
          </Field>
        )}
      </div>
      {instructor && (
        <p className="text-[13px] text-muted">
          שיעור גלישה: 280 ₪ ללקוח. המדריך מקבל את הסכום שכאן על כל שיעור שהתקיים, והשאר נשאר למרכז. למדריך אין גישה
          לתיקים טיפוליים.
        </p>
      )}
      <p className="text-[13px] text-muted">
        המטפל ייכנס עם המייל הזה ויקבל קוד. כל עוד הדומיין לא מחובר לשירות המיילים, הקוד לא יגיע אליו.
      </p>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-lg bg-[#E4F1E6] px-3 py-2 text-sm text-[#22582C]">
          {state.ok}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "שומר…" : "הוספת מטפל"}
        </button>
      </div>
    </form>
  );
}
