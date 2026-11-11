"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateContactAction, type ContactState } from "@/app/clients/contact-actions";

export type Contact = {
  phone: string | null;
  email: string | null;
  invoiceEmail: string | null;
  invoicePhone: string | null;
};

const input = "min-h-11 w-full rounded-lg border border-field px-3 text-[15px] text-ink";

// Phone and email in the clients list, with a quick "✎" to update them and to
// set a separate email/phone for Morning's receipt (invoice).
export function ContactEditor({
  clientId,
  clientName,
  contact,
  payerName,
  compact = false,
}: {
  clientId: string;
  clientName: string;
  contact: Contact;
  // Set when a parent/someone else pays: the phone and email are theirs.
  payerName: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="flex items-start gap-1.5">
      <span className="flex flex-col text-[13px] leading-snug">
        {contact.phone ? (
          <a href={`tel:${contact.phone}`} dir="ltr" className="text-primary underline">
            {contact.phone}
          </a>
        ) : (
          <span className="text-muted">אין טלפון</span>
        )}
        {contact.email ? <bdi className={compact ? "max-w-[190px] truncate" : ""}>{contact.email}</bdi> : <span className="text-muted">אין מייל</span>}
        {contact.invoiceEmail && <span className="text-[12px] text-muted">חשבונית: {contact.invoiceEmail}</span>}
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`עדכון טלפון ומייל · ${clientName}`}
        className="min-h-9 min-w-9 rounded-lg border border-field bg-white text-sm hover:bg-sand"
      >
        ✎
      </button>
      {open && <Dialog clientId={clientId} clientName={clientName} contact={contact} payerName={payerName} onClose={() => setOpen(false)} />}
    </span>
  );
}

function Dialog({
  clientId,
  clientName,
  contact,
  payerName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  contact: Contact;
  payerName: string | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ContactState, FormData>(updateContactAction.bind(null, clientId), undefined);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={`contact-${clientId}`}
      className="m-auto w-[min(520px,calc(100vw-24px))] rounded-2xl border border-line bg-white p-0 text-ink backdrop:bg-black/40"
    >
      <form action={action} className="flex flex-col gap-4 p-5">
        <h2 id={`contact-${clientId}`} className="text-lg font-bold">
          פרטי קשר · {clientName}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {payerName ? `טלפון (${payerName})` : "טלפון"}
            <input name="phone" type="tel" defaultValue={contact.phone ?? ""} dir="ltr" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {payerName ? `אימייל (${payerName})` : "אימייל"}
            <input name="email" type="email" defaultValue={contact.email ?? ""} dir="ltr" className={input} />
          </label>
        </div>
        <fieldset className="flex flex-col gap-2 rounded-lg bg-sand p-3">
          <legend className="px-1 text-sm font-semibold">לשליחת חשבונית (Morning)</legend>
          <p className="text-[12px] text-muted">
            אם הקבלה צריכה להגיע לכתובת אחרת (מעסיק, בן/בת זוג, קופה). ריק = נשלח למייל שלמעלה.
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              מייל לחשבונית
              <input name="invoice_email" type="email" defaultValue={contact.invoiceEmail ?? ""} dir="ltr" className={input + " bg-white"} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              טלפון לחשבונית
              <input name="invoice_phone" type="tel" defaultValue={contact.invoicePhone ?? ""} dir="ltr" className={input + " bg-white"} />
            </label>
          </div>
        </fieldset>
        {state?.error && <p className="text-sm text-alert-ink">{state.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white disabled:opacity-60">
            {pending ? "שומר…" : "שמירה"}
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-field bg-white px-4">
            ביטול
          </button>
        </div>
      </form>
    </dialog>
  );
}
