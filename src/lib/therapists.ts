export const BUSINESS_STATUS_LABEL = {
  exempt: "עוסק פטור",
  licensed: "עוסק מורשה",
  company: "חברה",
  nonprofit: "עמותה",
} as const;

export const SPLIT_LABEL = {
  split_260_90: "260/90 (מטפל/מרכז)",
  full: "100% למטפל",
  per_lesson: "מדריך גלישה: סכום קבוע לשיעור",
} as const;

export type BusinessStatus = keyof typeof BUSINESS_STATUS_LABEL;
export type Split = keyof typeof SPLIT_LABEL;

// Surf lesson price, VAT included (spec).
export const SURF_LESSON_PRICE = 280;
