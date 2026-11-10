"use server";

import { refresh } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveCostsAction(fd: FormData) {
  await requirePerm("income", 2);
  const n = Math.max(0, Math.round(Number(fd.get("costs")) || 0));
  const supabase = await createClient();
  await supabase.from("app_settings").upsert({ key: "monthly_costs", value: n, updated_at: new Date().toISOString() });
  refresh();
}
