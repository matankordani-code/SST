"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// "מתעדכן בזמן אמת": listens to database changes (Supabase Realtime, filtered by
// RLS to rows this user may see) and re-renders the screen from the server.
// Bursts are merged; a hidden tab refreshes when it comes back.
const TABLES = [
  "sessions",
  "clients",
  "payments",
  "payment_requests",
  "punch_cards",
  "settlements",
  "registrations",
  "trainings",
  "members",
  "declarations",
];

export function LiveRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const refreshSoon = () => {
      if (document.visibilityState !== "visible") {
        pending.current = true;
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 1200);
    };

    let channel = supabase.channel("sst-live");
    for (const table of TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refreshSoon);
    }
    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible" && pending.current) {
        pending.current = false;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
