"use client";

import { useActionState } from "react";
import { inviteToPortalAction } from "@/app/clients/actions";

// Staff open the client's personal area: the payer (or client) signs in with their email.
export function PortalInvite({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(() => inviteToPortalAction(clientId), undefined);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        באזור האישי המשלם (או המטופל) רואה את המפגש הבא, את הכרטיסייה, משלם ומקבל את החשבוניות. בלי שום מידע טיפולי.
      </p>
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg border border-primary bg-white px-4 text-sm text-primary disabled:opacity-60"
        >
          {pending ? "פותח…" : "פתיחת גישה לאזור האישי"}
        </button>
      </form>
      {state?.error && (
        <p role="alert" className="text-sm text-alert-ink">
          {state.error}
        </p>
      )}
      {state?.email && (
        <p role="status" className="rounded-lg bg-sand p-2 text-sm">
          הגישה נפתחה. אפשר להיכנס במערכת עם המייל <bdi dir="ltr">{state.email}</bdi> ולקבל קוד כניסה.
        </p>
      )}
    </div>
  );
}
