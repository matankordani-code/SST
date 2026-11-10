"use client";

import { useActionState } from "react";
import { addMemberAction, addTrainingAction, registerAction, type FormState } from "./actions";
import { Field, inputClass } from "@/components/field";
import { WEEKDAY_LABEL } from "@/lib/club";

function Msg({ state }: { state: FormState }) {
  if (state?.error) return <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">{state.error}</p>;
  if (state?.ok) return <p role="status" className="rounded-lg bg-[#E4F1E6] px-3 py-2 text-sm text-[#22582C]">{state.ok}</p>;
  return null;
}

export function AddTrainingForm() {
  const [state, action, pending] = useActionState(addTrainingAction, undefined);
  return (
    <details className="rounded-lg bg-sand p-3">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">+ הוספת אימון קבוע</summary>
      <form action={action} className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-end gap-3">
        <Field label="שם האימון *">
          <input name="name" required className={inputClass + " bg-white"} />
        </Field>
        <Field label="יום">
          <select name="weekday" defaultValue="0" className={inputClass + " bg-white"}>
            {WEEKDAY_LABEL.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="שעה">
          <input name="start_time" type="time" required step={300} className={inputClass + " bg-white"} />
        </Field>
        <Field label="משך (דק׳)">
          <input name="duration_min" type="number" min={15} max={240} defaultValue={60} className={inputClass + " bg-white"} />
        </Field>
        <Field label="מקומות">
          <input name="capacity" type="number" min={1} defaultValue={12} className={inputClass + " bg-white"} />
        </Field>
        <Field label="מאמן">
          <input name="coach" className={inputClass + " bg-white"} />
        </Field>
        <div>
          <button disabled={pending} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-60">
            {pending ? "שומר…" : "הוספה"}
          </button>
        </div>
        <div className="col-span-full"><Msg state={state} /></div>
      </form>
    </details>
  );
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMemberAction, undefined);
  return (
    <details className="rounded-lg bg-sand p-3">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">+ הוספת מנוי</summary>
      <form action={action} className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <Field label="שם מלא *">
          <input name="full_name" required className={inputClass + " bg-white"} />
        </Field>
        <Field label="מייל (לכניסה למערכת)">
          <input name="email" type="email" dir="ltr" className={inputClass + " bg-white text-right"} />
        </Field>
        <Field label="טלפון">
          <input name="phone" type="tel" dir="ltr" className={inputClass + " bg-white text-right"} />
        </Field>
        <Field label="סוג מנוי">
          <select name="plan" defaultValue="community" className={inputClass + " bg-white"}>
            <option value="community">קהילה · 220 ₪</option>
            <option value="storage">אחסון גלשן · 70 ₪</option>
          </select>
        </Field>
        <div>
          <button disabled={pending} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-60">
            {pending ? "שומר…" : "הוספה"}
          </button>
        </div>
        <div className="col-span-full"><Msg state={state} /></div>
      </form>
    </details>
  );
}

export function JoinButton({ trainingId, date, full }: { trainingId: string; date: string; full: boolean }) {
  const [state, action, pending] = useActionState(registerAction.bind(null, trainingId, date), undefined);
  return (
    <form action={action} className="flex flex-col gap-1">
      <button disabled={pending} className={"min-h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-60 " + (full ? "border border-primary bg-white text-primary" : "bg-primary text-white")}>
        {pending ? "…" : full ? "רשימת המתנה" : "הצטרפות"}
      </button>
      <Msg state={state} />
    </form>
  );
}
