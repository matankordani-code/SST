import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VIEW_COOKIE } from "@/lib/view";

// /api/morning: payment notifications from Morning; /pay: pages the payer
// lands on after paying. Neither has a logged-in user.
const PUBLIC_PATHS = ["/login", "/auth", "/api/morning", "/pay", "/sign"];

// Refreshes the Supabase session cookie on every request and sends
// signed-out visitors to /login. Role checks happen on each page (requireRole)
// and in the database (RLS), not here.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // "View as" is view only: refuse every server action while it is on.
  // (Leaving the view is a plain GET to /view, so it is never blocked.)
  if (request.cookies.has(VIEW_COOKIE) && request.method === "POST" && request.headers.has("next-action")) {
    return new NextResponse("View only: return to your own view to make changes.", { status: 403 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
