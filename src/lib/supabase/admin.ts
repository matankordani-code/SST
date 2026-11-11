import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only client with the project's secret key (bypasses RLS).
// Used only for the remembered-device quick login. Env: SUPABASE_SECRET_KEY.
export function adminConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const DEVICE_COOKIE = "sst_device";
