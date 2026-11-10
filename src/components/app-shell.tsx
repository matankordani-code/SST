import type { Profile } from "@/lib/auth";
import { ROLE_INFO } from "@/lib/roles";

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const name = profile.full_name || profile.email || "";
  const roleLabel = profile.role ? ROLE_INFO[profile.role].label : "ללא תפקיד";

  return (
    <div className="px-4 pt-6 pb-16">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">
            <bdi dir="ltr">SST™</bdi> · מערכת המרכז
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">
              מחובר/ת: <strong className="text-ink">{name}</strong> · {roleLabel}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="min-h-10 rounded-lg border border-field bg-white px-3.5 text-sm hover:bg-sand"
              >
                התנתקות
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
