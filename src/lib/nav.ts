import type { Profile } from "@/lib/auth";
import { ROLE_NAV } from "@/lib/roles";

export type Tab = { href: string; label: string };

// Tabs under the header. Staff tabs follow the permissions board,
// so a permission given or taken away shows up (or disappears) here.
export function navFor(profile: Pick<Profile, "role" | "perms">): Tab[] {
  const { role, perms: p } = profile;
  if (!role) return [];
  if (role === "client" || role === "member") return ROLE_NAV[role] ?? [];

  const isOwner = role === "owner";
  const teaches = role === "therapist" || role === "surf_instructor";
  const instructor = role === "surf_instructor";
  const tabs: Tab[] = [];

  if (p.clients === 2) tabs.push({ href: "/owner", label: "ראשי" });
  if (p.calendar >= 1) {
    tabs.push({ href: "/today", label: "היום שלי" });
    tabs.push({ href: "/calendar", label: instructor ? "יומן שיעורים" : "יומן" });
  }
  if (isOwner) tabs.push({ href: "/owner/clinic", label: "הקליניקה שלי" });
  if (teaches && p.clients >= 1) tabs.push({ href: "/therapist", label: instructor ? "תלמידים" : "מטופלים" });
  if (teaches && p.settlements >= 1) tabs.push({ href: "/month", label: "סיכום חודשי" });
  if (p.club === 2) tabs.push({ href: "/club", label: "מועדון" });
  if (p.income === 2) tabs.push({ href: "/owner/income", label: "הכנסות" });
  if (p.settlements === 2) tabs.push({ href: "/owner/settlements", label: "התחשבנות" });
  if (p.staff === 2) tabs.push({ href: "/owner/therapists", label: "מטפלים" });
  if (isOwner) tabs.push({ href: "/owner/permissions", label: "הרשאות" });
  if (p.staff === 2) tabs.push({ href: "/owner/settings", label: "הגדרות" });

  return tabs;
}
