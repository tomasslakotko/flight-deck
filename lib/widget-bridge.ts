import { airportTz, flightRouteLabel } from "@/lib/airports";
import { formatClock, todayKey } from "@/lib/dates";
import { flightsOnDate, isFlightDuty, nextDuty, shiftBounds } from "@/lib/shift";
import type { Duty } from "@/lib/types";

export type WidgetPayload = {
  type: "widget";
  updatedAt: number;
  headline: string;
  detail: string;
  reportAt?: number;
  route?: string;
  flightNumber?: string;
  flightCount: number;
  empty: boolean;
};

type NativeBridge = {
  post: (payload: unknown) => void;
};

declare global {
  interface Window {
    FlightDeckNative?: NativeBridge;
    webkit?: {
      messageHandlers?: {
        flightDeck?: { postMessage: (body: string) => void };
      };
    };
  }
}

export function hasNativeBridge() {
  if (typeof window === "undefined") return false;
  return Boolean(window.FlightDeckNative?.post || window.webkit?.messageHandlers?.flightDeck);
}

export function postToNative(payload: unknown) {
  if (typeof window === "undefined") return false;
  try {
    if (window.FlightDeckNative?.post) {
      window.FlightDeckNative.post(payload);
      return true;
    }
    const handler = window.webkit?.messageHandlers?.flightDeck;
    if (handler) {
      handler.postMessage(typeof payload === "string" ? payload : JSON.stringify(payload));
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function reportMs(duty: Duty) {
  const iso = duty.checkIn || duty.std;
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t / 1000 : undefined;
}

/** Build a compact snapshot for iOS WidgetKit. */
export function buildWidgetPayload(duties: Duty[], now = new Date()): WidgetPayload {
  const today = todayKey(now);
  const flights = flightsOnDate(duties, today).filter(isFlightDuty);
  const bounds = shiftBounds(duties, today);
  const upcoming = nextDuty(duties, now);
  const focus = flights.find((f) => f.std && Date.parse(f.std) >= now.getTime() - 30 * 60_000) ?? flights[0] ?? upcoming;

  if (!focus && !flights.length) {
    return {
      type: "widget",
      updatedAt: now.getTime() / 1000,
      headline: "No duty today",
      detail: "Import your roster in Flight Deck",
      flightCount: 0,
      empty: true,
    };
  }

  const report =
    (bounds?.start ? Date.parse(bounds.start) / 1000 : undefined) ??
    (focus ? reportMs(focus) : undefined);
  const route = focus ? flightRouteLabel(focus) : undefined;
  const flightNumber = focus?.flightNumber;
  const reportClock = bounds?.start
    ? formatClock(bounds.start, airportTz(focus?.depIata))
    : focus?.checkIn || focus?.std
      ? formatClock(focus.checkIn || focus.std, airportTz(focus.depIata))
      : "—";

  const mins =
    report != null ? Math.round((report * 1000 - now.getTime()) / 60_000) : null;
  let headline = flightNumber ?? route ?? "Duty";
  let detail = `${flights.length} flight${flights.length === 1 ? "" : "s"} · report ${reportClock}`;
  if (mins != null && mins > 0) {
    headline = mins >= 60 ? `Report in ${Math.floor(mins / 60)}h ${mins % 60}m` : `Report in ${mins} min`;
    detail = [flightNumber, route, `check-in ${reportClock}`].filter(Boolean).join(" · ");
  } else if (mins != null && mins > -30) {
    headline = "On duty";
    detail = [flightNumber, route].filter(Boolean).join(" · ") || detail;
  }

  return {
    type: "widget",
    updatedAt: now.getTime() / 1000,
    headline,
    detail,
    reportAt: report,
    route,
    flightNumber,
    flightCount: flights.length,
    empty: flights.length === 0,
  };
}

export function pushWidgetSnapshot(duties: Duty[]) {
  const payload = buildWidgetPayload(duties);
  if (!hasNativeBridge()) return false;
  return postToNative(payload);
}

/** Keep trying briefly — WKWebView bridge may appear after first paint. */
export function startWidgetSync(getDuties: () => Duty[]) {
  if (typeof window === "undefined") return () => {};
  const push = () => pushWidgetSnapshot(getDuties());
  push();
  const onReady = () => push();
  window.addEventListener("flightdeck-native-ready", onReady);
  window.addEventListener("flightdeck-request-widget", onReady);
  const timers = [300, 800, 1600, 3200].map((ms) => window.setTimeout(push, ms));
  const interval = window.setInterval(push, 60_000);
  return () => {
    window.removeEventListener("flightdeck-native-ready", onReady);
    window.removeEventListener("flightdeck-request-widget", onReady);
    for (const id of timers) window.clearTimeout(id);
    window.clearInterval(interval);
  };
}
