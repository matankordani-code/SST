import "server-only";
import { headers } from "next/headers";

// The site's own address, for links sent to Morning and in emails.
export async function siteUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `https://${host}`;
}
