"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { signDeclarationAction } from "@/app/declarations/actions";
import { Field, inputClass } from "@/components/field";

export function SignForm({ id, token, kind }: { id: string; token: string; kind: "health" | "parental" }) {
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
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <Field label={kind === "parental" ? "שם ההורה המלא *" : "שם מלא *"}>
        <input name="signer" required className={inputClass} autoComplete="name" />
      </Field>
      <Field label="מידע רפואי שחשוב שנדע (מגבלות, תרופות, פציעות). אם אין, השאר/י ריק">
        <textarea name="notes" rows={3} className={inputClass + " py-2.5"} />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input type="checkbox" name="agree" className="size-5 accent-primary" />
        קראתי את הנוסח ואני מאשר/ת
      </label>
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
    </form>
  );
}
