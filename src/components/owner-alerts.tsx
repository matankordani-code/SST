import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { SendLinkButton } from "@/components/send-link-button";
import { cardStatus } from "@/lib/cards";
import { PAYMENT_LABEL, formatShekel, type PaymentMethod } from "@/lib/clients";
import type { CardUsage } from "@/lib/sessions";
import { dayKey, formatDate, formatDateTime, formatMonth } from "@/lib/time";

// "ראשי" · two columns, as in the prototype:
//   דורש פעולה — unreported sessions (2+ days), cards to renew (with a button
//                that emails a renewal link), invoices waiting to close a month.
//   פעילות אחרונה — what happened in the last two weeks, newest first.
export async function OwnerAlerts() {
  const supabase = await createClient();
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 3600_000).toISOString();
  const since = new Date(now.getTime() - 14 * 24 * 3600_000);
  const sinceIso = since.toISOString();

  const [
    { data: unreported },
    { data: cardClients },
    { data: cardsData },
    { data: openReqs },
    { data: invoiced },
    { data: newClients },
    { data: approvals },
    { data: pays },
    { data: signed },
    { data: regs },
  ] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, client:clients(full_name), therapist:therapists(display_name)")
      .eq("status", "planned")
      .lt("starts_at", twoDaysAgo)
      .order("starts_at"),
    supabase.from("clients").select("id, full_name, payment_method").eq("is_active", true).in("payment_method", ["card4", "card10"]),
    supabase.from("punch_card_usage").select("*"),
    supabase.from("payment_requests").select("client_id, created_at").eq("status", "open"),
    supabase.from("settlements").select("therapist_id, month, invoice_amount, therapist:therapists(display_name)").eq("status", "invoiced"),
    supabase.from("clients").select("full_name, created_at, therapist:therapists(display_name)").gte("created_at", sinceIso),
    supabase
      .from("settlements")
      .select("month, approved_at, invoice_uploaded_at, therapist:therapists(display_name)")
      .or(`approved_at.gte.${sinceIso},invoice_uploaded_at.gte.${sinceIso}`),
    supabase.from("payments").select("amount, paid_at, kind, client:clients(full_name)").gte("paid_at", sinceIso),
    supabase.from("declarations").select("kind, signed_at, client:clients(full_name)").eq("status", "signed").gte("signed_at", sinceIso),
    supabase
      .from("registrations")
      .select("status, created_at, on_date, member:members(full_name), training:trainings(name)")
      .gte("created_at", sinceIso),
  ]);

  // ---------- דורש פעולה ----------
  const late = (unreported ?? []) as unknown as {
    id: string;
    starts_at: string;
    client: { full_name: string } | null;
    therapist: { display_name: string } | null;
  }[];
  const cards = (cardsData ?? []) as CardUsage[];
  const today = dayKey(now);
  const requested = new Set((openReqs ?? []).map((r) => r.client_id as string));
  const renewals = ((cardClients ?? []) as { id: string; full_name: string; payment_method: PaymentMethod }[])
    .map((c) => ({ ...c, status: cardStatus(cards.filter((x) => x.client_id === c.id), today) }))
    .filter((c) => !c.status || c.status.renew);
  const toClose = (invoiced ?? []) as unknown as {
    therapist_id: string;
    month: string;
    invoice_amount: number | null;
    therapist: { display_name: string } | null;
  }[];
  const nothing = late.length === 0 && renewals.length === 0 && toClose.length === 0;

  // ---------- פעילות אחרונה ----------
  type Ev = { at: string; text: string };
  const events: Ev[] = [];
  for (const c of (newClients ?? []) as unknown as { full_name: string; created_at: string; therapist: { display_name: string } | null }[]) {
    events.push({ at: c.created_at, text: `מטופל חדש: ${c.full_name}${c.therapist ? ` · אצל ${c.therapist.display_name}` : ""}` });
  }
  for (const s of (approvals ?? []) as unknown as {
    month: string;
    approved_at: string | null;
    invoice_uploaded_at: string | null;
    therapist: { display_name: string } | null;
  }[]) {
    const name = s.therapist?.display_name ?? "";
    const m = formatMonth(s.month.slice(0, 7));
    if (s.approved_at && s.approved_at >= sinceIso) events.push({ at: s.approved_at, text: `${name} אישר/ה את דיווח ${m}` });
    if (s.invoice_uploaded_at && s.invoice_uploaded_at >= sinceIso)
      events.push({ at: s.invoice_uploaded_at, text: `${name} העלה/תה חשבונית ל${m}` });
  }
  for (const p of (pays ?? []) as unknown as { amount: number; paid_at: string; kind: PaymentMethod; client: { full_name: string } | null }[]) {
    events.push({ at: p.paid_at, text: `התקבל תשלום: ${PAYMENT_LABEL[p.kind]} · ${p.client?.full_name ?? ""} · ${formatShekel(p.amount)}` });
  }
  for (const d of (signed ?? []) as unknown as { kind: string; signed_at: string; client: { full_name: string } | null }[]) {
    events.push({ at: d.signed_at, text: `נחתמה ${d.kind === "parental" ? "הסכמת הורה" : "הצהרת בריאות"}: ${d.client?.full_name ?? ""}` });
  }
  for (const r of (regs ?? []) as unknown as {
    status: string;
    created_at: string;
    on_date: string;
    member: { full_name: string } | null;
    training: { name: string } | null;
  }[]) {
    const verb = r.status === "cancelled" ? "ביטל/ה את" : r.status === "waitlist" ? "נכנס/ה להמתנה ל" : "נרשם/ה ל";
    events.push({ at: r.created_at, text: `${r.member?.full_name ?? ""} ${verb}"${r.training?.name ?? ""}" · ${formatDate(r.on_date)}` });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  const recent = events.slice(0, 8);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card
        title={
          <span className="flex items-center gap-2">
            דורש פעולה
            {!nothing && (
              <span className="rounded-full bg-alert-bg px-2 py-0.5 text-[13px] font-semibold text-alert-ink">
                {late.length + renewals.length + toClose.length}
              </span>
            )}
          </span>
        }
      >
        {nothing ? (
          <p className="text-muted">אין כרגע משהו שדורש פעולה.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEAE0] text-sm">
            {toClose.map((s) => (
              <li key={`${s.therapist_id}-${s.month}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Badge tone="info">חשבונית</Badge> <strong>{s.therapist?.display_name}</strong> העלה/תה חשבונית ל
                  {formatMonth(s.month.slice(0, 7))}
                  {s.invoice_amount ? ` · ${formatShekel(s.invoice_amount)}` : ""}
                </span>
                <Link
                  href={`/month?m=${s.month.slice(0, 7)}&t=${s.therapist_id}`}
                  className="min-h-9 rounded-lg border border-primary px-3 py-1.5 text-[13px] font-semibold text-primary hover:bg-sand"
                >
                  לסגירת החודש
                </Link>
              </li>
            ))}
            {renewals.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/clients/${c.id}`} className="hover:underline">
                  <Badge tone="warn">כרטיסייה</Badge> <strong>{c.full_name}</strong>{" "}
                  <span className="text-muted">
                    {!c.status ? "אין כרטיסייה רשומה" : c.status.remaining === 0 ? "הכרטיסייה נגמרה" : "נשאר מפגש אחד"}
                  </span>
                </Link>
                {requested.has(c.id) ? (
                  <span className="text-[13px] text-muted">נשלחה דרישה · ממתין לתשלום</span>
                ) : (
                  <SendLinkButton clientId={c.id} kind={c.payment_method} label={`הצעת חידוש · ${PAYMENT_LABEL[c.payment_method]}`} />
                )}
              </li>
            ))}
            {late.map((s) => (
              <li key={s.id} className="py-2">
                <Link href={`/sessions/${s.id}`} className="flex flex-wrap items-center gap-2 hover:underline">
                  <Badge tone="alert">לא דווח</Badge>
                  <strong>{s.client?.full_name}</strong>
                  <span className="text-muted">
                    {formatDateTime(s.starts_at)} · {s.therapist?.display_name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="פעילות אחרונה">
        {recent.length === 0 ? (
          <p className="text-muted">אין פעילות בשבועיים האחרונים.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEAE0] text-sm">
            {recent.map((e, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2">
                <span>{e.text}</span>
                <span className="text-[12px] text-muted">{ago(new Date(e.at), now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Badge({ tone, children }: { tone: "alert" | "warn" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "alert" ? "bg-alert-bg text-alert-ink" : tone === "warn" ? "bg-[#FBF3E4] text-[#6B4A12]" : "bg-[#E4EFF2] text-[#15505F]";
  return <span className={`rounded-md px-2 py-0.5 text-[12px] ${cls}`}>{children}</span>;
}

function ago(d: Date, now: Date) {
  const min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 2) return "עכשיו";
  if (min < 60) return `לפני ${min} דקות`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? "לפני שעה" : `לפני ${h} שעות`;
  const days = Math.round(h / 24);
  return days === 1 ? "אתמול" : `לפני ${days} ימים`;
}
