import type { CardUsage } from "@/lib/sessions";
import { formatDate } from "@/lib/time";

export type CardStatus = {
  text: string; // "3 מתוך 10 נוצלו · נכון ל-12.5.2027"
  remaining: number; // across all cards
  renew: boolean; // one left (or none) → time to renew
};

// Summarises a client's punch cards, per the spec's display rule.
export function cardStatus(cards: CardUsage[], asOf: string): CardStatus | null {
  if (cards.length === 0) return null;
  const sorted = [...cards].sort((a, b) => a.purchased_on.localeCompare(b.purchased_on));
  const current = sorted.find((c) => c.used < c.size) ?? sorted[sorted.length - 1];
  const remaining = sorted.reduce((n, c) => n + Math.max(0, c.size - c.used), 0);
  return {
    text: `${current.used} מתוך ${current.size} נוצלו · נכון ל-${formatDate(asOf)}`,
    remaining,
    renew: remaining <= 1,
  };
}
