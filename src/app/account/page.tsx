import { Suspense } from "react";
import { getProfile } from "@/lib/auth";
import { AppShell, Card } from "@/components/app-shell";
import { Loading } from "@/components/loading";
import { PasswordForm } from "./password-form";

export default function AccountPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const profile = await getProfile();
  return (
    <AppShell profile={profile} active="/account">
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
