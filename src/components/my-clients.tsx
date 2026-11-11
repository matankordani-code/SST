import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";
import { myTherapistId } from "@/lib/view";
import { CLIENT_SELECT, PAYMENT_LABEL, formatShekel, type ClientRow } from "@/lib/clients";
import { cardStatus } from "@/lib/cards";
import type { CardUsage } from "@/lib/sessions";
import { addDays, addMonths, dayKey, formatDate, israelToUtc, monthOf, weekStart } from "@/lib/time";
import { Card } from "@/components/app-shell";
import { SendLinkButton } from "@/components/send-link-button";
import { ReportButton } from "@/components/report-panel";
import { ContactEditor } from "@/components/contact-editor";
import { Tile } from "@/components/stat-tile";
export { Tile };

type Charge = { client_id: string; starts_at: string; status: string; price: number };

// "הקליניקה שלי" / the therapist's clients, as in the prototype: like the
// payments spreadsheet, but filled by every report and payment.
//   balance (per-session clients) = held + late-cancelled sessions − payments.
// The treating therapist tracks their own clients' payments here (rates,
// balances, payment links). Center-wide income stays behind the income permission.
export async function MyClients({
  profile,
  showImport = false,
  tiles = true,
}: {
  profile: Profile;
  showImport?: boolean;
  // The therapist dashboard has its own tiles.
  tiles?: boolean;
}) {
  const money = profile.perms.clients >= 1;
  const supabase = await createClient();
  const myId = await myTherapistId(profile, supabase);

  if (!myId) {
    return (
      <Card title="המטופלים שלי">
        <p className="text-muted">המשתמש שלך עוד לא מוגדר כמטפל במערכת. פנה למתניה כדי שיגדיר אותו.</p>
      </Card>
    );
  }

  const { data } = await supabase.from("clients").select(CLIENT_SELECT).eq("therapist_id", myId).eq("is_active", true).order("full_name");
  const clients = (data ?? []) as unknown as ClientRow[];
  const ids = clients.length ? clients.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"];

  const now = new Date();
  const today = dayKey(now);
  const month = monthOf(now);
  const monthStart = israelToUtc(`${month}-01`, "00:00").toISOString();
  const monthEnd = israelToUtc(`${addMonths(month, 1)}-01`, "00:00").toISOString();
  const thisWeek = weekStart(today);
  const weekStartIso = israelToUtc(thisWeek, "00:00").toISOString();
  const weekEndIso = israelToUtc(addDays(thisWeek, 7), "00:00").toISOString();

  const reports = profile.role !== "surf_instructor";
  const [{ data: chargeData }, { data: payData }, { data: cardsData }, { data: reqData }, { data: lastData }, { data: invoiceData }] = await Promise.all([
    supabase.from("sessions").select("client_id, starts_at, status, price").in("client_id", ids).in("status", ["held", "cancelled_late"]),
    supabase.from("payments").select("client_id, amount, kind").in("client_id", ids),
    supabase.from("punch_card_usage").select("*").in("client_id", ids),
    supabase.from("payment_requests").select("client_id").in("client_id", ids).eq("status", "open"),
    // Each client's latest session that already took place: the "report" button.
    reports
      ? supabase
          .from("sessions")
          .select("id, client_id, starts_at, summary:session_summaries(session_id)")
          .in("client_id", ids)
          .in("status", ["planned", "held"])
          .lte("starts_at", now.toISOString())
          .gte("starts_at", israelToUtc(addDays(today, -120), "00:00").toISOString())
          .order("starts_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    // Invoice contact (migration 0022); empty before it runs.
    supabase.from("clients").select("id, invoice_email, invoice_phone").in("id", ids),
  ]);
  const invoice = new Map(
    ((invoiceData ?? []) as { id: string; invoice_email: string | null; invoice_phone: string | null }[]).map((r) => [r.id, r]),
  );
  const lastByClient = new Map<string, { id: string; starts_at: string; reported: boolean }>();
  for (const x of (lastData ?? []) as unknown as { id: string; client_id: string; starts_at: string; summary: { session_id: string } | null }[]) {
    if (!lastByClient.has(x.client_id)) lastByClient.set(x.client_id, { id: x.id, starts_at: x.starts_at, reported: !!x.summary });
  }
  const charges = (chargeData ?? []) as Charge[];
  const pays = (payData ?? []) as { client_id: string; amount: number; kind: string }[];
  const cards = (cardsData ?? []) as CardUsage[];
  const requested = new Set((reqData ?? []).map((r) => r.client_id as string));

  const rows = clients.map((c) => {
    const mine = charges.filter((x) => x.client_id === c.id);
    const heldMonth = mine.filter((x) => x.status === "held" && x.starts_at >= monthStart && x.starts_at < monthEnd).length;
    const card = c.payment_method === "single" ? null : cardStatus(cards.filter((x) => x.client_id === c.id), today);
    const billed = c.payment_method === "single" ? mine.reduce((n, x) => n + x.price, 0) : 0;
    const paid = pays.filter((p) => p.client_id === c.id && p.kind === "single").reduce((n, p) => n + p.amount, 0);
    const open = Math.max(0, billed - paid);
    const unpaidCount = c.rate > 0 ? Math.round(open / c.rate) : 0;
    return { c, heldMonth, card, open, unpaidCount };
  });

  const heldThisMonth = rows.reduce((n, r) => n + r.heldMonth, 0);
  const heldThisWeek = charges.filter((x) => x.status === "held" && x.starts_at >= weekStartIso && x.starts_at < weekEndIso).length;
  const openTotal = rows.reduce((n, r) => n + r.open, 0);
  const openCount = rows.reduce((n, r) => n + r.unpaidCount, 0);
  const isOwner = profile.realRole === "owner" && !profile.viewAs;
  // Owner only: money in this month from these clients (singles held + cards bought).
  const monthIncome = isOwner
    ? charges
        .filter((x) => x.starts_at >= monthStart && x.starts_at < monthEnd && clients.find((c) => c.id === x.client_id)?.payment_method === "single")
        .reduce((n, x) => n + x.price, 0) +
      cards.filter((k) => k.purchased_on.startsWith(month) && k.paid_note !== "ייבוא מהאקסל").reduce((n, k) => n + k.amount_paid, 0)
    : 0;

  return (
    <>
      {tiles && (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Tile icon="check" tone="sage" label="טיפולים החודש" value={String(heldThisMonth)} sub={`התקיימו עד ${formatDate(today).slice(0, -5)}`} />
        <Tile icon="calendar" label="טיפולים בשבוע הזה" value={String(heldThisWeek)} sub={isOwner ? "היעד שלך: 8–12 בשבוע" : "שהתקיימו"} />
        {isOwner && <Tile icon="money" tone="sand" label="הכנסות החודש" value={formatShekel(monthIncome)} sub="בודדים שהתקיימו + כרטיסיות שנרכשו" />}
        {money && (
          <Tile icon="card" label="יתרות פתוחות" value={formatShekel(openTotal)} sub={openCount ? `${openCount} טיפולים בודדים שלא שולמו` : "הכול שולם"} alert={openTotal > 0} />
        )}
      </div>
      )}

      <Card
        title={`המטופלים שלי · ${clients.length}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {showImport && (
              <Link href="/owner/import" className="flex min-h-11 items-center rounded-lg border border-primary bg-white px-4 text-primary">
                ייבוא מהאקסל
              </Link>
            )}
            <Link href="/clients/new" className="flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-dark">
              + מטופל חדש
            </Link>
          </div>
        }
      >
        {money && <p className="text-[13px] text-muted">כמו בגיליון התשלומים, רק מתעדכן לבד מכל דיווח ותשלום.</p>}
        {clients.length === 0 ? (
          <p className="text-muted">עדיין אין מטופלים. לחץ על &quot;מטופל חדש&quot; כדי להוסיף.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={"w-full border-collapse text-sm " + (money ? "min-w-[1220px]" : "min-w-[920px]")}>
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>מטופל</Th>
                  <Th>משלם</Th>
                  <Th>טלפון ומייל</Th>
                  {money && <Th>תעריף</Th>}
                  <Th>טיפולים החודש</Th>
                  {reports && <Th>טיפול אחרון</Th>}
                  <Th>אופן תשלום</Th>
                  <Th>מצב כרטיסייה</Th>
                  {money && <Th>חשבוניות ויתרה</Th>}
                  {money && <Th>{""}</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, heldMonth, card, open, unpaidCount }) => {
                  const isCard = c.payment_method !== "single";
                  const renew = isCard && (!card || card.renew);
                  return (
                    <tr key={c.id} className="border-b border-[#EDE4D3]">
                      <td className="px-2 py-3">
                        <Link href={`/clients/${c.id}`} className="font-semibold text-primary underline">
                          {c.full_name}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-muted">{c.payer ? `הורה: ${c.payer.full_name}` : "עצמאי/ת"}</td>
                      <td className="px-2 py-2">
                        <ContactEditor
                          compact
                          clientId={c.id}
                          clientName={c.full_name}
                          payerName={c.payer?.full_name ?? null}
                          contact={{
                            phone: c.payer ? c.payer.phone : c.phone,
                            email: c.payer ? c.payer.email : c.email,
                            invoiceEmail: invoice.get(c.id)?.invoice_email ?? null,
                            invoicePhone: invoice.get(c.id)?.invoice_phone ?? null,
                          }}
                        />
                      </td>
                      {money && <td className="px-2 py-3 tabular-nums">{formatShekel(c.rate)}</td>}
                      <td className="px-2 py-3 tabular-nums">{heldMonth}</td>
                      {reports && (
                        <td className="px-2 py-2 text-[13px]">
                          {lastByClient.has(c.id) ? (
                            <span className="flex flex-wrap items-center gap-2">
                              <span className={lastByClient.get(c.id)!.reported ? "text-muted" : "font-semibold text-alert-ink"}>
                                {formatDate(dayKey(new Date(lastByClient.get(c.id)!.starts_at))).slice(0, -5)}
                                {lastByClient.get(c.id)!.reported ? " · דווח" : " · לא דווח"}
                              </span>
                              <ReportButton sessionId={lastByClient.get(c.id)!.id} label={lastByClient.get(c.id)!.reported ? "עריכה" : "דיווח"} />
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-2 py-3">{PAYMENT_LABEL[c.payment_method]}</td>
                      <td className="px-2 py-3 text-[13px]">
                        {!isCard ? "—" : card ? (
                          <span className={card.renew ? "font-semibold text-[#6B4A12]" : ""}>{card.text}</span>
                        ) : (
                          <span className="text-muted">אין כרטיסייה רשומה</span>
                        )}
                      </td>
                      {money && (
                      <td className="px-2 py-3 text-[13px]">
                        {isCard ? (
                          <span className="text-muted">{card ? "שולם מראש" : "—"}</span>
                        ) : open > 0 ? (
                          <span className="font-semibold text-alert-ink">
                            פתוח: {formatShekel(open)}
                            {unpaidCount ? ` (${unpaidCount})` : ""}
                          </span>
                        ) : (
                          <span className="text-[#22582C]">שולם</span>
                        )}
                      </td>
                      )}
                      {money && (
                      <td className="px-2 py-2">
                        {requested.has(c.id) ? (
                          <span className="text-[12px] text-muted">נשלחה דרישה</span>
                        ) : renew ? (
                          <SendLinkButton clientId={c.id} kind={c.payment_method} label="הצעת חידוש" />
                        ) : !isCard && open > 0 ? (
                          <SendLinkButton clientId={c.id} kind="single" label="בקשת תשלום" />
                        ) : null}
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-[13px] font-semibold">
                  <td className="px-2 py-2.5">סה״כ</td>
                  <td />
                  <td />
                  {money && <td />}
                  <td className="px-2 py-2.5 tabular-nums">{heldThisMonth}</td>
                  {reports && <td />}
                  <td />
                  <td />
                  {money && <td className="px-2 py-2.5 tabular-nums">{openTotal > 0 ? `פתוח: ${formatShekel(openTotal)}` : ""}</td>}
                  {money && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {money && (
        <p className="text-[12px] text-muted">
          יתרה פתוחה = מפגשים בודדים שהתקיימו (או בוטלו מאוחר) פחות תשלומים שהתקבלו, מאז תחילת העבודה במערכת. תשלום שהתקבל מחוץ
          למערכת (ביט, מזומן) רושמים בדף המטופל.
        </p>
        )}
      </Card>
    </>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="bg-[#F4EEE2] px-3 py-2.5 font-medium first:rounded-r-xl last:rounded-l-xl">{children}</th>;
}
