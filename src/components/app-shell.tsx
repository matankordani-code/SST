import Link from "next/link";
import type { Profile } from "@/lib/auth";
import { ROLE_INFO } from "@/lib/roles";
import { navFor } from "@/lib/nav";
import { ViewBanner, ViewSwitcher } from "@/components/view-switcher";
import { LiveRefresh } from "@/components/live-refresh";
import { NavIcon } from "@/components/nav-icon";

const TZ = "Asia/Jerusalem";

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now));
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 22) return "ערב טוב";
  return "לילה טוב";
}

const today = (now: Date) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "long", day: "numeric", month: "numeric", year: "numeric" }).format(now);

// The frame of every signed-in screen: a side menu with icons (on the right),
// and on phones a top bar with the menu scrolling sideways.
export function AppShell({
  profile,
  active,
  greet = false,
  children,
}: {
  profile: Profile;
  // href of the current tab, to highlight it
  active?: string;
  // Dashboards open with "בוקר טוב, …" and today's date.
  greet?: boolean;
  children: React.ReactNode;
}) {
  const name = profile.viewAs?.name ?? (profile.full_name || profile.email || "");
  const roleLabel = profile.role ? ROLE_INFO[profile.role].label : "ללא תפקיד";
  const tabs = navFor(profile);
  const now = new Date();

  const menu = (
    <nav aria-label="ניווט" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={
              "flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[15px] font-medium transition-colors " +
              (isActive ? "bg-primary text-white shadow-soft" : "text-ink hover:bg-ocean/10")
            }
          >
            <NavIcon href={t.href} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* Side menu (desktop) / top bar (phone) */}
      <aside className="relative flex flex-col gap-4 overflow-hidden border-line bg-gradient-to-b from-[#F6F0E3] to-[#EEE4CF] px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-e lg:py-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 px-1">
            <span className="grid size-10 place-items-center rounded-xl bg-primary shadow-soft" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path d="M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.5 5-2.5" fill="none" stroke="#F3ECDC" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="16" cy="7" r="3" fill="#CCB89E" />
              </svg>
            </span>
            <span className="leading-tight">
              <bdi dir="ltr" className="block text-lg font-bold text-primary">
                SST™
              </bdi>
              <span className="text-[12px] text-muted">מערכת המרכז</span>
            </span>
          </Link>
          {/* Phone: account actions next to the logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <Link href="/account" className="grid size-10 place-items-center rounded-xl border border-line bg-card text-primary" aria-label="הסיסמה שלי">
              <NavIcon href="/owner/permissions" />
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="min-h-10 rounded-xl border border-line bg-card px-3 text-sm">
                יציאה
              </button>
            </form>
          </div>
        </div>

        {tabs.length > 0 && menu}

        {/* Desktop: sea decoration and the signed-in user */}
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-32 w-full lg:block" viewBox="0 0 248 128" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 74 C42 56 84 92 126 74 S210 56 248 70 V128 H0Z" fill="#CCB89E" opacity=".35" />
          <path d="M0 96 C52 80 94 110 146 94 S220 84 248 92 V128 H0Z" fill="#2F7B96" opacity=".18" />
        </svg>
        <div className="relative mt-auto hidden flex-col gap-2 rounded-2xl bg-card p-3 shadow-soft lg:flex">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-beach font-bold text-primary" aria-hidden="true">
              {name.trim().charAt(0)}
            </span>
            <span className="min-w-0 leading-tight">
              <strong className="block truncate text-primary">{name}</strong>
              <span className="text-[12px] text-muted">{profile.viewAs ? `תצוגה · ${roleLabel}` : roleLabel}</span>
            </span>
          </div>
          <div className="flex gap-2">
            <Link href="/account" className="flex min-h-9 flex-1 items-center justify-center rounded-lg border border-line text-[13px] hover:bg-sand">
              הסיסמה שלי
            </Link>
            <form action="/auth/signout" method="post" className="flex-1">
              <button type="submit" className="min-h-9 w-full rounded-lg border border-line text-[13px] hover:bg-sand">
                התנתקות
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 pt-5 pb-16 lg:px-8 lg:pt-7">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
          {(greet || profile.realRole === "owner") && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {greet ? (
                <div>
                  <h1 className="text-2xl font-bold text-primary lg:text-[28px]">
                    {greeting(now)}, {name.split(" ")[0]}
                  </h1>
                  <p className="text-muted">זה מה שקורה היום.</p>
                </div>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap items-center gap-2">
                {profile.realRole === "owner" && <ViewSwitcher profile={profile} />}
                <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-sm font-medium text-primary shadow-soft">
                  <NavIcon href="/calendar" className="size-4" />
                  {today(now)}
                </span>
              </div>
            </div>
          )}

          <ViewBanner profile={profile} />
          <LiveRefresh />

          {profile.viewAs ? (
            // View only: every field and button on the screen is disabled. Links still work.
            <fieldset disabled className="contents">
              {children}
            </fieldset>
          ) : (
            children
          )}
        </div>
      </main>
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
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-card p-5 shadow-soft">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-primary">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
