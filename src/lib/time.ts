// Israel-time helpers. The server runs in UTC, so every conversion goes
// through Intl with an explicit time zone.

export const TZ = "Asia/Jerusalem";

function parts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: get("weekday"),
  };
}

// "YYYY-MM-DD" of the given instant, in Israel.
export const dayKey = (d: Date) => parts(d).date;
// "HH:MM" in Israel.
export const timeOf = (d: Date) => parts(d).time;

function offsetMinutes(d: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((x) => x.type === "timeZoneName")?.value; // e.g. "GMT+03:00"
  const m = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

// Israel wall-clock date + time -> UTC instant.
export function israelToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let result = guess - offsetMinutes(new Date(guess)) * 60_000;
  // Re-check once in case the guess sat on the other side of a DST switch.
  result = guess - offsetMinutes(new Date(result)) * 60_000;
  return new Date(result);
}

// Adds days to a "YYYY-MM-DD" key (calendar arithmetic, no time zone).
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// Sunday of the week containing `key` (Israeli week starts on Sunday).
export function weekStart(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -dow);
}

export function isDayKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function formatDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

// Months as "YYYY-MM".
export const monthOf = (d: Date) => dayKey(d).slice(0, 7);
export const isMonthKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}
export function formatMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function formatDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${d}.${m}.${y}`;
}
