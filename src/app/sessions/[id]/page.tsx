import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Field, inputClass } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { SESSION_SELECT, STATUS_LABEL, type SessionRow, type SessionStatus } from "@/lib/sessions";
import { formatShekel } from "@/lib/clients";
import { dayKey, formatDateTime, timeOf } from "@/lib/time";
import {
  deleteSessionAction,
  moveSessionAction,
  reportAction,
  saveSummaryAction,
} from "@/app/sessions/actions";

export default function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

type Summary = { did: string; mood: number | null; next_goal: string | null };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("owner", "therapist");
  const supabase = await createClient();

  const [{ data: sData }, { data: summary }, { data: myId }] = await Promise.all([
    supabase.from("sessions").select(SESSION_SELECT).eq("id", id).maybeSingle(),
    supabase.from("session_summaries").select("did, mood, next_goal").eq("session_id", id).maybeSingle<Summary>(),
    supabase.rpc("my_therapist_id"),
  ]);
  if (!sData) notFound();
  const s = sData as unknown as SessionRow;

  const [{ data: clientRow }, { data: prev }] = await Promise.all([
    supabase.from("clients").select("therapist_id").eq("id", s.client_id).maybeSingle(),
    // The previous held session of this client, with its summary (if visible).
    supabase
      .from("sessions")
      .select("starts_at, summary:session_summaries(did, mood, next_goal)")
      .eq("client_id", s.client_id)
      .eq("status", "held")
      .lt("starts_at", s.starts_at)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const treating = clientRow?.therapist_id === myId;
  const prevSummary = (prev as unknown as { starts_at: string; summary: Summary | null } | null) ?? null;
  const start = new Date(s.starts_at);

  return (
    <AppShell profile={profile} active="/calendar">
      <Card
        title={
          <>
            מפגש ·{" "}
            <Link href={`/clients/${s.client_id}`} className="text-primary underline">
              {s.client?.full_name}
            </Link>
          </>
        }
        actions={<StatusBadge status={s.status} />}
      >
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 text-sm">
          <Item label="מועד">{formatDateTime(s.starts_at)}</Item>
          <Item label="משך">{s.duration_min} דק׳</Item>
          <Item label="מטפל">{s.therapist?.display_name ?? "—"}</Item>
          <Item label="מחיר">{formatShekel(s.price)}</Item>
          {s.series_id && <Item label="סוג">מפגש קבוע</Item>}
        </dl>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-muted">דיווח</span>
          <div className="flex flex-wrap gap-2">
            {(["held", "cancelled_ontime", "cancelled_late", "planned"] as SessionStatus[]).map((st) => (
              <form key={st} action={reportAction.bind(null, s.id, st)}>
                <button
                  type="submit"
                  aria-pressed={s.status === st}
                  className={
                    "min-h-11 rounded-lg px-4 text-sm " +
                    (s.status === st
                      ? "bg-primary font-semibold text-white"
                      : "border border-field bg-white hover:bg-sand")
                  }
                >
                  {st === "planned" ? "החזרה למתוכנן" : STATUS_LABEL[st]}
                </button>
              </form>
            ))}
          </div>
          <p className="text-[13px] text-muted">
            ביטול בזמן: עד 24 שעות לפני, ללא חיוב. ביטול מאוחר: מחויב כמו מפגש שהתקיים ויורד מהכרטיסייה.
          </p>
        </div>
      </Card>

      {prevSummary?.summary && (
        <Card title={`במפגש הקודם · ${formatDateTime(prevSummary.starts_at)}`}>
          <p className="whitespace-pre-wrap text-sm">{prevSummary.summary.did}</p>
          {prevSummary.summary.next_goal && (
            <p className="text-sm">
              <span className="text-muted">מטרה למפגש הזה: </span>
              {prevSummary.summary.next_goal}
            </p>
          )}
        </Card>
      )}

      {treating ? (
        <Card title="סיכום מפגש">
          <form action={saveSummaryAction.bind(null, s.id)} className="flex flex-col gap-3">
            <Field label="מה עשינו *">
              <textarea
                name="did"
                rows={4}
                required
                defaultValue={summary?.did ?? ""}
                className={inputClass + " py-2.5"}
              />
            </Field>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <Field label="מצב המטופל (1–5)">
                <select name="mood" defaultValue={summary?.mood ?? ""} className={inputClass + " bg-white"}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="מטרה למפגש הבא">
                <input name="next_goal" defaultValue={summary?.next_goal ?? ""} className={inputClass} />
              </Field>
            </div>
            <div>
              <button
                type="submit"
                className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark"
              >
                {s.status === "planned" ? "התקיים + שמירת סיכום" : "שמירת סיכום"}
              </button>
            </div>
          </form>
        </Card>
      ) : (
        summary && (
          <Card title="סיכום מפגש">
            <p className="whitespace-pre-wrap text-sm">{summary.did}</p>
          </Card>
        )
      )}

      {s.status === "planned" && (
        <Card title="הזזה או מחיקה">
          <form action={moveSessionAction.bind(null, s.id)} className="flex flex-wrap items-end gap-3">
            <Field label="תאריך חדש">
              <input name="date" type="date" required defaultValue={dayKey(start)} className={inputClass} />
            </Field>
            <Field label="שעה חדשה">
              <input name="time" type="time" required step={300} defaultValue={timeOf(start)} className={inputClass} />
            </Field>
            <button type="submit" className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white">
              הזזת המפגש
            </button>
          </form>
          <div className="flex flex-wrap gap-2 border-t border-[#EFEAE0] pt-3">
            <form action={deleteSessionAction.bind(null, s.id, s.series_id, s.starts_at, "one")}>
              <button className="min-h-11 rounded-lg border border-[#C9A58A] bg-white px-4 text-sm text-alert-ink">
                מחיקת המפגש
              </button>
            </form>
            {s.series_id && (
              <form action={deleteSessionAction.bind(null, s.id, s.series_id, s.starts_at, "series")}>
                <button className="min-h-11 rounded-lg border border-[#C9A58A] bg-white px-4 text-sm text-alert-ink">
                  מחיקת המפגש הזה וכל הקבועים שאחריו
                </button>
              </form>
            )}
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
