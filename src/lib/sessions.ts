export const SESSION_STATUSES = ["planned", "held", "cancelled_ontime", "cancelled_late"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: "מתוכנן",
  held: "התקיים",
  cancelled_ontime: "ביטול בזמן",
  cancelled_late: "ביטול מאוחר",
};

// Badge colors per status (text 4.5:1 on its background).
export const STATUS_CLASS: Record<SessionStatus, string> = {
  planned: "bg-[#E3F0F4] text-[#15505F]",
  held: "bg-[#E4F1E6] text-[#22582C]",
  cancelled_ontime: "bg-[#EDE4D3] text-[#4A555A]",
  cancelled_late: "bg-[#FBEBDD] text-[#7A3A0E]",
};

export function isSessionStatus(v: unknown): v is SessionStatus {
  return typeof v === "string" && (SESSION_STATUSES as readonly string[]).includes(v);
}

export type SessionRow = {
  id: string;
  client_id: string;
  therapist_id: string;
  starts_at: string;
  duration_min: number;
  status: SessionStatus;
  price: number;
  series_id: string | null;
  punch_card_id: string | null;
  client: { full_name: string } | null;
  therapist: { display_name: string } | null;
};

export const SESSION_SELECT =
  "id, client_id, therapist_id, starts_at, duration_min, status, price, series_id, punch_card_id, client:clients(full_name), therapist:therapists(display_name)";

export type CardUsage = {
  id: string;
  client_id: string;
  size: number;
  purchased_on: string;
  amount_paid: number;
  paid_note: string | null;
  used: number;
};
