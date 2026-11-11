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
import { seesMoney } from "@/lib/permissions";

type Charge = { client_id: string; starts_at: string; status: string; price: number };

// "הקליניקה שלי" / the therapist's clients, as in the prototype: like the
// payments spreadsheet, but filled by every report and payment.
//   balance (per-session clients) = held + late-cancelled sessions − payments.
// Without the income permission (therapists, by default) no money is shown:
// no rates, balances or payment buttons. Sessions and card status only.
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
  const money = seesMoney(profile);
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

  const [{ data: chargeData }, { data: payData }, { data: cardsData }, { data: reqData }] = await Promise.all([
    supabase.from("sessions").select("client_id, starts_at, status, price").in("client_id", ids).in("status", ["held", "cancelled_late"]),
    supabase.from("payments").select("client_id, amount, kind").in("client_id", ids),
    supabase.from("punch_card_usage").select("*").in("client_id", ids),
    supabase.from("payment_requests").select("client_id").in("client_id", ids).eq("status", "open"),
  ]);
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
        <Tile label="טיפולים החודש" value={String(heldThisMonth)} sub={`התקיימו עד ${formatDate(today).slice(0, -5)}`} />
        <Tile label="טיפולים בשבוע הזה" value={String(heldThisWeek)} sub={isOwner ? "היעד שלך: 8–12 בשבוע" : "שהתקיימו"} />
        {isOwner && <Tile label="הכנסות החודש" value={formatShekel(monthIncome)} sub="בודדים שהתקיימו + כרטיסיות שנרכשו" />}
        {money && (
          <Tile label="יתרות פתוחות" value={formatShekel(openTotal)} sub={openCount ? `${openCount} טיפולים בודדים שלא שולמו` : "הכול שולם"} alert={openTotal > 0} />
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
            <table className={"w-full border-collapse text-sm " + (money ? "min-w-[900px]" : "min-w-[600px]")}>
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>מטופל</Th>
                  <Th>משלם</Th>
                  {money && <Th>תעריף</Th>}
                  <Th>טיפולים החודש</Th>
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
                    <tr key={c.id} className="border-b border-[#EFEAE0]">
                      <td className="px-2 py-3">
                        <Link href={`/clients/${c.id}`} className="font-semibold text-primary underline">
                          {c.full_name}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-muted">{c.payer ? `הורה: ${c.payer.full_name}` : "עצמאי/ת"}</td>
                      {money && <td className="px-2 py-3 tabular-nums">{formatShekel(c.rate)}</td>}
                      <td className="px-2 py-3 tabular-nums">{heldMonth}</td>
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
                  {money && <td />}
                  <td className="px-2 py-2.5 tabular-nums">{heldThisMonth}</td>
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

export function Tile({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-white p-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={"text-2xl font-bold tabular-nums " + (alert ? "text-alert-ink" : "")}>{value}</span>
      <span className="text-[12px] text-muted">{sub}</span>
    </div>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-line px-2 py-2.5 font-medium">{children}</th>;
}
