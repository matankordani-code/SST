import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { ROLE_INFO, isRole, type Role } from "@/lib/roles";
import {
  FILE_ACCESS_LABEL,
  PERMISSIONS,
  isLevel,
  isPermKey,
  type Level,
  type PermKey,
} from "@/lib/permissions";
import { PermCell } from "./perm-cell";
import { resetUserAction } from "./actions";

export default function PermissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

// Roles whose defaults can be edited. The owner always has everything;
// clients and members only see their own screens.
const TEMPLATE_ROLES: Role[] = ["club_manager", "therapist", "surf_instructor"];
const CLIENT_ROLES: Role[] = ["client", "member"];

type Person = { id: string; full_name: string | null; email: string | null; role: Role };

function Lock() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function HeadCell({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <th scope="col" className="px-2 pb-2 text-right align-bottom text-[13px] font-semibold text-muted">
      <span className="block">{children}</span>
      {hint && <span className="block max-w-[150px] text-[11px] font-normal leading-snug text-muted">{hint}</span>}
    </th>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const profile = await requireRole("owner");
  const sp = await searchParams;
  const showAll = sp.all === "1";
  const supabase = await createClient();

  const [{ data: people }, rolePerms, userPerms] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role").not("role", "is", null).order("full_name"),
    supabase.from("role_permissions").select("role, perm, level"),
    supabase.from("user_permissions").select("user_id, perm, level"),
  ]);

  if (rolePerms.error || userPerms.error) {
    return (
      <AppShell profile={profile} active="/owner/permissions">
        <Card title="לוח הרשאות">
          <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
            לוח ההרשאות עוד לא הופעל במסד הנתונים. צריך להריץ את הקובץ supabase/migrations/0013_permissions.sql ב-Supabase
            (SQL Editor → New query → להדביק → Run), ואז לרענן את הדף.
          </p>
        </Card>
      </AppShell>
    );
  }

  // Role defaults as the database holds them (no row = none, as in perm_level()).
  const roleLevel = (role: Role, perm: PermKey): Level => {
    if (role === "owner") return 2;
    const row = (rolePerms.data ?? []).find((r) => r.role === role && r.perm === perm);
    return row && isLevel(row.level) ? row.level : 0;
  };

  const exceptions = new Map<string, Map<PermKey, Level>>();
  for (const r of userPerms.data ?? []) {
    if (!isPermKey(r.perm) || !isLevel(r.level)) continue;
    if (!exceptions.has(r.user_id)) exceptions.set(r.user_id, new Map());
    exceptions.get(r.user_id)!.set(r.perm, r.level);
  }

  const all = ((people ?? []) as { id: string; full_name: string | null; email: string | null; role: string }[])
    .filter((p): p is Person => isRole(p.role));
  const shown = all
    .filter((p) => showAll || !CLIENT_ROLES.includes(p.role) || exceptions.has(p.id))
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
  const hiddenCount = all.length - shown.length;

  return (
    <AppShell profile={profile} active="/owner/permissions">
      <Card title="לוח הרשאות">
        <p className="text-sm text-muted">
          כל תפקיד מקבל הרשאות ברירת מחדל. לכל אדם אפשר לשנות הרשאה בודדת, והשינוי מסומן בצבע. &quot;שלו&quot; = רק המטופלים,
          המפגשים או ההתחשבנות של אותו מטפל. &quot;הכול&quot; = של כל המרכז. ההרשאות נאכפות במסד הנתונים עצמו, ולא רק
          במסך, וכל שינוי נרשם ביומן הגישה.
        </p>
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <Lock />
          <span>
            התיק הטיפולי וסיכומי המפגשים לא נמצאים בלוח: הם פתוחים רק למטפל המטפל, ולך רק כשהמטפל מאשר שיתוף.
          </span>
        </p>
      </Card>

      <Card title="ברירת מחדל לפי תפקיד">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <HeadCell>תפקיד</HeadCell>
                {PERMISSIONS.map((p) => (
                  <HeadCell key={p.key} hint={p.hint}>
                    {p.label}
                  </HeadCell>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEMPLATE_ROLES.map((role) => (
                <tr key={role} className="border-t border-[#EFEAE0]">
                  <th scope="row" className="px-2 py-3 text-right font-semibold">
                    {ROLE_INFO[role].label}
                  </th>
                  {PERMISSIONS.map((p) => {
                    const v = roleLevel(role, p.key);
                    return (
                      <td key={p.key} className="px-2 py-2 align-top">
                        <PermCell
                          key={`${role}-${p.key}-${v}`}
                          kind="role"
                          target={role}
                          perm={p.key}
                          scoped={p.scoped}
                          value={v}
                          label={`${ROLE_INFO[role].label} · ${p.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="הרשאות לפי אדם"
        actions={
          <Link
            href={showAll ? "/owner/permissions" : "/owner/permissions?all=1"}
            className="flex min-h-11 items-center rounded-lg border border-field bg-white px-4 text-sm hover:bg-sand"
          >
            {showAll ? "רק צוות" : `הצגת מטופלים ומנויים${hiddenCount ? ` (${hiddenCount})` : ""}`}
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr>
                <HeadCell>שם</HeadCell>
                {PERMISSIONS.map((p) => (
                  <HeadCell key={p.key}>{p.label}</HeadCell>
                ))}
                <HeadCell>
                  <span className="inline-flex items-center gap-1">
                    <Lock /> תיק טיפולי
                  </span>
                </HeadCell>
                <HeadCell>{""}</HeadCell>
              </tr>
            </thead>
            <tbody>
              {shown.map((person) => {
                const mine = exceptions.get(person.id);
                const isOwnerRow = person.role === "owner";
                return (
                  <tr key={person.id} className="border-t border-[#EFEAE0]">
                    <th scope="row" className="px-2 py-3 text-right align-top font-normal">
                      <span className="block font-semibold">{person.full_name || person.email}</span>
                      <span className="block text-[13px] text-muted">{ROLE_INFO[person.role].label}</span>
                      {person.full_name && person.email && (
                        <bdi dir="ltr" className="block text-xs text-muted">
                          {person.email}
                        </bdi>
                      )}
                    </th>
                    {PERMISSIONS.map((p) => (
                      <td key={p.key} className="px-2 py-2 align-top">
                        {isOwnerRow ? (
                          <span className="inline-flex min-h-10 items-center gap-1 text-muted">
                            <Lock /> {p.scoped ? "הכול" : "יש"}
                          </span>
                        ) : (
                          <PermCell
                            key={`${person.id}-${p.key}-${mine?.get(p.key) ?? "d"}`}
                            kind="user"
                            target={person.id}
                            perm={p.key}
                            scoped={p.scoped}
                            value={mine?.get(p.key) ?? null}
                            inherited={roleLevel(person.role, p.key)}
                            label={`${person.full_name || person.email} · ${p.label}`}
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-2 align-top">
                      <span className="inline-flex min-h-10 items-center text-muted">{FILE_ACCESS_LABEL[person.role]}</span>
                    </td>
                    <td className="px-2 py-2 align-top">
                      {mine && mine.size > 0 && (
                        <form action={resetUserAction.bind(null, person.id)}>
                          <button
                            type="submit"
                            className="min-h-10 whitespace-nowrap rounded-lg border border-field bg-white px-3 text-[13px] hover:bg-sand"
                          >
                            חזרה לתפקיד
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">
          אדם חדש מקבל את ברירת המחדל של התפקיד שלו. את התפקיד עצמו קובעים כשמוסיפים מטפל או מנוי.
        </p>
      </Card>
    </AppShell>
  );
}
