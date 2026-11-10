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

// Fixed monthly costs set by the owner (break-even line).
export function parseCosts(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
