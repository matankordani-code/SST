import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { ROLE_INFO, type Role } from "@/lib/roles";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";

// Empty placeholder screen for a role. Each one is replaced by the real
// screen as the build stages progress.
export function RolePage({ role }: { role: Role }) {
  // Reading the session is request data, so it streams in behind Suspense
  // (required by Cache Components in Next.js 16).
  return (
    <Suspense fallback={<Loading />}>
      <RoleContent role={role} />
    </Suspense>
  );
}

async function RoleContent({ role }: { role: Role }) {
  const profile = await requireRole(role);
  const info = ROLE_INFO[role];

  return (
    <AppShell profile={profile}>
      <section className="rounded-2xl border border-line bg-white p-7">
        <h2 className="text-xl font-bold">מסך {info.label}</h2>
        <p className="mt-2 text-muted">המסך עדיין בבנייה. כאן יופיעו:</p>
        <ul className="mt-3 list-disc ps-5">
          {info.coming.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
