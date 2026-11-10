"use client";

import { useActionState } from "react";
import { testKeyAction } from "./actions";
import { Field, inputClass } from "@/components/field";

export function KeyTestForm() {
  const [result, action, pending] = useActionState(testKeyAction, undefined);

  return (
    <form action={action} autoComplete="off" className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-white p-5">
      <h2 className="text-xl font-bold">בדיקת מפתח Morning</h2>
      <p className="text-sm text-muted">
        מדביקים כאן את שני החלקים של המפתח מיד אחרי שיצרת אותו ב-Morning. המערכת רק בודקת אותם מול Morning ולא
        שומרת כלום. אם יופיע &quot;המפתח תקין&quot;, מדביקים את אותם ערכים ב-Vercel.
      </p>
      <Field label="מזהה (Client ID)">
        <input name="id" dir="ltr" required className={inputClass + " text-left font-mono"} />
      </Field>
      <Field label="מפתח סודי (Client Secret)">
        <input name="secret" type="password" dir="ltr" required className={inputClass + " text-left font-mono"} />
      </Field>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "בודק…" : "בדיקה"}
        </button>
      </div>
      {result === "ok" && (
        <p role="status" className="rounded-lg bg-[#E4F1E6] px-3 py-2 text-[15px] font-semibold text-[#22582C]">
          ✓ המפתח תקין. עכשיו מדביקים את אותם שני ערכים ב-Vercel.
        </p>
      )}
      {result && result !== "ok" && (
        <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink" dir="auto">
          {result}
        </p>
      )}
    </form>
  );
}
