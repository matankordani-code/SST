export const inputClass =
  "min-h-11 w-full rounded-lg border border-field px-3 text-[15px] text-ink";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[13px] text-muted">
      {label}
      {children}
    </label>
  );
}
