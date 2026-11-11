"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { createSessionAction, moveSessionAction } from "@/app/sessions/actions";
import { STATUS_LABEL, type SessionStatus } from "@/lib/sessions";

export type GridSession = {
  id: string;
  day: string; // "YYYY-MM-DD" (Israel)
  time: string; // "HH:MM"
  client: string;
  therapist: string;
  status: SessionStatus;
  past: boolean;
};

type Mode = { kind: "idle" } | { kind: "book"; day: string; time: string } | { kind: "move"; session: GridSession } | { kind: "menu"; id: string };

const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

// The therapist's week as a grid, as in the prototype:
//   "+" on a free hour → book (one-off or weekly);
//   tap a session → open it, or move it: then tap a free hour.
export function WeekGrid({
  days,
  today,
  sessions,
  clients,
  showTherapist,
}: {
  days: string[];
  today: string;
  sessions: GridSession[];
  clients: { id: string; label: string }[];
  showTherapist: boolean;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [moving, startMove] = useTransition();
  const [bookState, bookAction, booking] = useActionState(createSessionAction, undefined);

  const hours = (() => {
    const used = sessions.map((s) => Number(s.time.slice(0, 2)));
    const from = Math.min(7, ...used);
    const to = Math.max(20, ...used);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  })();
  const at = (day: string, h: number) => sessions.filter((s) => s.day === day && Number(s.time.slice(0, 2)) === h);
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

  function moveTo(day: string, h: number) {
    if (mode.kind !== "move") return;
    const fd = new FormData();
    fd.set("date", day);
    // Keep the minutes (e.g. 15:30 moves to 17:30).
    fd.set("time", `${String(h).padStart(2, "0")}:${mode.session.time.slice(3, 5)}`);
    const id = mode.session.id;
    startMove(async () => {
      await moveSessionAction(id, fd);
      setMode({ kind: "idle" });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted">
        לחץ על &quot;+&quot; בשעה פנויה כדי לקבוע תור. כדי להזיז מפגש, לחץ עליו, בחר &quot;הזזה&quot; ואז שעה חדשה. המטופל
        מקבל הודעה במייל, ותזכורת יום לפני ב-20:00.
      </p>

      {mode.kind === "move" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#B07A1E] bg-[#FBF3E4] px-4 py-2 text-sm text-[#6B4A12]">
          <span>
            מזיזים את המפגש של <strong>{mode.session.client}</strong> ({mode.session.time}). בחר שעה פנויה חדשה.
            {moving ? " שומר…" : ""}
          </span>
          <button type="button" onClick={() => setMode({ kind: "idle" })} className="min-h-9 rounded-lg border border-[#B07A1E] bg-white px-3">
            ביטול ההזזה
          </button>
        </div>
      )}

      {mode.kind === "book" && (
        <form action={bookAction} className="flex flex-col gap-3 rounded-lg border border-primary bg-[#EEF5F7] p-4">
          <p className="font-semibold">
            קביעת תור · {DAY_SHORT[new Date(`${mode.day}T12:00:00Z`).getUTCDay()]} {mode.day.slice(8, 10)}.{mode.day.slice(5, 7)}
          </p>
          <input type="hidden" name="date" value={mode.day} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              מטופל
              <select name="client_id" required defaultValue="" className="min-h-11 rounded-lg border border-field bg-white px-2 text-[15px] text-ink">
                <option value="" disabled>
                  בחר מטופל
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              שעה
              <input type="time" name="time" required defaultValue={mode.time} step={300} className="min-h-11 rounded-lg border border-field bg-white px-2 text-[15px] text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              משך (דקות)
              <input type="number" name="duration_min" min={15} max={240} defaultValue={60} className="min-h-11 rounded-lg border border-field bg-white px-2 text-[15px] text-ink" />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="repeat" className="size-5 accent-primary" />
            מפגש קבוע כל שבוע, במשך
            <input type="number" name="count" min={2} max={52} defaultValue={4} aria-label="מספר שבועות" className="min-h-9 w-16 rounded-lg border border-field bg-white px-2" />
            שבועות
          </label>
          {bookState?.error && (
            <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
              {bookState.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={booking} className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              {booking ? "קובע…" : "קביעה"}
            </button>
            <button type="button" onClick={() => setMode({ kind: "idle" })} className="min-h-11 rounded-lg border border-field bg-white px-5">
              ביטול
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="w-14 border-b border-line bg-sand p-1" />
              {days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className={"border-b border-s border-line p-2 text-center font-semibold " + (d === today ? "bg-[#EEF5F7] text-primary" : "bg-sand")}
                >
                  {DAY_SHORT[new Date(`${d}T12:00:00Z`).getUTCDay()]} {Number(d.slice(8, 10))}.{Number(d.slice(5, 7))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <th scope="row" className="border-b border-line bg-sand p-1 text-center align-top font-normal tabular-nums text-muted" dir="ltr">
                  {pad(h)}
                </th>
                {days.map((d) => {
                  const here = at(d, h);
                  const free = here.length === 0;
                  return (
                    <td key={d} className={"h-12 border-b border-s border-line p-1 align-top " + (d === today ? "bg-[#F6FAFB]" : "bg-white")}>
                      <div className="flex flex-col gap-1">
                        {here.map((s) => (
                          <div key={s.id} className="relative">
                            <button
                              type="button"
                              onClick={() => setMode(mode.kind === "menu" && mode.id === s.id ? { kind: "idle" } : { kind: "menu", id: s.id })}
                              className={
                                "w-full rounded-md border px-1.5 py-1 text-start leading-tight " +
                                (s.status === "planned"
                                  ? s.past
                                    ? "border-dashed border-[#B07A1E] bg-[#FBF3E4] text-[#6B4A12]"
                                    : "border-[#9CC3CF] bg-[#E3F0F4] text-[#15505F]"
                                  : s.status === "held"
                                    ? "border-[#B9D7BE] bg-[#E4F1E6] text-[#22582C]"
                                    : "border-[#D9D1C2] bg-[#F3EFE7] text-[#4A555A] line-through")
                              }
                              aria-label={`${s.time} ${s.client}, ${STATUS_LABEL[s.status]}`}
                            >
                              <span className="block font-semibold" dir="ltr">
                                {s.time}
                              </span>
                              <span className="block truncate">{s.client}</span>
                              {showTherapist && <span className="block truncate text-[11px] opacity-80">{s.therapist}</span>}
                            </button>
                            {mode.kind === "menu" && mode.id === s.id && (
                              <div className="absolute inset-x-0 top-full z-10 mt-1 flex flex-col gap-1 rounded-lg border border-line bg-white p-1 shadow-md">
                                <Link href={`/sessions/${s.id}`} className="rounded-md px-2 py-1.5 hover:bg-sand">
                                  פתיחת המפגש
                                </Link>
                                {s.status === "planned" && !s.past && (
                                  <button type="button" onClick={() => setMode({ kind: "move", session: s })} className="rounded-md px-2 py-1.5 text-start hover:bg-sand">
                                    הזזה
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {free &&
                          (mode.kind === "move" ? (
                            <button
                              type="button"
                              disabled={moving}
                              onClick={() => moveTo(d, h)}
                              className="min-h-9 rounded-md border border-dashed border-[#B07A1E] text-[#6B4A12] hover:bg-[#FBF3E4] disabled:opacity-50"
                            >
                              העבר לכאן
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setMode({ kind: "book", day: d, time: pad(h) })}
                              aria-label={`קביעת תור ב-${pad(h)}`}
                              className="min-h-9 rounded-md text-lg leading-none text-[#B8AE9C] hover:bg-sand hover:text-primary"
                            >
                              +
                            </button>
                          ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted">
        קו מקווקו = עבר וממתין לדיווח · קו חוצה = בוטל · ירוק = התקיים
      </p>
    </div>
  );
}
