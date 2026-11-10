import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { NewClientForm } from "./new-client-form";

export default function NewClientPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await requireRole("owner", "therapist");
  const supabase = await createClient();
  const isOwner = profile.role === "owner";

  const [{ data: myId }, { data: therapists }] = await Promise.all([
    supabase.rpc("my_therapist_id"),
    isOwner
      ? supabase.from("therapists").select("id, display_name").eq("is_active", true).order("display_name")
      : Promise.resolve({ data: null }),
  ]);

  return (
    <AppShell profile={profile} active={isOwner ? "/owner/clinic" : "/therapist"}>
      <NewClientForm
        therapists={therapists ?? null}
        defaultTherapistId={myId ?? undefined}
        cancelHref={isOwner ? "/owner/clinic" : "/therapist"}
      />
    </AppShell>
  );
}
