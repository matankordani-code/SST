import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";

// Morning POSTs here after a successful payment (notifyUrl).
// The URL carries the request id and a one-off secret token; the database
// function checks the token's hash before recording anything.
export async function POST(request: NextRequest) {
  const r = request.nextUrl.searchParams.get("r");
  const t = request.nextUrl.searchParams.get("t");
  if (!r || !t) return NextResponse.json({ ok: false }, { status: 400 });

  let raw: Record<string, unknown> = {};
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) raw = await request.json();
    else raw = Object.fromEntries((await request.formData()).entries()) as Record<string, unknown>;
  } catch {
    // keep raw empty; the token is what matters
  }

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k] ?? (raw.document as Record<string, unknown> | undefined)?.[k];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return null;
  };

  // No user session here: anonymous client, authorised only by the token.
  const supabase = createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await supabase.rpc("mark_request_paid", {
    p_request_id: r,
    p_token: t,
    p_doc_id: pick("documentId", "docId", "id"),
    p_doc_number: pick("documentNumber", "docNumber", "number"),
    p_raw: raw,
  });

  if (error) {
    console.error("mark_request_paid failed", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (data === "invalid") return NextResponse.json({ ok: false }, { status: 403 });
  return NextResponse.json({ ok: true });
}
