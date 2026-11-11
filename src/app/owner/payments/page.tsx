import { Suspense } from "react";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Th, Tile } from "@/components/my-clients";
import { PAYMENT_LABEL, formatShekel, type PaymentMethod } from "@/lib/clients";
import { addMonths, dayKey, formatDate, formatMonth, israelToUtc, isMonthKey, monthOf } from "@/lib/time";

// "תשלומים": every shekel and where it came from. Each payment link and payment
// is tagged with its therapist (migration 0020) and who sent the link, so a
// payment shows whose client it was even after a transfer.
export default function PaymentsPage({ searchParams }: PageProps<"/owner/payments">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

type Pay = {
  id: string;
  amount: number;
  kind: PaymentMethod;
  source: string;
  morning_document_number: string | null;
  paid_at: string;
  note: string | null;
  therapist_id: string | null;
  client_id: string;
  client: { full_name: string } | null;
  request: { created_by: string | null; created_at: string } | null;
  recorded_by: string | null;
};
type Req = {
  id: string;
  amount: number;
  kind: PaymentMethod;
  created_at: string;
  client_id: string;
  therapist_id: string | null;
  created_by: string | null;
  client: { full_name: string } | null;
};

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const profile = await requirePerm("income", 2);
  const supabase = await createClient();

  const now = monthOf(new Date());
  const month = isMonthKey(sp.m) ? sp.m : now;
  const filter = typeof sp.t === "string" ? sp.t : "all";
  const from = israelToUtc(`${month}-01`, "00:00").toISOString();
  const to = israelToUtc(`${addMonths(month, 1)}-01`, "00:00").toISOString();

  let payQ = supabase
    .from("payments")
    .select(
      "id, amount, kind, source, morning_document_number, paid_at, note, therapist_id, client_id, recorded_by, client:clients(full_name), request:payment_requests(created_by, created_at)",
    )
    .gte("paid_at", from)
    .lt("paid_at", to)
    .order("paid_at", { ascending: false });
  let reqQ = supabase
    .from("payment_requests")
    .select("id, amount, kind, created_at, client_id, therapist_id, created_by, client:clients(full_name)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (filter !== "all") {
    payQ = payQ.eq("therapist_id", filter);
    reqQ = reqQ.eq("therapist_id", filter);
  }

  const [payRes, reqRes, { data: therapistRows }, { data: profileRows }] = await Promise.all([
    payQ,
    reqQ,
    supabase.from("therapists").select("id, display_name").order("display_name"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  if (payRes.error || reqRes.error) {
    return (
      <AppShell profile={profile} active="/owner/payments">
        <Card title="תשלומים">
          <p className="text-muted">כדי לראות את המסך הזה צריך להריץ את מיגרציה 0020 (שיוך תשלומים למטפל) ב-Supabase.</p>
        </Card>
      </AppShell>
    );
  }

  const pays = (payRes.data ?? []) as unknown as Pay[];
  const reqs = (reqRes.data ?? []) as unknown as Req[];
  const therapists = (therapistRows ?? []) as { id: string; display_name: string }[];
  const tName = (id: string | null) => therapists.find((t) => t.id === id)?.display_name ?? "ללא מטפל";
  const people = (profileRows ?? []) as { id: string; full_name: string | null; email: string | null }[];
  const pName = (id: string | null | undefined) => {
    const p = people.find((x) => x.id === id);
    return p ? p.full_name || p.email || "" : "";
  };

  const total = pays.reduce((n, p) => n + p.amount, 0);
  const viaLink = pays.filter((p) => p.source !== "manual").reduce((n, p) => n + p.amount, 0);
  const manual = total - viaLink;
  const openSum = reqs.reduce((n, r) => n + r.amount, 0);

  // Per therapist: collected this month, how many payments, open links.
  const ids = [...new Set([...pays.map((p) => p.therapist_id), ...reqs.map((r) => r.therapist_id)])];
  const byTherapist = ids
    .map((id) => {
      const mine = pays.filter((p) => p.therapist_id === id);
      const open = reqs.filter((r) => r.therapist_id === id);
      return {
        id,
        name: tName(id),
        count: mine.length,
        sum: mine.reduce((n, p) => n + p.amount, 0),
        link: mine.filter((p) => p.source !== "manual").reduce((n, p) => n + p.amount, 0),
        openCount: open.length,
        openSum: open.reduce((n, r) => n + r.amount, 0),
      };
    })
    .sort((a, b) => b.sum - a.sum);

  const qs = (m: string, t = filter) => `/owner/payments?m=${m}${t !== "all" ? `&t=${t}` : ""}`;

  return (
    <AppShell profile={profile} active="/owner/payments">
      <Card title={`תשלומים · ${formatMonth(month)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs(addMonths(month, -1))} className={navBtn}>
            → חודש קודם
          </Link>
          <Link href={qs(now)} className={navBtn}>
            החודש
          </Link>
          <Link href={qs(addMonths(month, 1))} className={navBtn}>
            חודש הבא ←
          </Link>
          <form method="get" action="/owner/payments" className="ms-auto flex items-center gap-2">
            <input type="hidden" name="m" value={month} />
            <label htmlFor="t" className="text-[13px] text-muted">
              מטפל
            </label>
            <select id="t" name="t" defaultValue={filter} className="min-h-10 rounded-lg border border-field bg-white px-2">
              <option value="all">כל המטפלים</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name}
                </option>
              ))}
            </select>
            <button type="submit" className={navBtn}>
              הצג
            </button>
          </form>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          <Tile icon="money" tone="sage" label="נגבה בחודש" value={formatShekel(total)} sub={`${pays.length} תשלומים`} />
          <Tile icon="card" label="דרך לינק תשלום" value={formatShekel(viaLink)} sub="Morning, עם קבלה" />
          <Tile icon="check" tone="sand" label="נרשם ידנית" value={formatShekel(manual)} sub="ביט, מזומן, העברה" />
          <Tile icon="clock" label="לינקים פתוחים" value={formatShekel(openSum)} sub={`${reqs.length} ממתינים לתשלום`} alert={reqs.length > 0} />
        </div>
      </Card>

      {filter === "all" && byTherapist.length > 0 && (
        <Card title="לפי מטפל">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>מטפל</Th>
                  <Th>תשלומים</Th>
                  <Th>נגבה</Th>
                  <Th>מתוכו בלינק</Th>
                  <Th>לינקים פתוחים</Th>
                </tr>
              </thead>
              <tbody>
                {byTherapist.map((r) => (
                  <tr key={r.id ?? "none"} className="border-b border-[#EDE4D3]">
                    <td className="px-2 py-2.5">
                      {r.id ? (
                        <Link href={qs(month, r.id)} className="font-semibold text-primary underline">
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{r.count}</td>
                    <td className="px-2 py-2.5 font-semibold tabular-nums">{formatShekel(r.sum)}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatShekel(r.link)}</td>
                    <td className="px-2 py-2.5 tabular-nums">{r.openCount ? `${r.openCount} · ${formatShekel(r.openSum)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={`התקבלו · ${pays.length}`}>
        {pays.length === 0 ? (
          <p className="text-muted">אין תשלומים בחודש הזה.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>תאריך</Th>
                  <Th>מטופל</Th>
                  <Th>מטפל</Th>
                  <Th>סוג</Th>
                  <Th>סכום</Th>
                  <Th>מקור</Th>
                  <Th>מי שלח / רשם</Th>
                  <Th>קבלה</Th>
                </tr>
              </thead>
              <tbody>
                {pays.map((p) => (
                  <tr key={p.id} className="border-b border-[#EDE4D3]">
                    <td className="px-2 py-2.5">{formatDate(dayKey(new Date(p.paid_at)))}</td>
                    <td className="px-2 py-2.5">
                      <Link href={`/clients/${p.client_id}`} className="text-primary underline">
                        {p.client?.full_name}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">{tName(p.therapist_id)}</td>
                    <td className="px-2 py-2.5">{PAYMENT_LABEL[p.kind]}</td>
                    <td className="px-2 py-2.5 font-semibold tabular-nums">{formatShekel(p.amount)}</td>
                    <td className="px-2 py-2.5">
                      {p.source === "manual" ? `ידני${p.note ? ` · ${p.note}` : ""}` : p.request ? "לינק תשלום" : "Morning"}
                    </td>
                    <td className="px-2 py-2.5 text-muted">
                      {p.source === "manual"
                        ? pName(p.recorded_by) || "—"
                        : p.request
                          ? `${pName(p.request.created_by) || "—"} · ${formatDate(dayKey(new Date(p.request.created_at)))}`
                          : "—"}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{p.morning_document_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {reqs.length > 0 && (
        <Card title={`לינקים שנשלחו וממתינים · ${reqs.length}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>נשלח</Th>
                  <Th>מטופל</Th>
                  <Th>מטפל</Th>
                  <Th>סוג</Th>
                  <Th>סכום</Th>
                  <Th>מי שלח</Th>
                </tr>
              </thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.id} className="border-b border-[#EDE4D3]">
                    <td className="px-2 py-2.5">{formatDate(dayKey(new Date(r.created_at)))}</td>
                    <td className="px-2 py-2.5">
                      <Link href={`/clients/${r.client_id}`} className="text-primary underline">
                        {r.client?.full_name}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">{tName(r.therapist_id)}</td>
                    <td className="px-2 py-2.5">{PAYMENT_LABEL[r.kind]}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatShekel(r.amount)}</td>
                    <td className="px-2 py-2.5 text-muted">{pName(r.created_by) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}

const navBtn = "flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm hover:bg-sand";
