import { Suspense } from "react";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Th } from "@/components/my-clients";
import { OwnerAlerts } from "@/components/owner-alerts";
import { IncomeKpis } from "@/components/income-kpis";
import { OwnerOverview } from "@/components/owner-overview";
import { ClubSummary } from "@/components/club-summary";
import { CLIENT_SELECT, PAYMENT_LABEL, formatShekel, type ClientRow } from "@/lib/clients";
import { cardStatus } from "@/lib/cards";
import type { CardUsage } from "@/lib/sessions";
import { dayKey, formatDate, israelToUtc, monthOf, addMonths } from "@/lib/time";
import { requestAccessAction, transferClientAction } from "@/app/clients/actions";

export default function OwnerPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

type FileStatus = { client_id: string; shared_with_owner: boolean; owner_requested_at: string | null };

async function Content() {
  const profile = await requirePerm("clients", 2);
  const supabase = await createClient();

  const now = new Date();
  const month = monthOf(now);
  const monthStart = israelToUtc(`${month}-01`, "00:00").toISOString();
  const monthEnd = israelToUtc(`${addMonths(month, 1)}-01`, "00:00").toISOString();

  const [{ data: clientsData }, { data: therapists }, { data: statuses }, { data: myId }, { data: heldData }, { data: cardsData }] =
    await Promise.all([
      supabase.from("clients").select(CLIENT_SELECT).eq("is_active", true).order("full_name"),
      supabase.from("therapists").select("id, display_name").eq("is_active", true).order("display_name"),
      supabase.rpc("file_status"),
      supabase.rpc("my_therapist_id"),
      // Held sessions (newest first): this month's count and the last one per client.
      supabase.from("sessions").select("client_id, starts_at").eq("status", "held").lt("starts_at", now.toISOString()).order("starts_at", { ascending: false }).limit(2000),
      supabase.from("punch_card_usage").select("*"),
    ]);

  const held = (heldData ?? []) as { client_id: string; starts_at: string }[];
  const heldThisMonth = new Map<string, number>();
  const lastHeld = new Map<string, string>();
  for (const h of held) {
    if (!lastHeld.has(h.client_id)) lastHeld.set(h.client_id, h.starts_at);
    if (h.starts_at >= monthStart && h.starts_at < monthEnd) heldThisMonth.set(h.client_id, (heldThisMonth.get(h.client_id) ?? 0) + 1);
  }
  const cards = (cardsData ?? []) as CardUsage[];
  const today = dayKey(now);

  const clients = (clientsData ?? []) as unknown as ClientRow[];
  const statusById = new Map(((statuses ?? []) as FileStatus[]).map((s) => [s.client_id, s]));
  const isOwner = profile.role === "owner";
  const canTransfer = profile.perms.transfer === 2;
  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.display_name]));

  return (
    <AppShell profile={profile} active="/owner" greet>
      {isOwner && <OwnerOverview />}
      {profile.perms.income === 2 && <IncomeKpis />}
      {isOwner && <OwnerAlerts />}
      {profile.perms.club === 2 && <ClubSummary />}
      <Card title="מעקב טיפולים">
        <p className="text-[13px] text-muted">
          אתה רואה נתוני מעקב לכל מטופל. התיק האישי נפתח רק אם המטפל אישר שיתוף.
        </p>
        {clients.length === 0 ? (
          <p className="text-muted">
            עדיין אין מטופלים במערכת. אפשר להוסיף ב
            <Link href="/owner/clinic" className="text-primary underline">
              הקליניקה שלי
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>מטופל</Th>
                  <Th>מטפל</Th>
                  <Th>מפגשים החודש</Th>
                  <Th>תשלום</Th>
                  <Th>מפגש אחרון</Th>
                  <Th>תיק אישי</Th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const st = statusById.get(c.id);
                  const own = c.therapist_id === myId;
                  return (
                    <tr key={c.id} className="border-b border-[#EDE4D3]">
                      <td className="px-2 py-3 font-semibold">{c.full_name}</td>
                      <td className="px-2 py-2">
                        {!canTransfer ? (
                          <span>{therapistName.get(c.therapist_id) ?? ""}</span>
                        ) : (
                        <form
                          action={transferClientAction.bind(null, c.id)}
                          className="flex items-center gap-2"
                        >
                          <select
                            name="therapist_id"
                            defaultValue={c.therapist_id}
                            aria-label={`מטפל של ${c.full_name}`}
                            className="min-h-10 rounded-lg border border-field bg-white px-2"
                          >
                            {(therapists ?? []).map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.display_name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="min-h-10 rounded-lg border border-field bg-white px-3 text-[13px] hover:bg-sand"
                          >
                            העבר
                          </button>
                        </form>
                        )}
                      </td>
                      <td className="px-2 py-3 tabular-nums">{heldThisMonth.get(c.id) ?? 0}</td>
                      <td className="px-2 py-3">
                        {c.payment_method === "single" ? (
                          `${PAYMENT_LABEL.single} · ${formatShekel(c.rate)}`
                        ) : (
                          <>
                            {PAYMENT_LABEL[c.payment_method]}
                            <span className="block text-[12px] text-muted">
                              {cardStatus(cards.filter((x) => x.client_id === c.id), today)?.text ?? "אין כרטיסייה רשומה"}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-2 py-3 text-muted">
                        {lastHeld.has(c.id) ? formatDate(dayKey(new Date(lastHeld.get(c.id)!))) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {own || st?.shared_with_owner ? (
                          <Link
                            href={`/clients/${c.id}`}
                            className="inline-flex min-h-10 items-center rounded-lg border border-primary px-3.5 text-primary"
                          >
                            {own ? "פתיחה" : "פתיחה · משותף"}
                          </Link>
                        ) : !isOwner ? (
                          <span className="text-[13px] text-muted">נעול</span>
                        ) : st?.owner_requested_at ? (
                          <span className="text-[13px] text-muted">הבקשה נשלחה למטפל</span>
                        ) : (
                          <form action={requestAccessAction.bind(null, c.id)}>
                            <button
                              type="submit"
                              className="min-h-10 rounded-lg border border-dashed border-primary px-3.5 text-primary"
                            >
                              נעול · בקש גישה
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
