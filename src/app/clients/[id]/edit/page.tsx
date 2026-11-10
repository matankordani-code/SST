import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { CLIENT_SELECT, type ClientRow } from "@/lib/clients";
import { EditClientForm } from "./edit-client-form";

export default function EditClientPage({ params }: PageProps<"/clients/[id]/edit">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("owner", "therapist");
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select(CLIENT_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <AppShell profile={profile}>
      <EditClientForm client={data as unknown as ClientRow} />
    </AppShell>
  );
}
