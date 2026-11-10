import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/roles";
import { defaultsFor, parsePerms, type Level, type PermKey, type Perms } from "@/lib/permissions";
import { VIEW_COOKIE, resolveView, type ViewAs } from "@/lib/view";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  // The role and permissions the screens follow. While the owner views as
  // someone, these are that person's.
  role: Role | null;
  perms: Perms;
  // The signed-in user's own role.
  realRole: Role | null;
  // Set while the owner views the system as someone else (view only).
  viewAs: ViewAs | null;
};

// Returns the signed-in user's profile, or sends them to the login page.
export async function getProfile(): Promise<Profile> {
  // Mark as request-time before the Supabase client reads the clock.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data }, { data: rawPerms, error: permsError }, jar] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_permissions"),
    cookies(),
  ]);

  const role = isRole(data?.role) ? data.role : null;
  // Before migration 0013 runs, my_permissions doesn't exist: fall back to the role's defaults.
  const perms = (!permsError && parsePerms(rawPerms)) || defaultsFor(role);

  const base = {
    id: user.id,
    full_name: data?.full_name ?? null,
    email: data?.email ?? user.email ?? null,
    realRole: role,
  };

  // Only the owner may view as someone else; anyone else's cookie is ignored.
  const viewAs = role === "owner" ? await resolveView(supabase, jar.get(VIEW_COOKIE)?.value) : null;
  if (viewAs) return { ...base, role: viewAs.role, perms: viewAs.perms, viewAs };

  return { ...base, role, perms, viewAs: null };
}

// Guards a screen: anyone without one of the given roles is sent back to "/",
// which routes them to their own screen.
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile.role || !roles.includes(profile.role)) redirect("/");
  return profile;
}

// Guards a screen by permission: level 1 = at least own, 2 = everything.
export async function requirePerm(key: PermKey, min: Exclude<Level, 0> = 1): Promise<Profile> {
  const profile = await getProfile();
  if (profile.perms[key] < min) redirect("/");
  return profile;
}

// Guards owner-only tools (switching views, permissions). Uses the real role.
export async function requireRealOwner(): Promise<Profile> {
  const profile = await getProfile();
  if (profile.realRole !== "owner") redirect("/");
  return profile;
}
