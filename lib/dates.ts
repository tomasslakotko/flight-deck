import {
  addDays,
  differenceInMinutes,
  format,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";

export function todayKey(now = new Date()) {
  return format(now, "yyyy-MM-dd");
}

export function mondayOf(date = new Date()) {
  return startOfWeek(startOfDay(date), { weekStartsOn: 1 });
}

export function weekDays(anchor = new Date()) {
  const start = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

/** Calendar date of an instant in an IANA zone (YYYY-MM-DD). Falls back to local. */
export function dateKeyInZone(iso?: string | Date | null, timeZone?: string) {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : parseFlightInstant(iso);
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return dateKey(d);
  }
}

export function atLocal(day: Date, hours: number, minutes: number) {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function parseFlightInstant(iso?: string | null): Date | null {
  if (!iso) return null;
  const s = iso.trim();
  if (!s) return null;
  const hasOffset = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  const withT = s.includes("T") ? s : s.replace(" ", "T");
  const naiveDateTime = !hasOffset && /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(withT);
  const parsed = parseISO(naiveDateTime ? `${withT}Z` : withT);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatClock(iso?: string | null, timeZone?: string) {
  if (!iso) return "—";
  const d = parseFlightInstant(iso);
  if (!d) {
    const m = iso.match(/(\d{1,2}[:.]\d{2})/);
    return m ? m[1].replace(".", ":") : "—";
  }
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timeZone || undefined,
  })
    .format(d)
    .replace(/\u202f|\u00a0/g, "");
}

export function clocksDiffer(a?: string | null, b?: string | null, timeZone?: string) {
  if (!a || !b) return false;
  return formatClock(a, timeZone) !== formatClock(b, timeZone);
}

export function formatLongDate(isoDate: string) {
  const d = parseISO(`${isoDate}T12:00:00`);
  return format(d, "EEEE, d MMMM");
}

export function formatShortDate(isoDate: string) {
  const d = parseISO(`${isoDate}T12:00:00`);
  return format(d, "d MMM");
}

export function nextDateKey(isoDate: string) {
  return format(addDays(parseISO(`${isoDate}T12:00:00`), 1), "yyyy-MM-dd");
}

export function minutesUntil(iso?: string | null, now = new Date()) {
  if (!iso) return null;
  const d = parseFlightInstant(iso);
  if (!d) return null;
  return differenceInMinutes(d, now);
}

export function durationLabel(start?: string, end?: string) {
  if (!start || !end) return "";
  const from = parseFlightInstant(start);
  const to = parseFlightInstant(end);
  if (!from || !to) return "";
  const mins = differenceInMinutes(to, from);
  if (!Number.isFinite(mins) || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

export function hhmmToToday(hhmm: string, day: Date) {
  const m = hhmm.trim().replace(".", ":").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  return atLocal(day, Number(m[1]), Number(m[2]));
}
