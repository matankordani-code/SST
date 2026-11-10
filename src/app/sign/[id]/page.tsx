import { Suspense } from "react";
import { connection } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { Loading } from "@/components/loading";
import { SignForm } from "./sign-form";

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
  const { data } = await supabase.rpc("declaration_for_signing", { p_id: id, p_token: token });
  const d = (data as { kind: "health" | "parental"; text_snapshot: string; client_first: string; status: string }[] | null)?.[0];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-8">
      <h1 className="text-2xl font-bold">
        <bdi dir="ltr">SST™</bdi> · {d?.kind === "parental" ? "הסכמת הורה" : "הצהרת בריאות"}
      </h1>
      {!d ? (
        <p className="rounded-lg bg-alert-bg p-4 text-alert-ink">הקישור לא תקין. בקש/י קישור חדש מהמטפל.</p>
      ) : d.status === "signed" ? (
        <p className="rounded-lg bg-[#E4F1E6] p-4 text-[#22582C]">המסמך כבר נחתם. תודה!</p>
      ) : (
        <>
          <p className="text-muted">עבור: {d.client_first}</p>
          <article className="whitespace-pre-wrap rounded-xl border border-line bg-white p-5 leading-relaxed">
            {d.text_snapshot}
          </article>
          <SignForm id={id} token={token} kind={d.kind} />
        </>
      )}
    </main>
  );
}
