// Calendar-date helpers. All dates are ISO strings (YYYY-MM-DD) in the agency
// time zone. Arithmetic is done in UTC so it never drifts with the server zone.

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Bangkok";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date in the agency time zone. */
export function todayIso(now: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const d = toUtc(date);
  const dow = d.getUTCDay(); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(date, diff);
}

export function weekEnd(date: string): string {
  return addDays(weekStart(date), 6);
}

export function isMonday(date: string): boolean {
  return isIsoDate(date) && toUtc(date).getUTCDay() === 1;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** ISO-8601 week number. */
export function isoWeekNumber(date: string): number {
  const d = toUtc(date);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return fromUtc(new Date(Date.UTC(y, m, 0)));
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Mondays from the week of `from` up to and including the week of `to`. */
export function weeksInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let w = weekStart(from);
  const last = weekStart(to);
  while (w <= last && out.length < 160) {
    out.push(w);
    w = addDays(w, 7);
  }
  return out;
}

export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let m = monthKey(from);
  const last = monthKey(to);
  while (m <= last && out.length < 60) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

/** Calendar grid (Monday-first) covering the month, as weeks of 7 dates. */
export function monthGrid(month: string): string[][] {
  const first = weekStart(monthStart(month));
  const last = weekEnd(monthEnd(month));
  const weeks: string[][] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  }
  return weeks;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDate(date: string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!date || !isIsoDate(date)) return "—";
  const d = toUtc(date);
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const withYear = opts.year ? `${base} ${d.getUTCFullYear()}` : base;
  return opts.weekday ? `${DAYS[d.getUTCDay()]} ${withYear}` : withYear;
}

export function formatWeek(monday: string): string {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  const a = toUtc(monday);
  const b = toUtc(sunday);
  const range = sameMonth
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  return `Week ${isoWeekNumber(monday)} · ${range}`;
}

export function formatWeekShort(monday: string): string {
  return `W${isoWeekNumber(monday)} ${formatDate(monday)}`;
}

export function formatMonth(month: string, long = true): string {
  const [y, m] = month.split("-").map(Number);
  return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]}`;
}

export function formatDateTime(iso: string, timeZone: string = APP_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
