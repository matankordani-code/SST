export type MonthIncome = {
  month: string; // "YYYY-MM-01"
  billed: number;
  to_staff: number;
  to_center: number;
  held: number;
  late: number;
  surf_billed: number;
  surf_center: number;
};

// income_sources(): money in by source (migration 0017).
export type IncomeSources = {
  month: string;
  single_billed: number;
  single_count: number;
  card_sales: number;
  card_count: number;
  to_staff: number;
  held: number;
};

// Fixed monthly costs set by the owner (break-even line).
export function parseCosts(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
