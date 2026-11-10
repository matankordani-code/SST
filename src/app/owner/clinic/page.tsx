import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { MyClients } from "@/components/my-clients";

export default function ClinicPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await requireRole("owner");
  return (
    <AppShell profile={profile} active="/owner/clinic">
      <MyClients />
    </AppShell>
  );
}
