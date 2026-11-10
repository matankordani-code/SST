// Shared types and labels for clients (מטופלים).

export const PAYMENT_METHODS = ["single", "card4", "card10"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  single: "מפגש בודד",
  card4: "כרטיסייה 4",
  card10: "כרטיסייה 10",
};

// Prices from the spec, VAT included.
export const DEFAULT_RATE = 350;
export const CARD_PRICE: Record<"card4" | "card10", number> = {
  card4: 1360,
  card10: 3200,
};

export type ClientRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  age: number | null;
  rate: number;
  planned_sessions: number | null;
  payment_method: PaymentMethod;
  therapist_id: string;
  is_active: boolean;
  payer: { full_name: string; phone: string | null; email: string | null } | null;
};

export const CLIENT_SELECT =
  "id, full_name, phone, email, age, rate, planned_sessions, payment_method, therapist_id, is_active, payer:payers(full_name, phone, email)";

export function formatShekel(n: number) {
  return `${n.toLocaleString("he-IL")} ₪`;
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}
