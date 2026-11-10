import type { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { defaultsFor, isLevel, isPermKey, type Perms } from "@/lib/permissions";

// "View as": the owner sees the system exactly as one therapist / instructor /
// member sees it. View only: the proxy blocks every server action meanwhile.
export const VIEW_COOKIE = "sst_view";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ViewKind = "therapist" | "member" | "client";

export type ViewAs = {
  kind: ViewKind;
  // therapists.id, members.id or clients.id
  id: string;
  name: string;
  role: Role;
  perms: Perms;
};

// Matches no row: filters "own only" when there is no own therapist.
export const NO_ID = "00000000-0000-0000-0000-000000000000";

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cookie value: "t:<therapist id>", "m:<member id>" or "c:<client id>".
export const VIEW_PREFIX: Record<ViewKind, string> = { therapist: "t", member: "m", client: "c" };

export function parseViewValue(v: string | undefined | null): { kind: ViewKind; id: string } | null {
  if (!v) return null;
  const [k, id] = v.split(":");
  if (!UUID.test(id ?? "")) return null;
  if (k === "t") return { kind: "therapist", id };
  if (k === "m") return { kind: "member", id };
  if (k === "c") return { kind: "client", id };
  return null;
}

// The viewed person's permissions: role default, then their own exceptions.
async function permsFor(supabase: Supabase, role: Role, profileId: string | null): Promise<Perms> {
  const [rp, up] = await Promise.all([
    supabase.from("role_permissions").select("perm, level").eq("role", role),
    profileId
      ? supabase.from("user_permissions").select("perm, level").eq("user_id", profileId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rp.error) return defaultsFor(role);
  const out: Perms = { ...defaultsFor(null) };
  for (const rows of [rp.data ?? [], up.data ?? []]) {
    for (const r of rows as { perm: string; level: number }[]) {
      if (isPermKey(r.perm) && isLevel(r.level)) out[r.perm] = r.level;
    }
  }
  return out;
}

// Reads who the owner is viewing as. Only call for the real owner.
export async function resolveView(supabase: Supabase, value: string | undefined): Promise<ViewAs | null> {
  const v = parseViewValue(value);
  if (!v) return null;

  if (v.kind === "therapist") {
    const { data } = await supabase
      .from("therapists")
      .select("id, display_name, split, profile_id, profile:profiles(role)")
      .eq("id", v.id)
      .maybeSingle<{ id: string; display_name: string; split: string; profile_id: string | null; profile: { role: Role | null } | null }>();
    if (!data || data.profile?.role === "owner") return null;
    const role: Role = data.split === "per_lesson" ? "surf_instructor" : "therapist";
    return { kind: "therapist", id: data.id, name: data.display_name, role, perms: await permsFor(supabase, role, data.profile_id) };
  }

  if (v.kind === "client") {
    const { data } = await supabase.from("clients").select("id, full_name").eq("id", v.id).maybeSingle<{ id: string; full_name: string }>();
    if (!data) return null;
    return { kind: "client", id: data.id, name: data.full_name, role: "client", perms: defaultsFor("client") };
  }

  const { data } = await supabase
    .from("members")
    .select("id, full_name, profile_id")
    .eq("id", v.id)
    .maybeSingle<{ id: string; full_name: string; profile_id: string | null }>();
  if (!data) return null;
  return { kind: "member", id: data.id, name: data.full_name, role: "member", perms: defaultsFor("member") };
}

// The therapist whose screens are shown: the viewed one, or the signed-in user.
export async function myTherapistId(profile: { viewAs: ViewAs | null }, supabase: Supabase): Promise<string | null> {
  if (profile.viewAs) return profile.viewAs.kind === "therapist" ? profile.viewAs.id : null;
  const { data } = await supabase.rpc("my_therapist_id");
  return (data as string | null) ?? null;
}
