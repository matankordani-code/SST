"use server";

import { requireRole } from "@/lib/auth";
import { testMorningKey } from "@/lib/morning";

export async function testKeyAction(_: string | undefined, fd: FormData): Promise<string> {
  await requireRole("owner");
  const id = String(fd.get("id") ?? "");
  const secret = String(fd.get("secret") ?? "");
  if (!id || !secret) return "חסר מזהה או מפתח סודי.";
  try {
    const r = await testMorningKey(id, secret);
    return r === "ok" ? "ok" : `Morning דחה את המפתח: ${r}`;
  } catch {
    return "לא הצלחנו להגיע ל-Morning. נסה שוב.";
  }
}
