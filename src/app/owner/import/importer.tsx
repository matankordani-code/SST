"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import readExcelFile from "read-excel-file/browser";
import { parseSheet, type ImportRow } from "@/lib/import-parse";
import { PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from "@/lib/clients";
import { importClientsAction, type ImportResult } from "./actions";
import { Field, inputClass } from "@/components/field";

type Sheet = { sheet: string; data: unknown[][] };

export function Importer({
  therapists,
  defaultTherapistId,
}: {
  therapists: { id: string; display_name: string }[];
  defaultTherapistId: string;
}) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [therapistId, setTherapistId] = useState(defaultTherapistId);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function load(name: string, all: Sheet[]) {
    setSheetName(name);
    const s = all.find((x) => x.sheet === name);
    const parsed = parseSheet((s?.data ?? []) as Parameters<typeof parseSheet>[0]);
    setRows(parsed.rows);
    setError(parsed.error ?? (parsed.rows.length ? null : "לא נמצאו מטופלים בלשונית הזו."));
    setResult(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const all = (await readExcelFile(file)) as Sheet[];
      setSheets(all);
      load(all[all.length - 1]?.sheet ?? "", all); // default: last (latest month) tab
    } catch {
      setError("לא הצלחנו לקרוא את הקובץ. ודא שזה קובץ ‎.xlsx");
    }
  }

  const update = (i: number, patch: Partial<ImportRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const count = rows.filter((r) => r.include).length;

  return (
    <section className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-white p-5">
      <h2 className="text-xl font-bold">ייבוא מטופלים מהאקסל</h2>
      <p className="text-sm text-muted">
        מורידים את הגיליון מ-Google Sheets (קובץ ← הורדה ← Microsoft Excel), ובוחרים אותו כאן. הקובץ נקרא רק
        בדפדפן שלך. שום דבר לא נשמר עד שלוחצים &quot;ייבוא&quot;.
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-end gap-3">
        <Field label="קובץ ‎.xlsx">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="text-sm"
          />
        </Field>
        {sheets.length > 1 && (
          <Field label="לשונית (חודש)">
            <select value={sheetName} onChange={(e) => load(e.target.value, sheets)} className={inputClass + " bg-white"}>
              {sheets.map((s) => (
                <option key={s.sheet} value={s.sheet}>
                  {s.sheet}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="המטופלים שייכים למטפל">
          <select value={therapistId} onChange={(e) => setTherapistId(e.target.value)} className={inputClass + " bg-white"}>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-alert-bg px-3 py-2 text-sm text-alert-ink">
          {error}
        </p>
      )}

      {rows.length > 0 && !result && (
        <>
          <p className="text-sm">
            בדוק כל שורה ותקן אם צריך. במיוחד את <strong>מצב הכרטיסייה</strong>: &quot;6-10&quot; נקרא כ-6 מתוך 10
            נוצלו.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-[13px] text-muted">
                  <th className="border-b border-line px-2 py-2 font-medium">לייבא</th>
                  <th className="border-b border-line px-2 py-2 font-medium">שם מטופל</th>
                  <th className="border-b border-line px-2 py-2 font-medium">משלם (הורה)</th>
                  <th className="border-b border-line px-2 py-2 font-medium">תעריף</th>
                  <th className="border-b border-line px-2 py-2 font-medium">אופן תשלום</th>
                  <th className="border-b border-line px-2 py-2 font-medium">נוצלו</th>
                  <th className="border-b border-line px-2 py-2 font-medium">בגיליון</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={"border-b border-[#EDE4D3] " + (r.include ? "" : "opacity-50")}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => update(i, { include: e.target.checked })}
                        aria-label={`לייבא את ${r.name}`}
                        className="size-5 accent-primary"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="שם" className={cell} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={r.payer} onChange={(e) => update(i, { payer: e.target.value })} aria-label="משלם" className={cell} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={r.rate}
                        onChange={(e) => update(i, { rate: Number(e.target.value) })}
                        aria-label="תעריף"
                        className={cell + " w-24"}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={r.method}
                        onChange={(e) => update(i, { method: e.target.value as PaymentMethod })}
                        aria-label="אופן תשלום"
                        className={cell + " bg-white"}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_LABEL[m]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      {r.method === "single" ? (
                        "—"
                      ) : (
                        <span className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={r.method === "card4" ? 4 : 10}
                            value={r.used}
                            onChange={(e) => update(i, { used: Number(e.target.value) })}
                            aria-label="נוצלו"
                            className={cell + " w-16"}
                          />
                          מתוך {r.method === "card4" ? 4 : 10}
                        </span>
                      )}
                    </td>
                    <td className="max-w-56 px-2 py-1.5 text-[13px] text-muted">{r.raw || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <button
              type="button"
              disabled={pending || count === 0}
              onClick={() => start(async () => setResult(await importClientsAction(therapistId, rows)))}
              className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {pending ? "מייבא…" : `ייבוא ${count} מטופלים`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div role="status" className="flex flex-col gap-1 rounded-lg bg-[#E4F1E6] px-3 py-2 text-sm text-[#22582C]">
          <strong>יובאו {result.created} מטופלים.</strong>
          {result.skipped.length > 0 && <span>דולגו (כבר קיימים): {result.skipped.join(", ")}</span>}
          {result.failed.length > 0 && <span className="text-alert-ink">נכשלו: {result.failed.join(", ")}</span>}
          <Link href="/owner/clinic" className="text-primary underline">
            למטופלים
          </Link>
        </div>
      )}
    </section>
  );
}

const cell = "min-h-10 w-full rounded-md border border-field px-2 text-sm";
