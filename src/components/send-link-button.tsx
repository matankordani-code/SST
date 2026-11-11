"use client";

import { useActionState } from "react";
import { sendPaymentLinkAction } from "@/app/payments/actions";

// An alert's action: creates a Morning link and emails it to the payer.
export function SendLinkButton({ clientId, kind, label }: { clientId: string; kind: string; label: string }) {
  const [state, action, pending] = useActionState(() => sendPaymentLinkAction(clientId, kind), undefined);

  if (state?.sent) {
    return (
      <span role="status" className="text-[13px] text-[#2E6B3A]">
        ✓ {state.sent}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="min-h-9 rounded-lg border border-primary bg-white px-3 text-[13px] font-semibold text-primary hover:bg-sand disabled:opacity-60"
        >
          {pending ? "שולח…" : label}
        </button>
      </form>
      {state?.error && (
        <span role="alert" className="text-[12px] text-alert-ink">
          {state.error}
        </span>
      )}
    </span>
  );
}
