import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CLIENT_SELECT, PAYMENT_LABEL, formatShekel, type ClientRow } from "@/lib/clients";
import { Card } from "@/components/app-shell";

// The signed-in therapist's own clients (also the owner's "הקליניקה שלי").
export async function MyClients() {
  const supabase = await createClient();
  const { data: myId } = await supabase.rpc("my_therapist_id");

  if (!myId) {
    return (
      <Card title="המטופלים שלי">
        <p className="text-muted">
          המשתמש שלך עוד לא מוגדר כמטפל במערכת. פנה למתניה כדי שיגדיר אותו.
        </p>
      </Card>
    );
  }

  const { data } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("therapist_id", myId)
    .eq("is_active", true)
    .order("full_name");
  const clients = (data ?? []) as unknown as ClientRow[];

  return (
    <Card
      title={`המטופלים שלי · ${clients.length}`}
      actions={
        <Link
          href="/clients/new"
          className="flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-dark"
        >
          + מטופל חדש
        </Link>
      }
    >
      {clients.length === 0 ? (
        <p className="text-muted">עדיין אין מטופלים. לחץ על &quot;מטופל חדש&quot; כדי להוסיף.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-right text-[13px] text-muted">
                <Th>מטופל</Th>
                <Th>משלם</Th>
                <Th>תעריף</Th>
                <Th>אופן תשלום</Th>
                <Th>כמות טיפולים</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-[#EFEAE0]">
                  <td className="px-2 py-3">
                    <Link href={`/clients/${c.id}`} className="font-semibold text-primary underline">
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="px-2 py-3 text-muted">{c.payer?.full_name ?? "המטופל עצמו"}</td>
                  <td className="px-2 py-3 tabular-nums">{formatShekel(c.rate)}</td>
                  <td className="px-2 py-3">{PAYMENT_LABEL[c.payment_method]}</td>
                  <td className="px-2 py-3 tabular-nums">{c.planned_sessions ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-line px-2 py-2.5 font-medium">{children}</th>;
}
