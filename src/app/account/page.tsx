import { Suspense } from "react";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEVICE_COOKIE } from "@/lib/supabase/admin";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { formatDateTime } from "@/lib/time";
import { PasswordForm } from "./password-form";
import { RememberDevice } from "./remember-device";
import { forgetDeviceAction } from "./device-actions";

export default function AccountPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

type Device = { id: string; label: string | null; created_at: string; last_used_at: string | null };

async function Content() {
  const profile = await getProfile();
  const isOwner = profile.realRole === "owner" && !profile.viewAs;

  const [{ data }, jar] = await Promise.all([
    isOwner
      ? (await createClient()).from("trusted_devices").select("id, label, created_at, last_used_at").order("created_at")
      : Promise.resolve({ data: [] }),
    cookies(),
  ]);
  const devices = (data ?? []) as Device[];

  return (
    <AppShell profile={profile} active="/account">
      {isOwner && (
        <Card title="כניסה מהירה בלחיצה">
          <p className="text-sm text-muted">
            מאשרים את המכשיר פעם אחת, ומאז במסך הכניסה שלו מופיע כפתור &quot;כניסה מהירה&quot;, בלי מייל ובלי סיסמה. הכפתור עובד רק
            במכשיר שאושר. מומלץ רק למחשב או לטלפון האישי שלך, ולבטל מכשיר שאבד או נמכר.
          </p>
          <RememberDevice remembered={jar.has(DEVICE_COOKIE)} />
          {devices.length > 0 && (
            <ul className="flex flex-col gap-2">
              {devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <span>
                    <strong>{d.label ?? "מכשיר"}</strong> · אושר {formatDateTime(d.created_at)}
                    {d.last_used_at ? ` · כניסה אחרונה ${formatDateTime(d.last_used_at)}` : ""}
                  </span>
                  <form action={forgetDeviceAction.bind(null, d.id)}>
                    <button type="submit" className="min-h-10 rounded-lg border border-field bg-white px-3 text-[13px] hover:bg-sand">
                      ביטול
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title="הסיסמה שלי">
        <p className="text-sm text-muted">
          אפשר לקבוע סיסמה כדי להיכנס בלי לחכות לקוד במייל: במסך הכניסה בוחרים &quot;כניסה עם סיסמה&quot;. הכניסה עם קוד
          במייל ממשיכה לעבוד כרגיל.
        </p>
        {profile.viewAs ? (
          <p className="text-sm text-muted">כדי לשנות סיסמה, חזור קודם לתצוגה שלך.</p>
        ) : (
          <PasswordForm />
        )}
      </Card>
    </AppShell>
  );
}
