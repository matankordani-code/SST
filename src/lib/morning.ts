import "server-only";

// Morning (חשבונית ירוקה) API client. Server-side only: uses the secret key.
// Env: MORNING_ENV ("sandbox" | "production"), MORNING_CLIENT_ID, MORNING_CLIENT_SECRET,
// optional MORNING_PLUGIN_ID (Grow clearing terminal).

const HOSTS = {
  sandbox: {
    token: "https://api.sandbox.morning.dev/idp/v1/oauth/token",
    api: "https://sandbox.d.greeninvoice.co.il/api/v1",
  },
  production: {
    token: "https://api.morning.co/idp/v1/oauth/token",
    api: "https://api.greeninvoice.co.il/api/v1",
  },
} as const;

function env() {
  const mode = process.env.MORNING_ENV === "production" ? "production" : "sandbox";
  const id = cleanKey(process.env.MORNING_CLIENT_ID);
  const secret = cleanKey(process.env.MORNING_CLIENT_SECRET);
  return { mode, hosts: HOSTS[mode], id, secret } as const;
}

// A pasted key often carries a stray space/newline, or invisible
// right-to-left marks when copied from a Hebrew page.
export function cleanKey(v: string | undefined) {
  return v?.replace(/[​-‏‪-‮⁦-⁩﻿]/g, "").trim();
}

// Tries a key pair against Morning's token endpoint. Returns the OAuth error
// code, or "ok". Used by the owner's key-test page; nothing is stored.
export async function testMorningKey(rawId: string, rawSecret: string): Promise<string> {
  const id = cleanKey(rawId) ?? "";
  const secret = cleanKey(rawSecret) ?? "";
  const res = await fetch(env().hosts.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    cache: "no-store",
  });
  if (res.ok) return "ok";
  const b = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
  return `${res.status} ${b.error ?? ""} ${b.error_description ?? ""} (idLength=${id.length}, secretLength=${secret.length})`;
}

export function morningConfigured() {
  const { id, secret } = env();
  return Boolean(id && secret);
}

export function morningMode() {
  return env().mode;
}

let cached: { token: string; expiresAt: number; mode: string } | null = null;

async function accessToken(): Promise<string> {
  const { mode, hosts, id, secret } = env();
  if (!id || !secret) throw new Error("Morning keys are not configured");
  const now = Math.floor(new Date().getTime() / 1000);
  if (cached && cached.mode === mode && cached.expiresAt - 60 > now) return cached.token;

  const res = await fetch(hosts.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    cache: "no-store",
  });
  if (res.ok) {
    const data = (await res.json()) as { accessToken: string; expiresAt: number };
    cached = { token: data.accessToken, expiresAt: data.expiresAt, mode };
    return data.accessToken;
  }
  // OAuth error code only (e.g. invalid_client); never the secret.
  const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
  let oauthError = `json ${res.status} ${body.error ?? ""}`;

  // Other standard OAuth client-credentials encodings, in case the server expects them.
  const variants: { name: string; init: RequestInit }[] = [
    {
      name: "basic",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
      },
    },
    {
      name: "form",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }).toString(),
      },
    },
  ];
  for (const v of variants) {
    const r = await fetch(hosts.token, { ...v.init, cache: "no-store" });
    if (r.ok) {
      const data = (await r.json()) as { accessToken?: string; access_token?: string; expiresAt?: number; expires_in?: number };
      const token = data.accessToken ?? data.access_token;
      if (token) {
        cached = { token, expiresAt: data.expiresAt ?? now + (data.expires_in ?? 3000), mode };
        console.log(`Morning auth ok via ${v.name}`);
        return token;
      }
    }
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    oauthError += `; ${v.name} ${r.status} ${b.error ?? ""}`;
  }

  // Fallback: the classic Green Invoice login (POST /account/token {id, secret}).
  const legacy = await fetch(`${hosts.api}/account/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, secret }),
    cache: "no-store",
  });
  if (legacy.ok) {
    const data = (await legacy.json()) as { token: string; expires?: number };
    cached = { token: data.token, expiresAt: data.expires ?? now + 3000, mode };
    return data.token;
  }
  const legacyBody = (await legacy.json().catch(() => ({}))) as { errorCode?: number; errorMessage?: string };
  throw new Error(
    `Morning auth failed (oauth: ${oauthError}; legacy: ${legacy.status} ${legacyBody.errorCode ?? ""} ${legacyBody.errorMessage ?? ""}) ` +
      `[mode=${mode}, idLength=${id.length}, idPrefix=${id.slice(0, 4)}, secretLength=${secret.length}]`,
  );
}

export type PaymentFormInput = {
  description: string;
  amount: number;
  client: { name: string; emails?: string[]; phone?: string };
  successUrl: string;
  failureUrl: string;
  notifyUrl: string;
  custom?: string;
  // Payment method on the form. Required by the Grow (משולם) plugin:
  // 100 credit card, 120 Bit, 150 Google Pay, 160 Apple Pay.
  group?: number;
};

// Creates a hosted payment form. When paid, Morning issues a tax
// invoice/receipt (type 320), emails it to the client, and POSTs notifyUrl.
export async function createPaymentForm(input: PaymentFormInput): Promise<string> {
  const { hosts } = env();
  const pluginId = cleanKey(process.env.MORNING_PLUGIN_ID);
  const token = await accessToken();
  const res = await fetch(`${hosts.api}/payments/form`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      description: input.description,
      type: 320,
      amount: input.amount,
      currency: "ILS",
      vatType: 0,
      lang: "he",
      maxPayments: 1,
      client: { ...input.client, add: false },
      successUrl: input.successUrl,
      failureUrl: input.failureUrl,
      notifyUrl: input.notifyUrl,
      custom: input.custom,
      group: input.group ?? 100,
      // Grow (משולם) terminal id, given by Morning support once Grow approves
      // the terminal. Optional: sent only when MORNING_PLUGIN_ID is set.
      ...(pluginId ? { pluginId } : {}),
    }),
    cache: "no-store",
  });
  const raw = await res.text();
  let data: { url?: string; errorCode?: number; errorDescription?: string; errorMessage?: string } = {};
  try {
    data = JSON.parse(raw);
  } catch {}
  if (!res.ok || !data.url) {
    // Morning's own error text (no secrets in it) — needed to see which field it rejects.
    throw new Error(
      `Morning payment form failed: ${res.status} code=${data.errorCode ?? "-"} ` +
        `msg=${data.errorDescription ?? data.errorMessage ?? "-"} body=${raw.slice(0, 500)}`,
    );
  }
  return data.url;
}
