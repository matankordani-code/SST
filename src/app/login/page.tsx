import { Suspense } from "react";
import { cookies } from "next/headers";
import { DEVICE_COOKIE } from "@/lib/supabase/admin";
import { LoginForm } from "./login-form";

const NOTICES: Record<string, string> = {
  expired: "הכניסה המהירה כבר לא פעילה במכשיר הזה. היכנס רגיל, ואפשר לאשר את המכשיר מחדש ב\"הסיסמה שלי\".",
  off: "הכניסה המהירה עוד לא הופעלה בשרת. היכנס רגיל בינתיים.",
  error: "הכניסה המהירה נכשלה. נסה שוב, או היכנס רגיל.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<LoginForm quick={false} />}>
      <WithDevice searchParams={searchParams} />
    </Suspense>
  );
}

// Shows the "כניסה מהירה" button only on a device the owner approved.
async function WithDevice({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [jar, sp] = await Promise.all([cookies(), searchParams]);
  const reason = typeof sp.device === "string" ? sp.device : undefined;
  return <LoginForm quick={jar.has(DEVICE_COOKIE) && reason !== "expired"} notice={reason ? NOTICES[reason] : undefined} />;
}
