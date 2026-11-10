import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { MyClients } from "@/components/my-clients";

export default function TherapistPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await requireRole("therapist", "surf_instructor");
  return (
    <AppShell profile={profile} active="/therapist">
      <MyClients />
    </AppShell>
  );
}
