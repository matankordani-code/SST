import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEVICE_COOKIE, adminConfigured, createAdminClient } from "@/lib/supabase/admin";

// Quick login from a remembered device: the device's secret cookie is matched
// to a trusted_devices row, and the server signs that user in (no email, no
// password). Works only on a device the owner approved from "הסיסמה שלי".
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/login?device=${reason}`, { status: 303 });
    if (reason === "expired") res.cookies.delete(DEVICE_COOKIE);
    return res;
  };

  const token = request.cookies.get(DEVICE_COOKIE)?.value;
  if (!token || token.length < 32) return fail("expired");
  if (!adminConfigured()) return fail("off");

  const admin = createAdminClient();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: device } = await admin
    .from("trusted_devices")
    .select("id, user_id")
    .eq("token_hash", hash)
    .maybeSingle<{ id: string; user_id: string }>();
  if (!device) return fail("expired");

  const { data: userData } = await admin.auth.admin.getUserById(device.user_id);
  const email = userData?.user?.email;
  if (!email) return fail("expired");

  // A one-time login token for this user (nothing is emailed), redeemed right here.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return fail("error");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) return fail("error");

  await admin.from("trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", device.id);
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
