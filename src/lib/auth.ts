import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/roles";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role | null;
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

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    full_name: data?.full_name ?? null,
    email: data?.email ?? user.email ?? null,
    role: isRole(data?.role) ? data.role : null,
  };
}

// Guards a role screen: anyone with a different role is sent back to "/",
// which routes them to their own screen.
export async function requireRole(role: Role): Promise<Profile> {
  const profile = await getProfile();
  if (profile.role !== role) redirect("/");
  return profile;
}
