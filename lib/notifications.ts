import type { Duty, LiveFlight } from "@/lib/types";
import { airportTz, flightRouteLabel } from "@/lib/airports";
import { formatClock, parseFlightInstant, todayKey } from "@/lib/dates";
import { flightsOnDate, isFlightDuty } from "@/lib/shift";

const FIRED_KEY = "bt-crew-notified";

export type LocalNotice = {
  tag: string;
  title: string;
  body: string;
  at: number;
  url?: string;
};

function firedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markFired(tag: string) {
  const set = firedSet();
  set.add(tag);
  const trimmed = [...set].slice(-80);
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota
  }
}

export function notificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationSupported()) return "unsupported" as const;
  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showLocalNotification(notice: Omit<LocalNotice, "at">) {
  if (!notificationSupported() || Notification.permission !== "granted") return false;
  markFired(notice.tag);
  const opts: NotificationOptions = {
    body: notice.body,
    tag: notice.tag,
    data: { url: notice.url ?? "/" },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(notice.title, opts);
      return true;
    }
  } catch {
    // fall through to page Notification
  }
  try {
    const n = new Notification(notice.title, opts);
    n.onclick = () => {
      window.focus();
      if (notice.url) window.location.href = notice.url;
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

function checkInInstant(duty: Duty) {
  if (duty.checkIn) return parseFlightInstant(duty.checkIn);
  const std = parseFlightInstant(duty.std);
  if (!std) return null;
  return new Date(std.getTime() - 60 * 60_000);
}

/** Build upcoming local notices for today's (and next) duties. */
export function buildDutyNotices(duties: Duty[], now = Date.now()): LocalNotice[] {
  const dates = [todayKey()];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dates.push(todayKey(tomorrow));

  const notices: LocalNotice[] = [];
  const fired = firedSet();

  for (const date of dates) {
    const flights = flightsOnDate(duties, date).filter(isFlightDuty);
    if (!flights.length) continue;
    const first = flights[0];
    const report = checkInInstant(first);
    if (report) {
      const lead = report.getTime() - 15 * 60_000;
      const route = flightRouteLabel(first);
      const when = formatClock(report.toISOString(), airportTz(first.depIata));
      if (lead > now) {
        const tag = `checkin-lead-${first.id}-${lead}`;
        if (!fired.has(tag)) {
          notices.push({
            tag,
            title: "Check-in in 15 min",
            body: `${first.flightNumber ?? route} · report ${when}`,
            at: lead,
            url: `/flight/${first.id}`,
          });
        }
      }
      if (report.getTime() > now) {
        const tag = `checkin-${first.id}-${report.getTime()}`;
        if (!fired.has(tag)) {
          notices.push({
            tag,
            title: "Check-in now",
            body: `${first.flightNumber ?? route} · ${when}`,
            at: report.getTime(),
            url: `/flight/${first.id}`,
          });
        }
      }
    }

    for (const f of flights) {
      const std = parseFlightInstant(f.std);
      if (!std) continue;
      const boarding = std.getTime() - 30 * 60_000;
      if (boarding <= now) continue;
      const tag = `boarding-${f.id}-${boarding}`;
      if (fired.has(tag)) continue;
      notices.push({
        tag,
        title: "Boarding in 30 min",
        body: `${f.flightNumber ?? flightRouteLabel(f)} · STD ${formatClock(f.std, airportTz(f.depIata))}`,
        at: boarding,
        url: `/flight/${f.id}`,
      });
    }
  }

  return notices.sort((a, b) => a.at - b.at);
}

export function delayNotice(
  duty: Duty,
  live: LiveFlight | undefined,
  prevDelay: number | null | undefined,
): LocalNotice | null {
  const delay = live?.delayMin ?? null;
  if (delay == null || delay < 15) return null;
  if (prevDelay != null && delay <= prevDelay) return null;
  const tag = `delay-${duty.flightNumber ?? duty.id}-${delay}`;
  if (firedSet().has(tag)) return null;
  return {
    tag,
    title: `Delay +${delay} min`,
    body: `${duty.flightNumber ?? flightRouteLabel(duty)} · ${live?.status ?? "updated"}`,
    at: Date.now(),
    url: `/flight/${duty.id}`,
  };
}

/** Schedule timers; returns a cleanup that clears them. */
export function armNoticeTimers(notices: LocalNotice[], onFire: (n: LocalNotice) => void) {
  const timers: number[] = [];
  const now = Date.now();
  for (const notice of notices) {
    const wait = notice.at - now;
    if (wait <= 0) continue;
    if (wait > 36 * 60 * 60_000) continue;
    const id = window.setTimeout(() => {
      onFire(notice);
    }, wait);
    timers.push(id);
  }
  return () => {
    for (const id of timers) window.clearTimeout(id);
  };
}
