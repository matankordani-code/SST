import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { NewDeclarationLink } from "@/components/new-declaration-link";
import { formatDateTime } from "@/lib/time";

type Row = {
  id: string;
  kind: "health" | "parental";
  status: "sent" | "signed";
  signer_name: string | null;
  medical_notes: string | null;
  signature: string | null;
  signed_at: string | null;
  created_at: string;
};

const KIND_LABEL = { health: "הצהרת בריאות", parental: "הסכמת הורה" } as const;

// Health declaration / parental consent status for one client.
export async function DeclarationsCard({ clientId, hasPayer }: { clientId: string; hasPayer: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("declarations")
    .select("id, kind, status, signer_name, medical_notes, signature, signed_at, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  const kinds: ("health" | "parental")[] = hasPayer ? ["health", "parental"] : ["health"];

  return (
    <Card title="הצהרות וחתימות">
      <div className="flex flex-col gap-3">
        {kinds.map((k) => {
          const signed = rows.find((r) => r.kind === k && r.status === "signed");
          const pending = rows.find((r) => r.kind === k && r.status === "sent");
          return (
            <div key={k} className="flex flex-col gap-2 rounded-lg border border-[#EFEAE0] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{KIND_LABEL[k]}</strong>
                {signed ? (
                  <span className="rounded-md bg-[#E4F1E6] px-2 py-0.5 text-[13px] text-[#22582C]">
                    נחתמה {formatDateTime(signed.signed_at!)} · {signed.signer_name}
                  </span>
                ) : pending ? (
                  <span className="rounded-md bg-[#FBF3E4] px-2 py-0.5 text-[13px] text-[#6B4A12]">
                    נשלח קישור, ממתין לחתימה
                  </span>
                ) : (
                  <span className="rounded-md bg-alert-bg px-2 py-0.5 text-[13px] text-alert-ink">לא נחתמה</span>
                )}
              </div>
              {signed?.medical_notes && (
                <p className="text-sm">
                  <span className="text-muted">מידע רפואי שנמסר: </span>
                  {signed.medical_notes}
                </p>
              )}
              {signed?.signature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signed.signature} alt={`חתימה של ${signed.signer_name}`} className="h-16 w-auto self-start rounded border border-line bg-white" />
              )}
              {!signed && <NewDeclarationLink clientId={clientId} kind={k} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
