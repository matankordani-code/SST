import { Suspense } from "react";
import { connection } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { Loading } from "@/components/loading";
import { SignForm, type Prefill } from "./sign-form";

// Public page (no login): the client or parent reads and signs.
export default function SignPage({ params, searchParams }: PageProps<"/sign/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";

  const supabase = createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  type D = { kind: "health" | "parental"; form?: "adult" | "minor"; text_snapshot: string; client_first: string; status: string; prefill?: Prefill };
  let res = await supabase.rpc("declaration_for_signing2", { p_id: id, p_token: token });
  // Before migration 0021: the older function (no form, no prefill).
  if (res.error) res = await supabase.rpc("declaration_for_signing", { p_id: id, p_token: token });
  const d = (res.data as D[] | null)?.[0];
  // The health declaration's form: adult (18+) or a parent for their child.
  const form = d?.kind === "health" && d.form ? d.form : null;
  const title = form === "minor" ? "הצהרת בריאות · הורה עבור בן/בת" : form === "adult" ? "הצהרת בריאות · מבוגר/ת" : d?.kind === "parental" ? "הסכמת הורה" : "הצהרת בריאות";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-8">
      <h1 className="text-2xl font-bold">
        <bdi dir="ltr">SST™</bdi> · {title}
      </h1>
      {!d ? (
        <p className="rounded-lg bg-alert-bg p-4 text-alert-ink">הקישור לא תקין. בקש/י קישור חדש מהמטפל.</p>
      ) : d.status === "signed" ? (
        <p className="rounded-lg bg-[#E4F1E6] p-4 text-[#22582C]">המסמך כבר נחתם. תודה!</p>
      ) : (
        <>
          {!form && <p className="text-muted">עבור: {d.client_first}</p>}
          <SignForm id={id} token={token} kind={d.kind} form={form} prefill={d.prefill ?? {}} text={d.text_snapshot} />
        </>
      )}
    </main>
  );
}
