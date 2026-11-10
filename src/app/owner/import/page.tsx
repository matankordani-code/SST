import { Suspense } from "react";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Importer } from "./importer";

export default function ImportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await requirePerm("staff", 2);
  const supabase = await createClient();
  const [{ data: therapists }, { data: myId }] = await Promise.all([
    supabase.from("therapists").select("id, display_name").eq("is_active", true).order("display_name"),
    supabase.rpc("my_therapist_id"),
  ]);
  return (
    <AppShell profile={profile} active="/owner/clinic">
      <Importer therapists={therapists ?? []} defaultTherapistId={(myId as string) ?? ""} />
    </AppShell>
  );
}
