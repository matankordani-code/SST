import { Suspense } from "react";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { Field, inputClass } from "@/components/field";
import { saveTextsAction } from "@/app/declarations/actions";
import { saveLocationAction } from "./actions";

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await requirePerm("staff", 2);
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value").in("key", ["health_text", "parental_text", "session_location"]);
  const get = (k: string) => {
    const v = data?.find((r) => r.key === k)?.value;
    return typeof v === "string" ? v : "";
  };

  return (
    <AppShell profile={profile} active="/owner/settings">
      <Card title="מקום המפגשים">
        <form action={saveLocationAction} className="flex flex-wrap items-end gap-3">
          <Field label="מוצג למטופלים באזור האישי ובתזכורת">
            <input name="session_location" defaultValue={get("session_location")} placeholder="למשל: חוף זבולון, הרצליה" className={inputClass + " min-w-72"} />
          </Field>
          <button type="submit" className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white">
            שמירה
          </button>
        </form>
      </Card>
      <Card title="נוסחי הצהרות">
        <form action={saveTextsAction} className="flex flex-col gap-4">
          <Field label="הצהרת בריאות">
            <textarea name="health_text" rows={10} defaultValue={get("health_text")} className={inputClass + " py-2.5"} />
          </Field>
          <Field label="הסכמת הורה (לקטינים)">
            <textarea name="parental_text" rows={8} defaultValue={get("parental_text")} className={inputClass + " py-2.5"} />
          </Field>
          <p className="text-[13px] text-muted">
            הדבק כאן את הנוסחים שאתה משתמש בהם היום. מסמך שכבר נשלח לחתימה שומר את הנוסח שהיה בזמן השליחה.
          </p>
          <div>
            <button type="submit" className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white">
              שמירה
            </button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
