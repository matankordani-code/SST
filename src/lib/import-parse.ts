// Parses one month tab of the existing payments spreadsheet into client rows.
// Runs in the browser; nothing leaves the device until the owner confirms.

import type { PaymentMethod } from "@/lib/clients";

export type ImportRow = {
  include: boolean;
  name: string;
  payer: string; // "" = pays for themself
  rate: number;
  method: PaymentMethod;
  used: number; // sessions already used on the current card
  raw: string; // original payment-method text, for the preview
};

type Cell = string | number | boolean | Date | null | undefined;

const text = (c: Cell) => (c == null ? "" : String(c)).trim();

function findCol(header: string[], ...keys: string[]) {
  return header.findIndex((h) => keys.some((k) => h.includes(k)));
}

// "אלון (אורנה)" → client "אלון", payer "אורנה".
// Without parentheses the whole cell is the client, e.g. a couple
// "צביקי \ אמנון" → one client "צביקי ואמנון", paying for themselves.
export function splitName(v: string): { name: string; payer: string } {
  const m = v.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (m) return { name: m[1].trim(), payer: m[2].trim() };
  return { name: v.replace(/\s*[\\/]\s*/g, " ו").trim(), payer: "" };
}

// "כרטיסייה 6-10 נכון ל3.11" → card10, 6 used. Empty → single.
export function parseMethod(v: string): { method: PaymentMethod; used: number } {
  const m = v.match(/(\d{1,2})\s*-\s*(4|10)(?!\d)/);
  if (m) {
    const size = Number(m[2]);
    return { method: size === 4 ? "card4" : "card10", used: Math.min(Number(m[1]), size) };
  }
  if (/כרטיסי/.test(v)) return { method: /10/.test(v) ? "card10" : "card4", used: 0 };
  return { method: "single", used: 0 };
}

function parseRate(c: Cell): number {
  if (typeof c === "number") return Math.round(c);
  const n = Number(text(c).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 350;
}

export function parseSheet(data: Cell[][]): { rows: ImportRow[]; error?: string } {
  const headerIdx = data.findIndex((r) => r.some((c) => text(c).includes("שם מטופל")));
  if (headerIdx < 0) return { rows: [], error: "לא נמצאה עמודת \"שם מטופל\" בלשונית הזו." };
  const header = data[headerIdx].map(text);
  const cName = findCol(header, "שם מטופל");
  const cRate = findCol(header, "תעריף");
  const cMethod = findCol(header, "אופן תשלום");

  const rows: ImportRow[] = [];
  for (const r of data.slice(headerIdx + 1)) {
    const nameCell = text(r[cName]);
    if (!nameCell) continue;
    if (/^סה.?כ/.test(nameCell)) break;
    const { name, payer } = splitName(nameCell);
    const raw = cMethod >= 0 ? text(r[cMethod]) : "";
    const { method, used } = parseMethod(raw);
    rows.push({
      include: true,
      name,
      payer,
      rate: cRate >= 0 ? parseRate(r[cRate]) : 350,
      method,
      used,
      raw,
    });
  }
  return { rows };
}
