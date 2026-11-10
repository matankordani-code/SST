import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { cardStatus } from "@/lib/cards";
import type { CardUsage } from "@/lib/sessions";
import { dayKey, formatDateTime } from "@/lib/time";

// "דורש פעולה": sessions not reported for 2 days, and punch cards to renew.
export async function OwnerAlerts() {
  const supabase = await createClient();
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 3600_000).toISOString();

  const [{ data: unreported }, { data: cardClients }, { data: cardsData }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, client:clients(full_name), therapist:therapists(display_name)")
      .eq("status", "planned")
      .lt("starts_at", twoDaysAgo)
      .order("starts_at"),
    supabase
      .from("clients")
      .select("id, full_name")
      .eq("is_active", true)
      .in("payment_method", ["card4", "card10"]),
    supabase.from("punch_card_usage").select("*"),
  ]);

  const late = (unreported ?? []) as unknown as {
    id: string;
    starts_at: string;
    client: { full_name: string } | null;
    therapist: { display_name: string } | null;
  }[];
  const cards = (cardsData ?? []) as CardUsage[];
  const today = dayKey(new Date());
  const renewals = (cardClients ?? [])
    .map((c) => ({ ...c, status: cardStatus(cards.filter((x) => x.client_id === c.id), today) }))
    .filter((c) => !c.status || c.status.renew);

  const empty = late.length === 0 && renewals.length === 0;

  return (
    <Card title="דורש פעולה">
      {empty ? (
        <p className="text-muted">אין כרגע משהו שדורש פעולה.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {late.map((s) => (
            <li key={s.id}>
              <Link href={`/sessions/${s.id}`} className="flex min-h-10 flex-wrap items-center gap-2 rounded-md px-2 hover:bg-sand">
                <span className="rounded-md bg-alert-bg px-2 py-0.5 text-[13px] text-alert-ink">לא דווח</span>
                <span className="font-semibold">{s.client?.full_name}</span>
                <span className="text-muted">
                  {formatDateTime(s.starts_at)} · {s.therapist?.display_name}
                </span>
              </Link>
            </li>
          ))}
          {renewals.map((c) => (
            <li key={c.id}>
              <Link href={`/clients/${c.id}`} className="flex min-h-10 flex-wrap items-center gap-2 rounded-md px-2 hover:bg-sand">
                <span className="rounded-md bg-[#FBF3E4] px-2 py-0.5 text-[13px] text-[#6B4A12]">כרטיסייה</span>
                <span className="font-semibold">{c.full_name}</span>
                <span className="text-muted">
                  {!c.status
                    ? "אין כרטיסייה רשומה"
                    : c.status.remaining === 0
                      ? "הכרטיסייה נגמרה"
                      : "נשאר מפגש אחד · להציע חידוש"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
