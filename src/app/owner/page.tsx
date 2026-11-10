import { Suspense } from "react";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Th } from "@/components/my-clients";
import { OwnerAlerts } from "@/components/owner-alerts";
import { IncomeKpis } from "@/components/income-kpis";
import { CLIENT_SELECT, PAYMENT_LABEL, formatShekel, type ClientRow } from "@/lib/clients";
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

  const [{ data: clientsData }, { data: therapists }, { data: statuses }, { data: myId }] =
    await Promise.all([
      supabase.from("clients").select(CLIENT_SELECT).eq("is_active", true).order("full_name"),
      supabase.from("therapists").select("id, display_name").eq("is_active", true).order("display_name"),
      supabase.rpc("file_status"),
      supabase.rpc("my_therapist_id"),
    ]);

  const clients = (clientsData ?? []) as unknown as ClientRow[];
  const statusById = new Map(((statuses ?? []) as FileStatus[]).map((s) => [s.client_id, s]));
  const isOwner = profile.role === "owner";
  const canTransfer = profile.perms.transfer === 2;
  const therapistName = new Map((therapists ?? []).map((t) => [t.id, t.display_name]));

  return (
    <AppShell profile={profile} active="/owner">
      {profile.perms.income === 2 && <IncomeKpis />}
      {isOwner && <OwnerAlerts />}
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
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <Th>מטופל</Th>
                  <Th>מטפל</Th>
                  <Th>תעריף</Th>
                  <Th>אופן תשלום</Th>
                  <Th>תיק אישי</Th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const st = statusById.get(c.id);
                  const own = c.therapist_id === myId;
                  return (
                    <tr key={c.id} className="border-b border-[#EFEAE0]">
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
                      <td className="px-2 py-3 tabular-nums">{formatShekel(c.rate)}</td>
                      <td className="px-2 py-3">{PAYMENT_LABEL[c.payment_method]}</td>
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
