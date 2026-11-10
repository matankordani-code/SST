"use client";

import { useState } from "react";

// Copy the payment link, or open WhatsApp with it ready to send.
export function CopyLink({ url, payer, amount }: { url: string; payer: string; amount: number }) {
  const [copied, setCopied] = useState(false);
  const text = `שלום ${payer}, זה קישור לתשלום של ${amount.toLocaleString("he-IL")} ₪ למרכז SST: ${url}`;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // clipboard blocked: the link is still openable below
          }
        }}
        className="min-h-10 rounded-lg border border-primary bg-white px-3 text-sm text-primary"
      >
        {copied ? "✓ הועתק" : "העתקת הקישור"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-10 items-center rounded-lg border border-field bg-white px-3 text-sm"
      >
        שליחה בוואטסאפ
      </a>
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center px-2 text-sm text-primary underline">
        פתיחה
      </a>
    </div>
  );
}
