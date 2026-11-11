"use client";

import { useOptimistic, useTransition } from "react";
import { toggleGoalAction } from "@/app/club/progress-actions";

export function GoalToggle({ id, text, done }: { id: string; text: string; done: boolean }) {
  const [, start] = useTransition();
  const [checked, setChecked] = useOptimistic(done);
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          const next = e.target.checked;
          start(async () => {
            setChecked(next);
            await toggleGoalAction(id, next);
          });
        }}
        className="size-5 accent-primary"
      />
      <span className={checked ? "text-muted line-through" : ""}>{text}</span>
    </label>
  );
}
