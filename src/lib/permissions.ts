import type { Role } from "@/lib/roles";

// The permissions board. Must match supabase/migrations/0013_permissions.sql.
// Level: 0 = none, 1 = own only, 2 = everything.
export type Level = 0 | 1 | 2;

export const PERMISSIONS = [
  {
    key: "clients",
    label: "מטופלים ונתוני מעקב",
    hint: "פרטי מטופל, כרטיסיות, תשלומים, דרישות תשלום והוספת מטופל",
    scoped: true,
  },
  { key: "calendar", label: "יומן ודיווח מפגשים", hint: "קביעת מפגשים, הזזה ודיווח התקיים/ביטול", scoped: true },
  { key: "settlements", label: "התחשבנות חודשית", hint: "קובץ המעקב, אישור החודש, חשבונית וסגירה", scoped: true },
  { key: "transfer", label: "העברת מטופל", hint: "העברה למטפל אחר. צריך גם מטופלים: הכול", scoped: false },
  { key: "income", label: "הכנסות", hint: "דשבורד הכנסות, נקודת איזון וייצוא לרואה החשבון", scoped: false },
  { key: "club", label: "ניהול מועדון", hint: "אימונים, מנויים, נוכחות והזמנת מנויים", scoped: false },
  { key: "staff", label: "צוות והגדרות", hint: "מטפלים, הזמנות, ייבוא מהאקסל והגדרות", scoped: false },
] as const;

export type PermKey = (typeof PERMISSIONS)[number]["key"];
export type Perms = Record<PermKey, Level>;

export const PERM_KEYS = PERMISSIONS.map((p) => p.key) as PermKey[];

export const LEVEL_LABEL: Record<Level, string> = { 0: "אין", 1: "שלו", 2: "הכול" };
export const BINARY_LABEL: Record<0 | 2, string> = { 0: "אין", 2: "יש" };

export function isScoped(key: PermKey): boolean {
  return PERMISSIONS.find((p) => p.key === key)?.scoped ?? false;
}

export function levelText(key: PermKey, level: Level): string {
  return isScoped(key) ? LEVEL_LABEL[level] : BINARY_LABEL[level === 0 ? 0 : 2];
}

export function isPermKey(v: unknown): v is PermKey {
  return typeof v === "string" && (PERM_KEYS as string[]).includes(v);
}

export function isLevel(v: unknown): v is Level {
  return v === 0 || v === 1 || v === 2;
}

const NONE: Perms = { clients: 0, calendar: 0, settlements: 0, transfer: 0, income: 0, club: 0, staff: 0 };
const ALL: Perms = { clients: 2, calendar: 2, settlements: 2, transfer: 2, income: 2, club: 2, staff: 2 };

// Same seed as the migration. Used only if the database has no permissions yet.
export const ROLE_DEFAULTS: Record<Role, Perms> = {
  owner: ALL,
  club_manager: { ...NONE, club: 2 },
  therapist: { ...NONE, clients: 1, calendar: 1, settlements: 1 },
  surf_instructor: { ...NONE, clients: 1, calendar: 1, settlements: 1 },
  client: NONE,
  member: NONE,
};

export function defaultsFor(role: Role | null): Perms {
  return role ? ROLE_DEFAULTS[role] : NONE;
}

// Turns the my_permissions() result into a full, safe object.
export function parsePerms(raw: unknown): Perms | null {
  if (!raw || typeof raw !== "object") return null;
  const out = { ...NONE };
  for (const k of PERM_KEYS) {
    const v = Number((raw as Record<string, unknown>)[k]);
    out[k] = isLevel(v) ? v : 0;
  }
  return out;
}

// What the therapeutic file column shows on the board. Not editable.
export const FILE_ACCESS_LABEL: Record<Role, string> = {
  owner: "באישור המטפל",
  club_manager: "אין",
  therapist: "המטופלים שלו",
  surf_instructor: "אין",
  client: "אין",
  member: "אין",
};
