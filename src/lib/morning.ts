import "server-only";

// Morning (חשבונית ירוקה) API client. Server-side only: uses the secret key.
// Env: MORNING_ENV ("sandbox" | "production"), MORNING_CLIENT_ID, MORNING_CLIENT_SECRET.

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
  // Trim: a pasted key often carries a stray space or newline.
  const id = process.env.MORNING_CLIENT_ID?.trim();
  const secret = process.env.MORNING_CLIENT_SECRET?.trim();
  return { mode, hosts: HOSTS[mode], id, secret } as const;
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
  if (!res.ok) {
    // OAuth error code only (e.g. invalid_client / unauthorized_client); never the secret.
    const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    throw new Error(
      `Morning auth failed (${res.status} ${body.error ?? ""}: ${body.error_description ?? ""}) ` +
        `[mode=${mode}, idLength=${id.length}, idPrefix=${id.slice(0, 4)}, secretLength=${secret.length}]`,
    );
  }
  const data = (await res.json()) as { accessToken: string; expiresAt: number };
  cached = { token: data.accessToken, expiresAt: data.expiresAt, mode };
  return data.accessToken;
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
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    errorCode?: number;
    errorDescription?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(`Morning payment form failed: ${data.errorDescription ?? res.status}`);
  }
  return data.url;
}
