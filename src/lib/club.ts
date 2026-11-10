export type Training = {
  id: string;
  name: string;
  weekday: number; // 0 = Sunday
  start_time: string; // "HH:MM:SS"
  duration_min: number;
  coach: string | null;
  capacity: number;
  is_active: boolean;
};

export type Registration = {
  id: string;
  training_id: string;
  member_id: string;
  on_date: string;
  status: "registered" | "waitlist" | "cancelled";
  attended: boolean | null;
  created_at: string;
  member?: { full_name: string } | null;
};

export const PLAN_LABEL = { community: "מנוי קהילה · 220 ₪ לחודש", storage: "אחסון גלשן · 70 ₪ לחודש" } as const;
export type MemberPlan = keyof typeof PLAN_LABEL;

export const WEEKDAY_LABEL = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export const REGISTER_MESSAGE: Record<string, string> = {
  registered: "נרשמת לאימון.",
  waitlist: "האימון מלא. נכנסת לרשימת ההמתנה, ותעלה אוטומטית אם יתפנה מקום.",
  week_full: "אפשר עד 3 אימונים בשבוע.",
  already: "כבר נרשמת לאימון הזה.",
  past: "האימון הזה כבר עבר.",
  not_member: "המשתמש שלך לא מוגדר כמנוי.",
  bad_date: "תאריך לא תקין לאימון הזה.",
};

export const hhmm = (t: string) => t.slice(0, 5);
