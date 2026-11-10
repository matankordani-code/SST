import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_LABEL, type PaymentMethod } from "@/lib/clients";
import { STATUS_LABEL, type SessionStatus } from "@/lib/sessions";
import { addMonths, dayKey, formatDate, isDayKey, israelToUtc, isMonthKey, timeOf } from "@/lib/time";

// All reported sessions of a month, for the accountant (owner only, via RLS + role check).
export async function GET(request: NextRequest) {
  const m = request.nextUrl.searchParams.get("m");
  if (!isMonthKey(m)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (!isOwner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const from = `${m}-01`;
  const to = `${addMonths(m, 1)}-01`;
  if (!isDayKey(from) || !isDayKey(to)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { data } = await supabase
    .from("sessions")
    .select("starts_at, status, price, client:clients(full_name, payment_method), therapist:therapists(display_name, split)")
    .in("status", ["held", "cancelled_late"])
    .gte("starts_at", israelToUtc(from, "00:00").toISOString())
    .lt("starts_at", israelToUtc(to, "00:00").toISOString())
    .order("starts_at");

  type Row = {
    starts_at: string;
    status: SessionStatus;
    price: number;
    client: { full_name: string; payment_method: PaymentMethod } | null;
    therapist: { display_name: string; split: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let billed = 0, staff = 0;
  const lines = rows.map((r) => {
    const toStaff = r.status === "held" && r.therapist?.split !== "full" ? Math.min(260, r.price) : 0;
    billed += r.price;
    staff += toStaff;
    const d = new Date(r.starts_at);
    return [
      formatDate(dayKey(d)), timeOf(d), r.therapist?.display_name ?? "", r.client?.full_name ?? "",
      STATUS_LABEL[r.status], r.client ? PAYMENT_LABEL[r.client.payment_method] : "", r.price, toStaff, r.price - toStaff,
    ];
  });
  const table: (string | number)[][] = [
    ["חודש", m, "סה״כ חיובים", billed, "למטפלים", staff, "למרכז", billed - staff],
    [],
    ["תאריך", "שעה", "מטפל", "מטופל", "סטטוס", "אופן תשלום", "מחיר", "למטפל", "למרכז"],
    ...lines,
  ];
  const csv = "﻿" + table.map((r) => r.map(esc).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sst-income-${m}.csv"`,
    },
  });
}
