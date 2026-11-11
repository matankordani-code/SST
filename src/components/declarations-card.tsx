import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/app-shell";
import { NewDeclarationLink } from "@/components/new-declaration-link";
import { SendHealthLink } from "@/components/send-health-link";
import { formatDate, formatDateTime } from "@/lib/time";

type Row = {
  id: string;
  kind: "health" | "parental";
  form?: "adult" | "minor" | null;
  status: "sent" | "signed";
  signer_name: string | null;
  medical_notes: string | null;
  signature: string | null;
  signed_at: string | null;
  created_at: string;
  details?: Record<string, string> | null;
  marketing_ok?: boolean | null;
};

const BASE = "id, kind, status, signer_name, medical_notes, signature, signed_at, created_at";
const FORM_LABEL = { adult: "מבוגר/ת", minor: "הורה עבור בן/בת" } as const;

// Health declaration status for one client: send the right form (adult, or a
// parent for their child), and see what was signed, with the details given.
export async function DeclarationsCard({
  clientId,
  suggested,
}: {
  clientId: string;
  suggested: "adult" | "minor";
}) {
  const supabase = await createClient();
  const full = await supabase
    .from("declarations")
    .select(`${BASE}, form, details, marketing_ok`)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  // Before migration 0021: without the new columns.
  const data = full.error
    ? (await supabase.from("declarations").select(BASE).eq("client_id", clientId).order("created_at", { ascending: false })).data
    : full.data;
  const rows = (data ?? []) as Row[];

  const health = rows.filter((r) => r.kind === "health");
  const signed = health.find((r) => r.status === "signed");
  const pending = health.find((r) => r.status === "sent");
  // Older separate parental consents, if any were sent.
  const parental = rows.filter((r) => r.kind === "parental");
  const parentalSigned = parental.find((r) => r.status === "signed");

  return (
    <Card title="הצהרת בריאות">
      <div className="flex flex-col gap-3 rounded-lg border border-[#EDE4D3] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {signed ? (
            <span className="rounded-md bg-[#E4F1E6] px-2 py-0.5 text-[13px] text-[#22582C]">
              נחתמה {formatDateTime(signed.signed_at!)} · {signed.signer_name}
              {signed.form ? ` · ${FORM_LABEL[signed.form]}` : ""}
            </span>
          ) : pending ? (
            <span className="rounded-md bg-[#FBF3E4] px-2 py-0.5 text-[13px] text-[#6B4A12]">
              נשלח קישור {formatDate(pending.created_at.slice(0, 10))}
              {pending.form ? ` (${FORM_LABEL[pending.form]})` : ""}, ממתין לחתימה
            </span>
          ) : (
            <span className="rounded-md bg-alert-bg px-2 py-0.5 text-[13px] text-alert-ink">לא נחתמה</span>
          )}
        </div>

        {signed && <Signed row={signed} />}

        {signed ? (
          <details className="text-sm">
            <summary className="min-h-10 cursor-pointer content-center text-primary">שליחת הצהרה חדשה</summary>
            <div className="pt-2">
              <SendHealthLink clientId={clientId} suggested={signed.form ?? suggested} />
            </div>
          </details>
        ) : (
          <SendHealthLink clientId={clientId} suggested={pending?.form ?? suggested} />
        )}
      </div>

      {parental.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#EDE4D3] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <strong>הסכמת הורה (טופס ישן)</strong>
            {parentalSigned ? (
              <span className="rounded-md bg-[#E4F1E6] px-2 py-0.5 text-[13px] text-[#22582C]">
                נחתמה {formatDateTime(parentalSigned.signed_at!)} · {parentalSigned.signer_name}
              </span>
            ) : (
              <span className="rounded-md bg-[#FBF3E4] px-2 py-0.5 text-[13px] text-[#6B4A12]">ממתין לחתימה</span>
            )}
          </div>
          {parentalSigned?.signature && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={parentalSigned.signature} alt={`חתימה של ${parentalSigned.signer_name}`} className="h-16 w-auto self-start rounded border border-line bg-white" />
          )}
          {!parentalSigned && <NewDeclarationLink clientId={clientId} kind="parental" />}
        </div>
      )}
    </Card>
  );
}

const DETAIL_LABEL: Record<string, string> = {
  first_name: "שם פרטי",
  last_name: "שם משפחה",
  id_number: "ת״ז",
  birth_date: "תאריך לידה",
  child_first: "שם הילד/ה",
  child_last: "שם משפחה",
  child_id: "ת״ז הילד/ה",
  child_birth: "תאריך לידה",
  parent_name: "ההורה החותם/ת",
  parent_id: "ת״ז ההורה",
  phone: "טלפון",
  email: "אימייל",
  city: "עיר",
};

function Signed({ row }: { row: Row }) {
  const details = Object.entries(row.details ?? {}).filter(([, v]) => v);
  return (
    <div className="flex flex-col gap-2 text-sm">
      {details.length > 0 && (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          {details.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-[12px] text-muted">{DETAIL_LABEL[k] ?? k}</dt>
              <dd>{/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : <bdi>{v}</bdi>}</dd>
            </div>
          ))}
        </dl>
      )}
      <p>
        <span className="text-muted">מידע רפואי שנמסר: </span>
        {row.medical_notes ?? "אין"}
      </p>
      {row.marketing_ok != null && (
        <p className="text-muted">{row.marketing_ok ? "✓ אישר/ה קבלת חומר פרסומי" : "לא אישר/ה קבלת חומר פרסומי"}</p>
      )}
      {row.signature && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.signature} alt={`חתימה של ${row.signer_name}`} className="h-16 w-auto self-start rounded border border-line bg-white" />
      )}
    </div>
  );
}
