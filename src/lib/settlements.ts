import type { PaymentMethod } from "@/lib/clients";
import type { SessionStatus } from "@/lib/sessions";

export type SettlementLine = {
  session_id: string;
  starts_at: string;
  client_short: string;
  status: SessionStatus;
  price: number;
  payment_method: PaymentMethod;
  to_therapist: number;
  to_center: number;
};

export type SettlementStatus = "open" | "approved" | "invoiced" | "closed";

export type Settlement = {
  therapist_id: string;
  month: string;
  status: SettlementStatus;
  sessions_held: number | null;
  sessions_cancelled: number | null;
  therapist_amount: number | null;
  center_amount: number | null;
  approved_at: string | null;
  invoice_path: string | null;
  invoice_amount: number | null;
  invoice_uploaded_at: string | null;
  closed_at: string | null;
};

export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  open: "פתוח · ממתין לאישור המטפל",
  approved: "אושר · ממתין לחשבונית",
  invoiced: "חשבונית הועלתה · ממתין לסגירה",
  closed: "נסגר ושולם",
};

export function totals(lines: SettlementLine[]) {
  return {
    held: lines.filter((l) => l.status === "held").length,
    cancelled: lines.filter((l) => l.status === "cancelled_ontime" || l.status === "cancelled_late").length,
    unreported: lines.filter((l) => l.status === "planned").length,
    toTherapist: lines.reduce((n, l) => n + l.to_therapist, 0),
    toCenter: lines.reduce((n, l) => n + l.to_center, 0),
  };
}
