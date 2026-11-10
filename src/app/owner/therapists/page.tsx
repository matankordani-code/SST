import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Field, inputClass } from "@/components/field";
import { BUSINESS_STATUS_LABEL, SPLIT_LABEL, type BusinessStatus, type Split } from "@/lib/therapists";
import { updateTherapistAction } from "./actions";
import { AddTherapistForm } from "./add-therapist-form";

export default function TherapistsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

type Row = {
  id: string;
  display_name: string;
  business_status: BusinessStatus;
  split: Split;
  is_active: boolean;
  profile: { email: string | null } | null;
};

async function Content() {
  const profile = await requireRole("owner");
  const supabase = await createClient();
  const [{ data }, { data: invites }] = await Promise.all([
    supabase
      .from("therapists")
      .select("id, display_name, business_status, split, is_active, profile:profiles(email)")
      .order("display_name"),
    supabase.from("invites").select("email, therapist_id"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const inviteBy = new Map((invites ?? []).map((i) => [i.therapist_id, i.email]));

  return (
    <AppShell profile={profile} active="/owner/therapists">
      <Card title="מטפלים">
        <ul className="flex flex-col gap-3">
          {rows.map((t) => {
            const email = t.profile?.email ?? inviteBy.get(t.id) ?? null;
            const pending = !t.profile && inviteBy.has(t.id);
            return (
              <li key={t.id} className="rounded-lg border border-[#EFEAE0] p-3">
                <form action={updateTherapistAction.bind(null, t.id)} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-[15px]">{t.display_name}</strong>
                    {email && (
                      <bdi dir="ltr" className="text-[13px] text-muted">
                        {email}
                      </bdi>
                    )}
                    {pending && (
                      <span className="rounded-md bg-[#FBF3E4] px-2 py-0.5 text-[13px] text-[#6B4A12]">
                        ממתין לכניסה ראשונה
                      </span>
                    )}
                    {!t.is_active && (
                      <span className="rounded-md bg-[#EFEAE0] px-2 py-0.5 text-[13px] text-[#4A555A]">לא פעיל</span>
                    )}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3">
                    <Field label="שם">
                      <input name="display_name" defaultValue={t.display_name} className={inputClass} />
                    </Field>
                    <Field label="סטטוס עוסק">
                      <select name="business_status" defaultValue={t.business_status} className={inputClass + " bg-white"}>
                        {Object.entries(BUSINESS_STATUS_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="חלוקה">
                      <select name="split" defaultValue={t.split} className={inputClass + " bg-white"}>
                        {Object.entries(SPLIT_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" name="is_active" defaultChecked={t.is_active} className="size-5 accent-primary" />
                      פעיל
                    </label>
                    <div>
                      <button type="submit" className="min-h-11 rounded-lg border border-primary bg-white px-4 text-sm text-primary">
                        שמירה
                      </button>
                    </div>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>

      <AddTherapistForm />
    </AppShell>
  );
}
