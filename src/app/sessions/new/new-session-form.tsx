"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createSessionAction } from "@/app/sessions/actions";
import { Field, inputClass } from "@/components/field";

export function NewSessionForm({
  clients,
  defaultClientId,
  defaultDate,
}: {
  clients: { id: string; label: string }[];
  defaultClientId?: string;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(createSessionAction, undefined);
  const [repeat, setRepeat] = useState(false);

  if (clients.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-white p-5">
        <p className="text-muted">
          אין עדיין מטופלים. קודם מוסיפים מטופל, ואז קובעים לו מפגש.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-white p-5">
      <h2 className="text-xl font-bold">קביעת מפגש</h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Field label="מטופל *">
          <select
            name="client_id"
            required
            defaultValue={defaultClientId ?? ""}
            className={inputClass + " bg-white"}
          >
            <option value="" disabled>
              בחר מטופל
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תאריך *">
          <input name="date" type="date" required defaultValue={defaultDate} className={inputClass} />
        </Field>
        <Field label="שעה *">
          <input name="time" type="time" required step={300} className={inputClass} />
        </Field>
        <Field label="משך (דקות)">
          <input name="duration_min" type="number" min={15} max={240} defaultValue={60} className={inputClass} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg bg-sand p-3">
        <legend className="sr-only">מפגש קבוע</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
          <input
            type="checkbox"
            name="repeat"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
            className="size-5 accent-primary"
          />
          מפגש קבוע, כל שבוע באותו יום ושעה
        </label>
        {repeat && (
          <Field label="כמה מפגשים לקבוע מראש">
            <input
              name="count"
              type="number"
              min={2}
              max={52}
              defaultValue={10}
              className={inputClass + " max-w-40 bg-white"}
            />
          </Field>
        )}
      </fieldset>

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
          {pending ? "קובע…" : "קביעת מפגש"}
        </button>
        <Link href="/calendar" className="flex min-h-11 items-center rounded-lg border border-field bg-white px-5 text-[15px]">
          ביטול
        </Link>
      </div>
    </form>
  );
}
