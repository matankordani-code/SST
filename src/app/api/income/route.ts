import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_LABEL, type PaymentMethod } from "@/lib/clients";
import { STATUS_LABEL, type SessionStatus } from "@/lib/sessions";
import { addMonths, dayKey, formatDate, isDayKey, israelToUtc, isMonthKey, timeOf } from "@/lib/time";

type Row = {
  starts_at: string;
  status: SessionStatus;
  price: number;
  client: { full_name: string; payment_method: PaymentMethod } | null;
  therapist: { display_name: string; split: string; per_lesson_pay: number | null } | null;
};

type IncomeLine = {
  starts_at: string;
  status: SessionStatus;
  price: number;
  client_name: string;
  payment_method: PaymentMethod;
  therapist_name: string;
  split: string;
  per_lesson_pay: number | null;
};

// All reported sessions of a month, for the accountant (needs the "income" permission).
export async function GET(request: NextRequest) {
  const m = request.nextUrl.searchParams.get("m");
  if (!isMonthKey(m)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  // Before migration 0013, can() doesn't exist: fall back to the owner check.
  const perm = await supabase.rpc("can", { p_perm: "income", p_level: 2 });
  const allowed = perm.error ? (await supabase.rpc("is_owner")).data : perm.data;
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const from = `${m}-01`;
  const to = `${addMonths(m, 1)}-01`;
  if (!isDayKey(from) || !isDayKey(to)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const fromUtc = israelToUtc(from, "00:00").toISOString();
  const toUtc = israelToUtc(to, "00:00").toISOString();

  let rows: Row[];
  const viaRpc = await supabase.rpc("income_sessions", { p_from: fromUtc, p_to: toUtc });
  if (!viaRpc.error) {
    rows = ((viaRpc.data ?? []) as IncomeLine[]).map((r) => ({
      starts_at: r.starts_at,
      status: r.status,
      price: r.price,
      client: { full_name: r.client_name, payment_method: r.payment_method },
      therapist: { display_name: r.therapist_name, split: r.split, per_lesson_pay: r.per_lesson_pay },
    }));
  } else {
    const { data } = await supabase
      .from("sessions")
      .select("starts_at, status, price, client:clients(full_name, payment_method), therapist:therapists(display_name, split, per_lesson_pay)")
      .in("status", ["held", "cancelled_late"])
      .gte("starts_at", fromUtc)
      .lt("starts_at", toUtc)
      .order("starts_at");
    rows = (data ?? []) as unknown as Row[];
  }

  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let billed = 0, staff = 0;
  const lines = rows.map((r) => {
    const split = r.therapist?.split;
    const toStaff =
      r.status !== "held" || split === "full"
        ? 0
        : Math.min(split === "per_lesson" ? (r.therapist?.per_lesson_pay ?? 100) : 260, r.price);
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
