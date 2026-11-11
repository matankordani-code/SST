"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { autosaveReportAction, loadReportAction, type ReportData } from "@/app/sessions/report-actions";

type Save = { state: "idle" } | { state: "saving" } | { state: "saved"; at: string } | { state: "error"; text: string };

const fmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const hhmm = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });

// "דיווח": a button that opens a panel to write the session report. Everything
// saves by itself (a moment after typing stops, and again on close), so the
// therapist can just write and close the window.
export function ReportButton({
  sessionId,
  label = "דיווח",
  variant = "outline",
}: {
  sessionId: string;
  label?: string;
  variant?: "outline" | "primary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "min-h-10 rounded-lg px-3.5 text-sm font-semibold " +
          (variant === "primary" ? "bg-primary text-white hover:bg-primary-dark" : "border border-primary bg-white text-primary hover:bg-sand")
        }
      >
        {label}
      </button>
      {open && <ReportPanel sessionId={sessionId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportPanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [did, setDid] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [nextGoal, setNextGoal] = useState("");
  const [save, setSave] = useState<Save>({ state: "idle" });

  // What was last saved, so closing without changes does nothing.
  const saved = useRef({ did: "", mood: null as number | null, nextGoal: "" });
  const latest = useRef({ did: "", mood: null as number | null, nextGoal: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changedAnything = useRef(false);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    let alive = true;
    loadReportAction(sessionId).then((res) => {
      if (!alive) return;
      if ("error" in res) return setLoadError(res.error);
      setData(res);
      setDid(res.did);
      setMood(res.mood);
      setNextGoal(res.nextGoal);
      saved.current = { did: res.did, mood: res.mood, nextGoal: res.nextGoal };
      latest.current = { ...saved.current };
      if (res.updatedAt) setSave({ state: "saved", at: res.updatedAt });
    });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const v = latest.current;
    const s = saved.current;
    if (v.did === s.did && v.mood === s.mood && v.nextGoal === s.nextGoal) return;
    if (!v.did.trim()) {
      setSave({ state: "error", text: "כדי לשמור, כתוב מה עשינו במפגש." });
      return;
    }
    setSave({ state: "saving" });
    const res = await autosaveReportAction(sessionId, v);
    if (res.ok) {
      saved.current = { ...v };
      changedAnything.current = true;
      setSave({ state: "saved", at: res.savedAt });
    } else setSave({ state: "error", text: res.error });
  }, [sessionId]);

  const schedule = (patch: Partial<typeof latest.current>) => {
    latest.current = { ...latest.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  };

  // Leaving the tab or the page: save what's there.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  async function close() {
    await flush();
    dialog.current?.close();
    onClose();
    if (changedAnything.current) router.refresh();
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        void close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) void close();
      }}
      aria-labelledby="report-title"
      className="m-auto w-[min(640px,calc(100vw-24px))] rounded-2xl border border-line bg-white p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <h2 id="report-title" className="text-lg font-bold">
              {data ? `דיווח · ${data.clientName}` : "דיווח"}
            </h2>
            {data && <span className="text-[13px] text-muted">{fmt.format(new Date(data.startsAt))}</span>}
          </div>
          <button type="button" onClick={close} className="min-h-10 rounded-lg border border-field bg-white px-3.5 text-sm hover:bg-sand">
            סגירה
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {loadError ? (
            <p className="text-alert-ink">{loadError}</p>
          ) : !data ? (
            <p className="text-muted">טוען…</p>
          ) : (
            <>
              {(data.goal || data.prev) && (
                <div className="flex flex-col gap-1.5 rounded-lg bg-sand p-3 text-sm">
                  {data.goal && (
                    <div>
                      <span className="text-muted">מטרת הטיפול: </span>
                      {data.goal}
                    </div>
                  )}
                  {data.prev && (
                    <div>
                      <span className="text-muted">במפגש הקודם ({fmt.format(new Date(data.prev.startsAt))}): </span>
                      <span className="line-clamp-4 whitespace-pre-wrap">{data.prev.did}</span>
                      {data.prev.nextGoal && (
                        <div>
                          <span className="text-muted">מטרה למפגש הזה: </span>
                          {data.prev.nextGoal}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <label className="flex flex-col gap-1 text-[13px] text-muted">
                מה עשינו במפגש *
                <textarea
                  autoFocus
                  rows={6}
                  value={did}
                  onChange={(e) => {
                    setDid(e.target.value);
                    schedule({ did: e.target.value });
                  }}
                  onBlur={() => void flush()}
                  className="min-h-11 w-full rounded-lg border border-field px-3 py-2.5 text-[15px] text-ink"
                  placeholder="מה עבדנו עליו, איך הגיב, מה בלט…"
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted">מצב המטופל במפגש (1 קשה · 5 מצוין)</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="מצב המטופל">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={mood === n}
                      onClick={() => {
                        const v = mood === n ? null : n;
                        setMood(v);
                        schedule({ mood: v });
                      }}
                      className={
                        "min-h-11 min-w-11 rounded-lg text-[15px] tabular-nums " +
                        (mood === n ? "bg-primary font-semibold text-white" : "border border-field bg-white hover:bg-sand")
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1 text-[13px] text-muted">
                מטרה למפגש הבא
                <input
                  value={nextGoal}
                  onChange={(e) => {
                    setNextGoal(e.target.value);
                    schedule({ nextGoal: e.target.value });
                  }}
                  onBlur={() => void flush()}
                  className="min-h-11 w-full rounded-lg border border-field px-3 text-[15px] text-ink"
                />
              </label>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px]">
          <span aria-live="polite" className={save.state === "error" ? "text-alert-ink" : "text-muted"}>
            {save.state === "saving"
              ? "שומר…"
              : save.state === "saved"
                ? `✓ נשמר אוטומטית · ${hhmm.format(new Date(save.at))}`
                : save.state === "error"
                  ? save.text
                  : "נשמר אוטומטית תוך כדי כתיבה ובסגירת החלון"}
          </span>
          {data && (
            <span className="flex gap-3">
              <Link href={`/clients/${data.clientId}`} className="text-primary underline" onClick={() => void flush()}>
                תיק המטופל
              </Link>
              <Link href={`/sessions/${data.sessionId}`} className="text-primary underline" onClick={() => void flush()}>
                ביטול / הזזה
              </Link>
            </span>
          )}
        </div>
      </div>
    </dialog>
  );
}
