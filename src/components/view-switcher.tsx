import Link from "next/link";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_INFO } from "@/lib/roles";
import { VIEW_PREFIX } from "@/lib/view";

// Owner only: pick whose eyes to see the system through. A plain GET form to
// /view, so it works with no JavaScript and while server actions are blocked.
export async function ViewSwitcher({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const [{ data: therapists }, { data: members }, { data: clients }] = await Promise.all([
    supabase
      .from("therapists")
      .select("id, display_name, split, profile:profiles(role)")
      .eq("is_active", true)
      .order("display_name"),
    supabase.from("members").select("id, full_name").eq("is_active", true).order("full_name"),
    supabase.from("clients").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  type T = { id: string; display_name: string; split: string; profile: { role: string | null } | null };
  const staff = ((therapists ?? []) as unknown as T[]).filter((t) => t.profile?.role !== "owner");
  const therapistList = staff.filter((t) => t.split !== "per_lesson");
  const instructorList = staff.filter((t) => t.split === "per_lesson");
  const memberList = (members ?? []) as { id: string; full_name: string }[];
  const clientList = (clients ?? []) as { id: string; full_name: string }[];

  const current = profile.viewAs ? `${VIEW_PREFIX[profile.viewAs.kind]}:${profile.viewAs.id}` : "off";

  return (
    <form action="/view" method="get" className="flex flex-wrap items-center gap-2">
      <label htmlFor="view-as" className="text-sm text-muted">
        תצוגה
      </label>
      <select
        id="view-as"
        name="as"
        defaultValue={current}
        className="min-h-10 max-w-[220px] rounded-lg border border-field bg-white px-2 text-sm"
      >
        <option value="off">שלי · דשבורד הבעלים</option>
        {therapistList.length > 0 && (
          <optgroup label="מטפלים">
            {therapistList.map((t) => (
              <option key={t.id} value={`t:${t.id}`}>
                {t.display_name}
              </option>
            ))}
          </optgroup>
        )}
        {instructorList.length > 0 && (
          <optgroup label="מדריכי גלישה">
            {instructorList.map((t) => (
              <option key={t.id} value={`t:${t.id}`}>
                {t.display_name}
              </option>
            ))}
          </optgroup>
        )}
        {clientList.length > 0 && (
          <optgroup label="מטופלים / הורים">
            {clientList.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.full_name}
              </option>
            ))}
          </optgroup>
        )}
        {memberList.length > 0 && (
          <optgroup label="מנויים">
            {memberList.map((m) => (
              <option key={m.id} value={`m:${m.id}`}>
                {m.full_name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button type="submit" className="min-h-10 rounded-lg border border-primary bg-white px-3 text-sm text-primary hover:bg-sand">
        הצג
      </button>
    </form>
  );
}

// Shown on every screen while viewing as someone.
export function ViewBanner({ profile }: { profile: Profile }) {
  if (!profile.viewAs) return null;
  const roleLabel = profile.role ? ROLE_INFO[profile.role].label : "";
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B07A1E] bg-[#FBF3E4] px-4 py-3 text-[15px] text-[#6B4A12]"
    >
      <span>
        אתה רואה את המערכת כמו <strong>{profile.viewAs.name}</strong> ({roleLabel}). תצוגה בלבד: שמירה ופעולות חסומות.
      </span>
      <Link
        href="/view?as=off"
        className="flex min-h-10 items-center rounded-lg bg-[#6B4A12] px-4 text-sm font-semibold text-white hover:bg-[#553a0e]"
      >
        חזרה לתצוגה שלי
      </Link>
    </div>
  );
}
