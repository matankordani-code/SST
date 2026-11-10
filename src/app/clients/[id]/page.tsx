import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { myTherapistId } from "@/lib/view";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Field, inputClass } from "@/components/field";
import { CLIENT_SELECT, PAYMENT_LABEL, formatShekel, type ClientRow } from "@/lib/clients";
import { setShareAction, updateFileAction } from "@/app/clients/actions";
import { ClientCards, ClientSessions } from "@/components/client-extras";
import { ClientPayments } from "@/components/client-payments";
import { DeclarationsCard } from "@/components/declarations-card";
import { PortalInvite } from "@/components/portal-invite";

export default function ClientPage({ params }: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

type FileRow = {
  goal: string | null;
  intro: string | null;
  shared_with_owner: boolean;
  owner_requested_at: string | null;
};

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requirePerm("clients");
  const supabase = await createClient();

  const [{ data: clientData }, { data: file }, { data: myId }] = await Promise.all([
    supabase.from("clients").select(`${CLIENT_SELECT}, therapist:therapists(display_name)`).eq("id", id).maybeSingle(),
    supabase
      .from("client_files")
      .select("goal, intro, shared_with_owner, owner_requested_at")
      .eq("client_id", id)
      .maybeSingle<FileRow>(),
    myTherapistId(profile, supabase).then((data) => ({ data })),
  ]);

  // RLS returns nothing for clients this user may not see.
  if (!clientData) notFound();
  const client = clientData as unknown as ClientRow & { therapist: { display_name: string } | null };
  const treating = client.therapist_id === myId;

  // Access log: record every opening of a personal file.
  if (file) {
    await supabase.from("access_log").insert({ client_id: id, action: "view_file" });
  }

  const back = treating ? (profile.role === "owner" ? "/owner/clinic" : "/therapist") : profile.perms.clients === 2 ? "/owner" : "/therapist";

  return (
    <AppShell profile={profile} active={back}>
      <Card
        title={`תיק אישי · ${client.full_name}`}
        actions={
          (treating || profile.perms.clients === 2) && (
            <Link
              href={`/clients/${id}/edit`}
              className="flex min-h-11 items-center rounded-lg border border-field bg-white px-4 text-sm hover:bg-sand"
            >
              עריכת פרטים
            </Link>
          )
        }
      >
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3 text-sm">
          <Item label="מטפל">{client.therapist?.display_name ?? "—"}</Item>
          <Item label="טלפון">
            <bdi dir="ltr">{client.phone ?? "—"}</bdi>
          </Item>
          <Item label="מייל">
            <bdi dir="ltr">{client.email ?? "—"}</bdi>
          </Item>
          <Item label="גיל">{client.age ?? "—"}</Item>
          <Item label="משלם">
            {client.payer
              ? `${client.payer.full_name}${client.payer.phone ? ` · ${client.payer.phone}` : ""}`
              : "המטופל עצמו"}
          </Item>
          <Item label="תעריף">{formatShekel(client.rate)}</Item>
          <Item label="אופן תשלום">{PAYMENT_LABEL[client.payment_method]}</Item>
          <Item label="כמות טיפולים מתוכננת">{client.planned_sessions ?? "—"}</Item>
        </dl>
      </Card>

      {profile.role !== "surf_instructor" && <DeclarationsCard clientId={id} hasPayer={!!client.payer} />}
      <ClientPayments clientId={id} rate={client.rate} />
      <Card title="אזור אישי למשלם">
        <PortalInvite clientId={id} />
      </Card>
      <ClientCards clientId={id} method={client.payment_method} />
      <ClientSessions clientId={id} />

      {profile.role === "surf_instructor" ? null : !file ? (
        <Card title="תוכן טיפולי">
          <p className="text-muted">
            התיק האישי נעול. הוא ייפתח רק אם המטפל יאשר שיתוף. אפשר לבקש גישה ממסך
            &quot;ראשי&quot;.
          </p>
        </Card>
      ) : (
        <Card
          title="תוכן טיפולי"
          actions={
            treating ? (
              <form action={setShareAction.bind(null, id, !file.shared_with_owner)}>
                <button
                  type="submit"
                  className="min-h-11 rounded-lg border border-primary bg-white px-4 text-sm text-primary"
                >
                  {file.shared_with_owner ? "✓ משותף עם מתניה · ביטול שיתוף" : "שיתוף התיק עם מתניה"}
                </button>
              </form>
            ) : (
              <span className="text-[13px] text-muted">התיק שותף איתך</span>
            )
          }
        >
          {treating && file.owner_requested_at && !file.shared_with_owner && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2.5 rounded-lg border border-[#E8D3AE] bg-[#FBF3E4] px-3 py-2.5 text-sm"
            >
              <span className="flex-[1_1_200px]">מתניה ביקש גישה לתיק הזה.</span>
              <form action={setShareAction.bind(null, id, true)}>
                <button className="min-h-10 rounded-lg bg-primary px-3.5 text-white">אישור</button>
              </form>
              <form action={setShareAction.bind(null, id, false)}>
                <button className="min-h-10 rounded-lg border border-field bg-white px-3.5">דחייה</button>
              </form>
            </div>
          )}

          {treating ? (
            <form action={updateFileAction.bind(null, id)} className="flex flex-col gap-3">
              <Field label="מטרת הטיפול">
                <input name="goal" defaultValue={file.goal ?? ""} className={inputClass} />
              </Field>
              <Field label="תקציר ראשוני">
                <textarea
                  name="intro"
                  rows={5}
                  defaultValue={file.intro ?? ""}
                  className={inputClass + " py-2.5"}
                />
              </Field>
              <div>
                <button
                  type="submit"
                  className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark"
                >
                  שמירה
                </button>
              </div>
            </form>
          ) : (
            <dl className="flex flex-col gap-3 text-sm">
              <Item label="מטרת הטיפול">{file.goal ?? "—"}</Item>
              <Item label="תקציר ראשוני">
                <span className="whitespace-pre-wrap">{file.intro ?? "—"}</span>
              </Item>
            </dl>
          )}
        </Card>
      )}
    </AppShell>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
