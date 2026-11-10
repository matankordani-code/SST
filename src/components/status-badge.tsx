import { STATUS_CLASS, STATUS_LABEL, type SessionStatus } from "@/lib/sessions";

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[13px] ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
