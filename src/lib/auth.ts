import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/roles";
import { defaultsFor, parsePerms, type Level, type PermKey, type Perms } from "@/lib/permissions";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role | null;
  // What this user may do, from the permissions board.
  perms: Perms;
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

  const [{ data }, { data: rawPerms, error: permsError }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);

  const role = isRole(data?.role) ? data.role : null;
  // Before migration 0013 runs, my_permissions doesn't exist: fall back to the role's defaults.
  const perms = (!permsError && parsePerms(rawPerms)) || defaultsFor(role);

  return {
    id: user.id,
    full_name: data?.full_name ?? null,
    email: data?.email ?? user.email ?? null,
    role,
    perms,
  };
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
