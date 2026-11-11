"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code" | "password";

// quick: this device was approved for one-tap login (it holds the device cookie).
export function LoginForm({ quick, notice }: { quick: boolean; notice?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    // Only existing users, or people the owner invited, can sign in.
    // A new account is created only for an invited email.
    const { data: allowed } = await supabase.rpc("login_allowed", { p_email: email.trim() });
    if (!allowed) {
      setBusy(false);
      setError("המייל הזה לא רשום במערכת. פנה למתניה כדי שיפתח לך משתמש.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: allowed === "invited",
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setBusy(false);
    if (error) {
      setError(
        error.status === 429
          ? "נשלחו יותר מדי מיילים. נסה שוב בעוד כמה דקות."
          : "לא הצלחנו לשלוח קוד למייל הזה. ודא שהכתובת נכונה ושיש לך משתמש במערכת.",
      );
      return;
    }
    setStep("code");
  }

  // Password sign-in: for people who set a password in "הסיסמה שלי".
  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(
        error.status === 429
          ? "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות."
          : "המייל או הסיסמה שגויים. אם עוד לא קבעת סיסמה, היכנס עם קוד במייל וקבע אותה במסך \"הסיסמה שלי\".",
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError("הקוד שגוי או שפג תוקפו. נסה שוב או בקש קוד חדש.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <h1 className="text-center text-2xl font-bold">
          <bdi dir="ltr">SST™</bdi> · מערכת המרכז
        </h1>

        {notice && (
          <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
            {notice}
          </p>
        )}

        {quick && (
          <form action="/auth/device" method="post" className="flex flex-col gap-2">
            <button
              type="submit"
              className="min-h-14 rounded-[12px] bg-primary text-lg font-bold text-white hover:bg-primary-dark"
            >
              כניסה מהירה
            </button>
            <p className="text-center text-[13px] text-muted">המכשיר הזה אושר לכניסה בלחיצה. אפשר גם להיכנס רגיל למטה.</p>
          </form>
        )}

        <form
          onSubmit={step === "email" ? sendCode : step === "code" ? verifyCode : signInWithPassword}
          className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-7"
        >
          <h2 className="text-xl font-bold">כניסה למערכת</h2>

          {step === "email" || step === "password" ? (
            <>
              <p className="text-sm text-muted">
                {step === "email"
                  ? "הזן את כתובת המייל שלך, ונשלח אליך קוד כניסה."
                  : "הזן את המייל ואת הסיסמה שקבעת."}
              </p>
              <label className="flex flex-col gap-1 text-sm text-muted">
                כתובת מייל
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="min-h-12 rounded-lg border border-field px-3 text-right text-base text-ink"
                />
              </label>
              {step === "password" && (
                <label className="flex flex-col gap-1 text-sm text-muted">
                  סיסמה
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    className="min-h-12 rounded-lg border border-field px-3 text-right text-base text-ink"
                  />
                </label>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                שלחנו מייל ל-<bdi dir="ltr">{email}</bdi> עם קוד כניסה. הזן אותו
                כאן, או לחץ על הקישור שבמייל.
              </p>
              <label className="flex flex-col gap-1 text-sm text-muted">
                קוד כניסה
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{6,10}"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  dir="ltr"
                  className="min-h-12 rounded-lg border border-field px-3 text-center text-lg tracking-[6px] text-ink"
                />
              </label>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="min-h-12 rounded-[10px] bg-primary text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {busy ? "רגע…" : step === "email" ? "שלח קוד" : "כניסה"}
          </button>

          {step !== "code" && (
            <button
              type="button"
              onClick={() => {
                setStep(step === "email" ? "password" : "email");
                setPassword("");
                setError(null);
              }}
              className="min-h-11 text-sm text-primary underline"
            >
              {step === "email" ? "כניסה עם סיסמה" : "כניסה עם קוד במייל"}
            </button>
          )}

          {step === "code" && (
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="text-sm text-primary underline"
            >
              החלפת מייל או שליחה מחדש
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
