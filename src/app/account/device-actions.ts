"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { refresh } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEVICE_COOKIE, adminConfigured, createAdminClient } from "@/lib/supabase/admin";

export type DeviceState = { error?: string; ok?: string } | undefined;

// The owner approves this device for one-tap login (pilot convenience).
export async function rememberDeviceAction(): Promise<DeviceState> {
  const profile = await getProfile();
  if (profile.realRole !== "owner" || profile.viewAs) return { error: "רק הבעלים יכול לאשר מכשיר לכניסה מהירה." };
  if (!adminConfigured()) return { error: "חסר מפתח SUPABASE_SECRET_KEY ב-Vercel. בלעדיו הכניסה המהירה לא עובדת." };

  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const ua = (await headers()).get("user-agent") ?? "";
  const label =
    (/(Windows|Mac OS X|iPhone|iPad|Android|Linux)/.exec(ua)?.[1] ?? "מכשיר") +
    " · " +
    (/(Edg|Chrome|Firefox|Safari)\//.exec(ua)?.[1]?.replace("Edg", "Edge") ?? "דפדפן");

  const { error } = await createAdminClient().from("trusted_devices").insert({ user_id: profile.id, token_hash: hash, label });
  if (error) return { error: "השמירה נכשלה. ודא שמיגרציה 0016 הורצה ב-Supabase." };

  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  refresh();
  return { ok: "המכשיר נשמר. מעכשיו במסך הכניסה יופיע כפתור \"כניסה מהירה\"." };
}

// Revoke a remembered device (its button stops working at once).
export async function forgetDeviceAction(deviceId: string) {
  const supabase = await createClient();
  await supabase.from("trusted_devices").delete().eq("id", deviceId);
  refresh();
}
