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

export function atLocal(day: Date, hours: number, minutes: number) {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function formatClock(iso?: string | null) {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) {
    const m = iso.match(/(\d{1,2}[:.]\d{2})/);
    return m ? m[1].replace(".", ":") : "—";
  }
  return format(d, "HH:mm");
}

export function formatLongDate(isoDate: string) {
  const d = parseISO(`${isoDate}T12:00:00`);
  return format(d, "EEEE, d MMMM");
}

export function formatShortDate(isoDate: string) {
  const d = parseISO(`${isoDate}T12:00:00`);
  return format(d, "d MMM");
}

export function minutesUntil(iso?: string | null, now = new Date()) {
  if (!iso) return null;
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return null;
  return differenceInMinutes(d, now);
}

export function durationLabel(start?: string, end?: string) {
  if (!start || !end) return "";
  const mins = differenceInMinutes(parseISO(end), parseISO(start));
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
