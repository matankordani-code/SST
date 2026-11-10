import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { cancelledEmail, movedEmail, sendEmail } from "@/lib/email";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SessionContact = {
  startsAt: string;
  clientFirst: string;
  therapist: string;
  toEmail: string | null;
  toName: string;
};

type Row = {
  starts_at: string;
  client: { full_name: string; email: string | null; payer: { full_name: string; email: string | null } | null } | null;
  therapist: { display_name: string } | null;
};

// Who to tell about a session: the payer (a parent), else the client.
export async function sessionContact(supabase: Supabase, sessionId: string): Promise<SessionContact | null> {
  const { data } = await supabase
    .from("sessions")
    .select("starts_at, client:clients(full_name, email, payer:payers(full_name, email)), therapist:therapists(display_name)")
    .eq("id", sessionId)
    .maybeSingle();
  const r = data as unknown as Row | null;
  if (!r?.client) return null;
  return {
    startsAt: r.starts_at,
    clientFirst: r.client.full_name.split(" ")[0],
    therapist: r.therapist?.display_name ?? "",
    toEmail: r.client.payer?.email ?? r.client.email,
    toName: r.client.payer?.full_name ?? r.client.full_name,
  };
}

// Best effort: a failed email never blocks the change itself.
export async function notifyMoved(c: SessionContact | null) {
  if (!c?.toEmail) return;
  await sendEmail({ to: c.toEmail, ...movedEmail(c) });
}

export async function notifyCancelled(c: SessionContact | null, count = 1) {
  if (!c?.toEmail) return;
  await sendEmail({ to: c.toEmail, ...cancelledEmail({ ...c, count }) });
}
