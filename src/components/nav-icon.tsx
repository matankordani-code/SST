// Line icons for the side menu, by screen. Stroke follows the text color.
const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c1.8.8 3 2.6 3.5 5.4" />
    </>
  ),
  month: (
    <>
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
    </>
  ),
  club: <path d="M3 17c3-6 6-6 9-2s6 4 9-2M3 11c3-6 6-6 9-2s6 4 9-2" />,
  income: <path d="M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16v-3" />,
  payments: (
    <>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  settle: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  staff: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
};

const BY_HREF: Record<string, keyof typeof PATHS> = {
  "/owner": "home",
  "/therapist": "home",
  "/today": "today",
  "/calendar": "calendar",
  "/owner/clinic": "people",
  "/month": "month",
  "/club": "club",
  "/owner/income": "income",
  "/owner/payments": "payments",
  "/owner/settlements": "settle",
  "/owner/therapists": "staff",
  "/owner/permissions": "lock",
  "/owner/settings": "settings",
  "/client": "home",
  "/member": "club",
};

export function NavIcon({ href, className = "size-5" }: { href: string; className?: string }) {
  const name = BY_HREF[href] ?? "home";
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className + " shrink-0"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
