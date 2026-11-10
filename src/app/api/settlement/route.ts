import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_LABEL } from "@/lib/clients";
import { STATUS_LABEL } from "@/lib/sessions";
import { totals, type SettlementLine } from "@/lib/settlements";
import { dayKey, isMonthKey, timeOf, formatDate } from "@/lib/time";

// Monthly tracking file as CSV (opens in Excel, Hebrew-safe with BOM).
// Access follows RLS: a therapist gets only their own sessions.
export async function GET(request: NextRequest) {
  const m = request.nextUrl.searchParams.get("m");
  const t = request.nextUrl.searchParams.get("t");
  if (!isMonthKey(m) || !t) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data }, { data: th }] = await Promise.all([
    supabase.rpc("settlement_lines", { p_therapist: t, p_month: `${m}-01` }),
    supabase.from("therapists").select("display_name").eq("id", t).maybeSingle(),
  ]);
  const lines = (data ?? []) as SettlementLine[];
  const s = totals(lines);

  const esc = (v: string | number) => {
    const str = String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const rows: (string | number)[][] = [
    ["מטפל", th?.display_name ?? "", "חודש", m],
    ["התקיימו", s.held, "בוטלו", s.cancelled, "למטפל", s.toTherapist, "למרכז", s.toCenter],
    [],
    ["תאריך", "שעה", "מטופל", "סטטוס", "מחיר", "אופן תשלום", "למטפל", "למרכז"],
    ...lines.map((l) => {
      const d = new Date(l.starts_at);
      return [
        formatDate(dayKey(d)),
        timeOf(d),
        l.client_short,
        STATUS_LABEL[l.status],
        l.price,
        PAYMENT_LABEL[l.payment_method],
        l.to_therapist,
        l.to_center,
      ];
    }),
  ];
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const name = `sst-${m}-${(th?.display_name ?? "therapist").replace(/[^\p{L}\p{N}]+/gu, "-")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
