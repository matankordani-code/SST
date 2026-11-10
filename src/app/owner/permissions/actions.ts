"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isRole } from "@/lib/roles";
import { isLevel, isPermKey, isScoped } from "@/lib/permissions";

export type SaveResult = { error?: string };

function valid(perm: string, level: number | null): boolean {
  if (!isPermKey(perm)) return false;
  if (level === null) return true;
  if (!isLevel(level)) return false;
  return level !== 1 || isScoped(perm);
}

// One person's exception. null = back to the role's default.
export async function setUserPermAction(userId: string, perm: string, level: number | null): Promise<SaveResult> {
  await requireRole("owner");
  if (!valid(perm, level)) return { error: "ערך לא תקין." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_permission", { p_user: userId, p_perm: perm, p_level: level });
  if (error) return { error: "השמירה נכשלה." };
  refresh();
  return {};
}

// The default for everyone in a role (people with an exception keep it).
export async function setRolePermAction(role: string, perm: string, level: number): Promise<SaveResult> {
  await requireRole("owner");
  if (!isRole(role) || role === "owner" || !valid(perm, level)) return { error: "ערך לא תקין." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_role_permission", { p_role: role, p_perm: perm, p_level: level });
  if (error) return { error: "השמירה נכשלה." };
  refresh();
  return {};
}

// Drop all of a person's exceptions.
export async function resetUserAction(userId: string) {
  await requireRole("owner");
  const supabase = await createClient();
  await supabase.rpc("reset_user_permissions", { p_user: userId });
  refresh();
}
