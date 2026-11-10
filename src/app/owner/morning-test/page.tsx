import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { KeyTestForm } from "./key-test-form";

// Owner-only: check a Morning key pair before saving it in Vercel.
export default function MorningTestPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await requireRole("owner");
  return (
    <AppShell profile={profile}>
      <KeyTestForm />
    </AppShell>
  );
}
