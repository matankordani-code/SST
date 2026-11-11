// A metric tile: tinted icon square, label, big number and a short note.
export type TileIcon = "people" | "check" | "money" | "card" | "wave" | "clock" | "alert" | "calendar";
export type TileTone = "blue" | "sage" | "sand" | "peach";

const ICON: Record<TileIcon, React.ReactNode> = {
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
    </>
  ),
  check: (
    <>
      <path d="M9 11l3 3 8-8" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  money: <path d="M3 20h18M6 16v-5M11 16V7M16 16v-8" />,
  card: (
    <>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
    </>
  ),
  wave: <path d="M3 17c3-6 6-6 9-2s6 4 9-2M3 11c3-6 6-6 9-2s6 4 9-2" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4M12 17.5v.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
};

const TONE: Record<TileTone, string> = {
  blue: "bg-[#DCEAF0] text-ocean",
  sage: "bg-[#E2ECE5] text-[#3F8A6A]",
  sand: "bg-[#EFE5D6] text-[#8C7150]",
  peach: "bg-[#F8E3D3] text-[#C2683F]",
};

export function Tile({
  label,
  value,
  sub,
  alert,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
  icon?: TileIcon;
  tone?: TileTone;
}) {
  const t = tone ?? (alert ? "peach" : "blue");
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-line bg-card p-4 shadow-soft">
      <span className="flex items-center gap-2.5 text-[13.5px] font-medium text-muted">
        {icon && (
          <span className={"grid size-9 shrink-0 place-items-center rounded-xl " + TONE[t]} aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              {ICON[icon]}
            </svg>
          </span>
        )}
        {label}
      </span>
      <span className={"text-[30px] leading-tight font-semibold tabular-nums " + (alert ? "text-alert-ink" : "text-primary")}>{value}</span>
      <span className={"text-[13px] " + (alert ? "font-medium text-[#C2683F]" : "text-muted")}>{sub}</span>
    </div>
  );
}
