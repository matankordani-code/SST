import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VIEW_COOKIE, parseViewValue } from "@/lib/view";

// Owner switches "view as": /view?as=t:<therapist id> | m:<member id> | off.
// A route handler (not a server action), so it still works while viewing,
// when the proxy blocks server actions.
export async function GET(request: NextRequest) {
  const as = request.nextUrl.searchParams.get("as");
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");

  const back = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!isOwner) return back("/");

  const target = parseViewValue(as);
  if (!target) {
    const res = back("/");
    res.cookies.delete(VIEW_COOKIE);
    return res;
  }

  // "/" opens the first screen the viewed person has.
  const res = back("/");
  res.cookies.set(VIEW_COOKIE, as!, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
