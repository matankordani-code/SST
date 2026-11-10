"use client";

import { useActionState, useState } from "react";
import { createDeclarationAction } from "@/app/declarations/actions";

export function NewDeclarationLink({ clientId, kind }: { clientId: string; kind: "health" | "parental" }) {
  const [state, action, pending] = useActionState(createDeclarationAction.bind(null, clientId, kind), undefined);
  const [copied, setCopied] = useState(false);
  const label = kind === "health" ? "הצהרת הבריאות" : "הסכמת ההורה";

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="min-h-10 rounded-lg border border-primary bg-white px-3 text-sm text-primary disabled:opacity-60"
        >
          {pending ? "יוצר…" : "יצירת קישור לחתימה"}
        </button>
      </form>
      {state?.error && <p className="text-sm text-alert-ink">{state.error}</p>}
      {state?.url && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sand p-2 text-sm">
          <span>הקישור מוצג פעם אחת. שלח אותו עכשיו:</span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.url!);
                setCopied(true);
              } catch {}
            }}
            className="min-h-10 rounded-lg border border-primary bg-white px-3 text-primary"
          >
            {copied ? "✓ הועתק" : "העתקה"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`שלום, זה קישור לחתימה על ${label} במרכז SST: ${state.url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center rounded-lg border border-field bg-white px-3"
          >
            שליחה בוואטסאפ
          </a>
        </div>
      )}
    </div>
  );
}
