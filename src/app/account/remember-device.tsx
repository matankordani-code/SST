"use client";

import { useActionState } from "react";
import { rememberDeviceAction } from "./device-actions";

export function RememberDevice({ remembered }: { remembered: boolean }) {
  const [state, action, pending] = useActionState(() => rememberDeviceAction(), undefined);

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-[10px] bg-primary px-5 text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "שומר…" : remembered ? "אישור המכשיר הזה מחדש" : "זכור את המכשיר הזה"}
        </button>
      </form>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-lg bg-sand px-3 py-2 text-sm">
          {state.ok}
        </p>
      )}
    </div>
  );
}
