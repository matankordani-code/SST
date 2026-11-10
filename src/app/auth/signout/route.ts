import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VIEW_COOKIE } from "@/lib/view";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(`${request.nextUrl.origin}/login`, { status: 303 });
  res.cookies.delete(VIEW_COOKIE);
  return res;
}
