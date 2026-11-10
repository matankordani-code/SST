"use client";

import { useState, useTransition } from "react";
import { LEVEL_LABEL, BINARY_LABEL, type Level, type PermKey } from "@/lib/permissions";
import { setRolePermAction, setUserPermAction } from "./actions";

// One cell of the board: a level picker that saves on change.
export function PermCell({
  kind,
  target,
  perm,
  scoped,
  value,
  inherited,
  label,
}: {
  kind: "user" | "role";
  // user id or role name
  target: string;
  perm: PermKey;
  scoped: boolean;
  // user: the exception, or null when following the role
  value: Level | null;
  // user: the role's default, shown in the "by role" option
  inherited?: Level;
  // for screen readers, e.g. "דנה · יומן"
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>(value === null ? "" : String(value));

  const text = (l: Level) => (scoped ? LEVEL_LABEL[l] : BINARY_LABEL[l === 0 ? 0 : 2]);
  const levels: Level[] = scoped ? [0, 1, 2] : [0, 2];
  const isException = kind === "user" && current !== "";

  function onChange(next: string) {
    const prev = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const level = next === "" ? null : (Number(next) as Level);
      const res =
        kind === "user"
          ? await setUserPermAction(target, perm, level)
          : await setRolePermAction(target, perm, level ?? 0);
      if (res.error) {
        setCurrent(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={label}
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className={
          "min-h-10 w-full min-w-[104px] rounded-lg border px-2 text-sm disabled:opacity-60 " +
          (isException ? "border-[#B07A1E] bg-[#FBF3E4] font-semibold text-[#6B4A12]" : "border-field bg-white text-ink")
        }
      >
        {kind === "user" && <option value="">{`לפי התפקיד · ${text(inherited ?? 0)}`}</option>}
        {levels.map((l) => (
          <option key={l} value={String(l)}>
            {text(l)}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-xs text-alert-ink">
          {error}
        </span>
      )}
    </div>
  );
}
