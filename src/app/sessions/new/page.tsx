import { Suspense } from "react";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { dayKey, isDayKey } from "@/lib/time";
import { NewSessionForm } from "./new-session-form";

export default function NewSessionPage({ searchParams }: PageProps<"/sessions/new">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const profile = await requirePerm("calendar");
  const supabase = await createClient();

  // RLS: owner gets every client, a therapist only their own.
  const { data } = await supabase
    .from("clients")
    .select("id, full_name, therapist:therapists(display_name)")
    .eq("is_active", true)
    .order("full_name");
  const clients = ((data ?? []) as unknown as {
    id: string;
    full_name: string;
    therapist: { display_name: string } | null;
  }[]).map((c) => ({
    id: c.id,
    label: profile.perms.calendar === 2 && c.therapist ? `${c.full_name} · ${c.therapist.display_name}` : c.full_name,
  }));

  return (
    <AppShell profile={profile} active="/calendar">
      <NewSessionForm
        clients={clients}
        defaultClientId={typeof sp.client === "string" ? sp.client : undefined}
        defaultDate={isDayKey(sp.date) ? sp.date : dayKey(new Date())}
      />
    </AppShell>
  );
}
