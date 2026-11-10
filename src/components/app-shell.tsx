import Link from "next/link";
import type { Profile } from "@/lib/auth";
import { ROLE_INFO, ROLE_NAV } from "@/lib/roles";

export function AppShell({
  profile,
  active,
  children,
}: {
  profile: Profile;
  // href of the current tab, to highlight it
  active?: string;
  children: React.ReactNode;
}) {
  const name = profile.full_name || profile.email || "";
  const roleLabel = profile.role ? ROLE_INFO[profile.role].label : "ללא תפקיד";
  const tabs = profile.role ? (ROLE_NAV[profile.role] ?? []) : [];

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

        {tabs.length > 0 && (
          <nav aria-label="ניווט" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {tabs.map((t) => {
              const isActive = t.href === active;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    "flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-4 text-[15px] " +
                    (isActive
                      ? "bg-primary font-semibold text-white"
                      : "border border-line bg-white text-ink hover:bg-sand")
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        )}

        {children}
      </div>
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
