// The six roles in the system. Must match the `app_role` enum in supabase/migrations.
export const ROLES = [
  "owner",
  "club_manager",
  "therapist",
  "surf_instructor",
  "client",
  "member",
] as const;

export type Role = (typeof ROLES)[number];

type RoleInfo = {
  label: string;
  path: string;
  // What this screen will hold, per the spec. Shown on the empty screen.
  coming: string[];
};

export const ROLE_INFO: Record<Role, RoleInfo> = {
  owner: {
    label: "בעלים",
    path: "/owner",
    coming: [
      "הכנסות החודש ונקודת איזון",
      "התראות שדורשות פעולה",
      "לוח טיפולים שבועי וחודשי",
      "התחשבנות עם מטפלים והעברת מטופלים",
      "הקליניקה שלי",
    ],
  },
  club_manager: {
    label: "מנהל מועדון",
    path: "/club",
    coming: [
      "לו״ז אימוני קהילה, תפוסה ורשימות המתנה",
      "רשימת מנויים",
      "התראות מועדון",
    ],
  },
  therapist: {
    label: "מטפל",
    path: "/therapist",
    coming: [
      "היום שלי",
      "מטופלים ותיקים אישיים",
      "יומן וקביעת תורים",
      "סיכום חודשי והעלאת חשבונית",
    ],
  },
  surf_instructor: {
    label: "מדריך גלישה",
    path: "/instructor",
    coming: ["יומן שיעורי גלישה ודיווח", "סיכום חודשי והעלאת חשבונית"],
  },
  client: {
    label: "מטופל / הורה",
    path: "/client",
    coming: ["המפגש הבא ויתרה בכרטיסייה", "תשלום", "החשבוניות שלי"],
  },
  member: {
    label: "מנוי",
    path: "/member",
    coming: ["לו״ז שבועי והרשמה לאימונים", "ההתקדמות שלי", "המנוי והחשבוניות"],
  },
};

// Tabs shown under the header, per role. Grows as screens are built.
export const ROLE_NAV: Partial<Record<Role, { href: string; label: string }[]>> = {
  owner: [
    { href: "/owner", label: "ראשי" },
    { href: "/owner/clinic", label: "הקליניקה שלי" },
  ],
  therapist: [{ href: "/therapist", label: "מטופלים" }],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
