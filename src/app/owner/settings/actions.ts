"use server";

import { refresh } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Where sessions take place: shown in the client portal and the 20:00 reminder.
export async function saveLocationAction(fd: FormData) {
  await requirePerm("staff", 2);
  const value = String(fd.get("session_location") ?? "").trim().slice(0, 120);
  const supabase = await createClient();
  await supabase.from("app_settings").upsert({ key: "session_location", value, updated_at: new Date().toISOString() });
  refresh();
}
