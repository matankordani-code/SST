"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Sets (or changes) the signed-in user's password. After that, the login
// screen's "כניסה עם סיסמה" works without an emailed code.
export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) return setMessage({ ok: false, text: "הסיסמה צריכה להיות באורך 8 תווים לפחות." });
    if (password !== confirm) return setMessage({ ok: false, text: "שתי הסיסמאות לא זהות." });

    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage({
        ok: false,
        text: /reauth|recent/i.test(error.message)
          ? "מטעמי אבטחה צריך כניסה טרייה. התנתק, היכנס שוב עם קוד במייל, ונסה מיד."
          : /weak|short|characters/i.test(error.message)
            ? "הסיסמה חלשה מדי. נסה סיסמה ארוכה יותר, עם אותיות ומספרים."
            : "השמירה נכשלה. נסה שוב.",
      });
      return;
    }
    setPassword("");
    setConfirm("");
    setMessage({ ok: true, text: "הסיסמה נשמרה. מעכשיו אפשר להיכנס עם \"כניסה עם סיסמה\" במסך הכניסה." });
  }

  const input = "min-h-12 rounded-lg border border-field px-3 text-right text-base text-ink";
  return (
    <form onSubmit={save} className="flex max-w-[420px] flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-muted">
        סיסמה חדשה
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        שוב, לאימות
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          dir="ltr"
          className={input}
        />
      </label>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={"rounded-lg px-3 py-2 text-sm " + (message.ok ? "bg-sand text-ink" : "bg-alert-bg text-alert-ink")}
        >
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="min-h-12 rounded-[10px] bg-primary text-base font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
      >
        {busy ? "שומר…" : "שמירת סיסמה"}
      </button>
    </form>
  );
}
