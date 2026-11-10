import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { ROLE_INFO } from "@/lib/roles";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/loading";

// Entry point after login: sends each user to their own role screen.
export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <RouteByRole />
    </Suspense>
  );
}

async function RouteByRole() {
  const profile = await getProfile();

  if (profile.role) redirect(ROLE_INFO[profile.role].path);

  return (
    <AppShell profile={profile}>
      <section className="rounded-2xl border border-line bg-white p-7">
        <h2 className="text-xl font-bold">עדיין אין לך הרשאה</h2>
        <p className="mt-2 text-muted">
          המשתמש שלך קיים, אבל עוד לא הוגדר לו תפקיד. פנה למתניה כדי שיגדיר אותו.
        </p>
      </section>
    </AppShell>
  );
}
