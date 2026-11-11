import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only client with the project's secret key (bypasses RLS).
// Used only for the remembered-device quick login. Env: SUPABASE_SECRET_KEY.
// A pasted key often carries a trailing newline or space, so it is trimmed.
function secretKey() {
  return (process.env.SUPABASE_SECRET_KEY ?? "").trim();
}

export function adminConfigured() {
  return secretKey().length > 0;
}

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const DEVICE_COOKIE = "sst_device";
