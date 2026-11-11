"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { signDeclarationAction } from "@/app/declarations/actions";
import { Field, inputClass } from "@/components/field";

export type Prefill = {
  client_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  payer_name?: string | null;
  payer_phone?: string | null;
  payer_email?: string | null;
};

export function SignForm({
  id,
  token,
  kind,
  form,
  prefill,
  text,
}: {
  id: string;
  token: string;
  kind: "health" | "parental";
  // Health declaration form: adult (18+) or a parent for their child. null = older links.
  form: "adult" | "minor" | null;
  prefill: Prefill;
  text: string;
}) {
  const [state, action, pending] = useActionState(signDeclarationAction.bind(null, id, token), undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signature, setSignature] = useState("");

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#12303B";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * e.currentTarget.width) / r.width, y: ((e.clientY - r.top) * e.currentTarget.height) / r.height };
  };

  if (state?.ok) {
    return <p className="rounded-lg bg-[#E4F1E6] p-4 text-lg text-[#22582C]">נחתם בהצלחה. תודה!</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {form && <input type="hidden" name="form" value={form} />}

      {form === "adult" && (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <legend className="px-1 text-lg font-bold">פרטי המשתתף/ת</legend>
          <div className={grid}>
            <Field label="שם פרטי *">
              <input name="first_name" required defaultValue={first(prefill.client_name)} autoComplete="given-name" className={inputClass} />
            </Field>
            <Field label="שם משפחה *">
              <input name="last_name" required defaultValue={rest(prefill.client_name)} autoComplete="family-name" className={inputClass} />
            </Field>
            <Field label="ת״ז *">
              <input name="id_number" required inputMode="numeric" pattern={ID_PATTERN} maxLength={9} className={inputClass} />
            </Field>
            <Field label="תאריך לידה *">
              <input name="birth_date" type="date" required className={inputClass} />
            </Field>
            <Field label="עיר">
              <input name="city" autoComplete="address-level2" className={inputClass} />
            </Field>
            <Field label="טלפון נייד *">
              <input name="phone" type="tel" required defaultValue={prefill.client_phone ?? ""} autoComplete="tel" className={inputClass} dir="ltr" />
            </Field>
            <Field label="אימייל">
              <input name="email" type="email" defaultValue={prefill.client_email ?? ""} autoComplete="email" className={inputClass} dir="ltr" />
            </Field>
          </div>
        </fieldset>
      )}

      {form === "minor" && (
        <>
          <fieldset className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <legend className="px-1 text-lg font-bold">פרטי הילד/ה</legend>
            <div className={grid}>
              <Field label="שם פרטי *">
                <input name="child_first" required defaultValue={first(prefill.client_name)} className={inputClass} />
              </Field>
              <Field label="שם משפחה *">
                <input name="child_last" required defaultValue={rest(prefill.client_name)} className={inputClass} />
              </Field>
              <Field label="ת״ז">
                <input name="child_id" inputMode="numeric" pattern={ID_PATTERN} maxLength={9} className={inputClass} />
              </Field>
              <Field label="תאריך לידה *">
                <input name="child_birth" type="date" required className={inputClass} />
              </Field>
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <legend className="px-1 text-lg font-bold">פרטי ההורה החותם/ת</legend>
            <div className={grid}>
              <Field label="שם מלא *">
                <input name="parent_name" required defaultValue={prefill.payer_name ?? ""} autoComplete="name" className={inputClass} />
              </Field>
              <Field label="ת״ז *">
                <input name="parent_id" required inputMode="numeric" pattern={ID_PATTERN} maxLength={9} className={inputClass} />
              </Field>
              <Field label="טלפון נייד *">
                <input name="phone" type="tel" required defaultValue={prefill.payer_phone ?? prefill.client_phone ?? ""} autoComplete="tel" className={inputClass} dir="ltr" />
              </Field>
              <Field label="אימייל">
                <input name="email" type="email" defaultValue={prefill.payer_email ?? prefill.client_email ?? ""} autoComplete="email" className={inputClass} dir="ltr" />
              </Field>
              <Field label="עיר">
                <input name="city" autoComplete="address-level2" className={inputClass} />
              </Field>
            </div>
          </fieldset>
        </>
      )}

      <article className="whitespace-pre-wrap rounded-xl border border-line bg-white p-5 leading-relaxed">{text}</article>

      <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      {!form && (
        <Field label={kind === "parental" ? "שם ההורה המלא *" : "שם מלא *"}>
          <input name="signer" required className={inputClass} autoComplete="name" />
        </Field>
      )}
      <Field
        label={
          form === "minor"
            ? "מידע רפואי על הילד/ה שחשוב שנדע (מגבלות, תרופות, פציעות, רגישויות). אם אין, השאר/י ריק"
            : "מידע רפואי שחשוב שנדע (מגבלות, תרופות, פציעות, רגישויות). אם אין, השאר/י ריק"
        }
      >
        <textarea name="notes" rows={3} className={inputClass + " py-2.5"} />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-start gap-2">
        <input type="checkbox" name="agree" className="mt-0.5 size-5 shrink-0 accent-primary" />
        {form ? "קראתי את מסמך זה במלואו, הבנתי אותו ואני מסכים/ה לתוכנו *" : "קראתי את הנוסח ואני מאשר/ת"}
      </label>
      {form && (
        <label className="flex min-h-11 cursor-pointer items-start gap-2">
          <input type="checkbox" name="marketing" className="mt-0.5 size-5 shrink-0 accent-primary" />
          אני מאשר/ת קבלת חומר פרסומי מהמועדון במייל ובהודעות SMS (לא חובה)
        </label>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-muted">חתימה (באצבע או בעכבר)</span>
        <canvas
          ref={canvas}
          width={600}
          height={180}
          aria-label="אזור חתימה"
          className="w-full touch-none rounded-lg border border-field bg-sand"
          onPointerDown={(e) => {
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d")!;
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }}
          onPointerUp={(e) => {
            drawing.current = false;
            setSignature(e.currentTarget.toDataURL("image/png"));
          }}
        />
        <button
          type="button"
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setSignature("");
          }}
          className="self-start text-sm text-primary underline"
        >
          ניקוי החתימה
        </button>
      </div>
      <input type="hidden" name="signature" value={signature} />
      {state?.error && (
        <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-lg bg-primary text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
      >
        {pending ? "שולח…" : "חתימה ושליחה"}
      </button>
      </div>
    </form>
  );
}

const grid = "grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3";
const ID_PATTERN = "[0-9]{5,9}";
const first = (name?: string | null) => (name ?? "").trim().split(" ")[0] ?? "";
const rest = (name?: string | null) => (name ?? "").trim().split(" ").slice(1).join(" ");
