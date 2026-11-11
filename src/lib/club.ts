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

// Technique scores the coach gives (1–5), as in the prototype.
export const SKILLS = ["takeoff", "paddling", "wave_reading", "turns"] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_LABEL: Record<Skill, string> = {
  takeoff: "טייק-אוף",
  paddling: "חתירה",
  wave_reading: "קריאת גלים",
  turns: "פניות",
};
export const isSkill = (v: unknown): v is Skill => typeof v === "string" && (SKILLS as readonly string[]).includes(v);

export type SkillRow = { skill: Skill; score: number; scored_on: string };
export type Goal = { id: string; text: string; done: boolean };

// Per skill: the score about a month ago (or the first one) and the latest.
export function skillProgress(rows: SkillRow[], monthAgo: string): { skill: Skill; from: number | null; to: number | null }[] {
  return SKILLS.map((skill) => {
    const mine = rows.filter((r) => r.skill === skill).sort((a, b) => a.scored_on.localeCompare(b.scored_on));
    if (mine.length === 0) return { skill, from: null, to: null };
    const before = [...mine].reverse().find((r) => r.scored_on <= monthAgo) ?? mine[0];
    return { skill, from: before.score, to: mine[mine.length - 1].score };
  });
}

export const hhmm =(t: string) => t.slice(0, 5);
