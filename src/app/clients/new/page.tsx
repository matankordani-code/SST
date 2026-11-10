import { Suspense } from "react";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { myTherapistId } from "@/lib/view";
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
  const profile = await requirePerm("clients");
  const supabase = await createClient();
  const isOwner = profile.role === "owner";
  const pickTherapist = profile.perms.clients === 2;

  const [{ data: myId }, { data: therapists }] = await Promise.all([
    myTherapistId(profile, supabase).then((data) => ({ data })),
    pickTherapist
      ? supabase.from("therapists").select("id, display_name").eq("is_active", true).order("display_name")
      : Promise.resolve({ data: null }),
  ]);

  return (
    <AppShell profile={profile} active={isOwner ? "/owner/clinic" : pickTherapist ? "/owner" : "/therapist"}>
      <NewClientForm
        therapists={therapists ?? null}
        defaultTherapistId={myId ?? undefined}
        cancelHref={isOwner ? "/owner/clinic" : pickTherapist ? "/owner" : "/therapist"}
        defaultRate={profile.role === "surf_instructor" ? 280 : undefined}
        instructor={profile.role === "surf_instructor"}
      />
    </AppShell>
  );
}
