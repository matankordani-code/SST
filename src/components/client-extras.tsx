import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { Field, inputClass } from "@/components/field";
import { StatusBadge } from "@/components/status-badge";
import { CARD_PRICE, formatShekel, type PaymentMethod } from "@/lib/clients";
import { cardStatus } from "@/lib/cards";
import type { CardUsage, SessionStatus } from "@/lib/sessions";
import { dayKey, formatDate, formatDateTime } from "@/lib/time";
import { addCardAction } from "@/app/sessions/actions";
import { ReportButton } from "@/components/report-panel";

type Row = {
  id: string;
  starts_at: string;
  status: SessionStatus;
  summary: { did: string; mood: number | null } | null;
};

// Session history + mood trend for one client.
// canReport: the treating therapist gets a "דיווח" button on each past session.
export async function ClientSessions({ clientId, canReport = false }: { clientId: string; canReport?: boolean }) {
  // Sessions that already started (or start within the hour) can be reported.
  const cutoff = new Date().getTime() + 60 * 60 * 1000;
  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select("id, starts_at, status, summary:session_summaries(did, mood)")
    .eq("client_id", clientId)
    .order("starts_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as unknown as Row[];
  const moods = rows
    .filter((r) => r.summary?.mood)
    .slice(0, 10)
    .reverse();

  return (
    <Card
      title="מפגשים"
      actions={
        <Link
          href={`/sessions/new?client=${clientId}`}
          className="flex min-h-11 items-center rounded-lg border border-primary bg-white px-4 text-sm text-primary"
        >
          + קביעת מפגש
        </Link>
      }
    >
      {moods.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">
            מגמת מצב המטופל (1–5, לפי הסיכומים)
          </span>
          <div
            className="flex h-[76px] items-end gap-2 border-b border-line"
            role="img"
            aria-label={`מגמת מצב: ${moods.map((m) => m.summary!.mood).join(", ")}`}
          >
            {moods.map((m) => (
              <div
                key={m.id}
                className="flex w-11 flex-col items-center gap-0.5"
              >
                <span className="text-xs tabular-nums">{m.summary!.mood}</span>
                <div
                  className="w-6 rounded-t bg-primary"
                  style={{ height: `${m.summary!.mood! * 11}px` }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2" aria-hidden="true">
            {moods.map((m) => (
              <span
                key={m.id}
                className="w-11 text-center text-[11px] text-muted"
              >
                {formatDate(dayKey(new Date(m.starts_at))).slice(0, -5)}
              </span>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted">עדיין אין מפגשים.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 border-b border-[#EFEAE0] last:border-0">
              <Link
                href={`/sessions/${r.id}`}
                className="flex min-h-11 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-sand"
              >
                <span className="tabular-nums">
                  {formatDateTime(r.starts_at)}
                </span>
                <StatusBadge status={r.status} />
                {r.summary && (
                  <span className="line-clamp-1 flex-1 text-sm text-muted">
                    {r.summary.did}
                  </span>
                )}
              </Link>
              {canReport && r.status !== "cancelled_ontime" && new Date(r.starts_at).getTime() <= cutoff && (
                <ReportButton sessionId={r.id} label={r.summary ? "עריכה" : "דיווח"} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Punch-card status and manual purchase record.
export async function ClientCards({
  clientId,
  method,
  money = true,
}: {
  clientId: string;
  method: PaymentMethod;
  // Without the income permission: sessions left only, no amounts or card sales.
  money?: boolean;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("punch_card_usage")
    .select("*")
    .eq("client_id", clientId)
    .order("purchased_on");
  const cards = (data ?? []) as CardUsage[];
  const today = dayKey(new Date());
  const status = cardStatus(cards, today);
  const defaultSize = method === "card4" ? 4 : 10;

  if (method === "single" && cards.length === 0) return null;

  return (
    <Card title="כרטיסייה">
      {status ? (
        <p className={status.renew ? "font-semibold text-alert-ink" : ""}>
          {status.text}
          {status.renew &&
            (status.remaining === 0
              ? " · הכרטיסייה נגמרה, צריך לחדש"
              : " · נשאר מפגש אחד, להציע חידוש")}
        </p>
      ) : (
        <p className="text-alert-ink">
          אין כרטיסייה רשומה. מפגשים לא יורדו מכרטיסייה עד שתירשם אחת.
        </p>
      )}

      {cards.length > 0 && (
        <ul className="text-sm text-muted">
          {cards.map((c) => (
            <li key={c.id}>
              כרטיסייה {c.size} · נרכשה {formatDate(c.purchased_on)}
              {money &&
                ` · ${formatShekel(c.amount_paid)}${c.paid_note ? ` · ${c.paid_note}` : ""}`}{" "}
              · נוצלו {c.used}
            </li>
          ))}
        </ul>
      )}

      {money && (
        <details className="rounded-lg bg-sand p-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            רישום כרטיסייה ששולמה
          </summary>
          <form
            action={addCardAction.bind(null, clientId)}
            className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3"
          >
            <Field label="גודל">
              <select
                name="size"
                defaultValue={defaultSize}
                className={inputClass + " bg-white"}
              >
                <option value={4}>
                  4 מפגשים · {formatShekel(CARD_PRICE.card4)}
                </option>
                <option value={10}>
                  10 מפגשים · {formatShekel(CARD_PRICE.card10)}
                </option>
              </select>
            </Field>
            <Field label="תאריך תשלום">
              <input
                name="purchased_on"
                type="date"
                defaultValue={today}
                required
                className={inputClass + " bg-white"}
              />
            </Field>
            <Field label="סכום ששולם (₪)">
              <input
                name="amount_paid"
                type="number"
                min={0}
                defaultValue={
                  defaultSize === 4 ? CARD_PRICE.card4 : CARD_PRICE.card10
                }
                required
                className={inputClass + " bg-white"}
              />
            </Field>
            <Field label="אמצעי תשלום">
              <input
                name="paid_note"
                placeholder="ביט, העברה, מזומן…"
                className={inputClass + " bg-white"}
              />
            </Field>
            <div>
              <button
                type="submit"
                className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white"
              >
                רישום
              </button>
            </div>
          </form>
        </details>
      )}
    </Card>
  );
}
