import { airportTz, flightRouteLabel, toFlightIata } from "@/lib/airports";
import {
  departureBoardLabel,
  departureTimes,
  resolveSbyBase,
  todayStandby,
  type BaseDeparture,
} from "@/lib/base-departures";
import { formatClock, minutesUntil, nextDateKey, parseFlightInstant, todayKey } from "@/lib/dates";
import {
  checkInIso,
  checkOutInstant,
  dutiesOnDate,
  flightsOnDate,
  focusFlight,
  isFlightDuty,
  phaseForFlight,
  resolvedFlightStatus,
  shiftBounds,
} from "@/lib/shift";
import type { Duty, LiveFlight } from "@/lib/types";

function buildSbyBoardPayload(
  duties: Duty[],
  today: string,
  now: Date,
  opts: WidgetOptions,
  noteSnippet: string | undefined,
  liveUpdatedAt: number | undefined,
  tomorrow: WidgetTomorrowPreview,
): WidgetPayload {
  const flights = flightsOnDate(duties, today).filter(isFlightDuty);
  const sby = todayStandby(duties, today);
  const base = resolveSbyBase(sby, flights);
  const copy = dayKindCopy(sby?.type === "reserve" ? "reserve" : "standby", base);
  const board = opts.baseDepartures ?? [];
  const segments = board.length ? sbyDepartureSegments(board) : [];
  const windowLabel =
    sby?.std || sby?.sta
      ? `${sby.std ? formatClock(sby.std, airportTz(base)) : "—"}–${sby.sta ? formatClock(sby.sta, airportTz(base)) : "—"}`
      : undefined;
  const detailParts = [
    windowLabel,
    board.length ? `${board.length} BT-op from ${base}` : copy.detail,
    noteSnippet,
  ].filter(Boolean);
  const nextDep = board[0];
  const nextTimes = nextDep ? departureTimes(nextDep) : undefined;
  return {
    type: "widget",
    updatedAt: now.getTime() / 1000,
    headline: copy.headline,
    detail: detailParts.join(" · "),
    reportAt: epochSec(sby?.std),
    checkoutAt: epochSec(sby?.sta),
    route: nextDep ? departureBoardLabel(nextDep) : base,
    flightNumber: nextDep?.flightIata,
    flightCount: board.length,
    empty: board.length === 0,
    dayKind: sby?.type === "reserve" ? "reserve" : "standby",
    noteSnippet,
    liveUpdatedAt: board.length ? now.getTime() / 1000 : liveUpdatedAt,
    tomorrow,
    depIata: base ?? nextDep?.depIata,
    arrIata: nextDep?.arrIata,
    depTime: nextTimes?.startTime ?? (sby?.std ? formatClock(sby.std, airportTz(base)) : undefined),
    arrTime: nextTimes?.endTime ?? (sby?.sta ? formatClock(sby.sta, airportTz(base)) : undefined),
    checkInTime: sby?.std ? formatClock(sby.std, airportTz(base)) : undefined,
    checkOutTime: sby?.sta ? formatClock(sby.sta, airportTz(base)) : undefined,
    statusLabel: copy.statusLabel,
    countdown: nextDep
      ? formatCountdown(minutesUntil(nextDep.etd ?? nextDep.std, now)) ?? "—"
      : "—",
    progress: 0,
    segments,
  };
}

export type WidgetDayKind = "flight" | "off" | "standby" | "reserve" | "empty";

export type WidgetTomorrowPreview = {
  kind: WidgetDayKind;
  title: string;
  detail: string;
  route?: string;
  flights?: string;
  checkInTime?: string;
  flightCount?: number;
};

export type WidgetDaySegment = {
  kind: "start" | "flight" | "end";
  label: string;
  flightNumber?: string;
  registration?: string;
  aircraftType?: string;
  gate?: string;
  status?: string;
  delayed?: boolean;
  startTime?: string;
  endTime?: string;
};

export type WidgetPayload = {
  type: "widget";
  updatedAt: number;
  headline: string;
  detail: string;
  reportAt?: number;
  checkoutAt?: number;
  route?: string;
  flightNumber?: string;
  flightCount: number;
  empty: boolean;
  dayKind?: WidgetDayKind;
  noteSnippet?: string;
  liveUpdatedAt?: number;
  tomorrow?: WidgetTomorrowPreview;
  depIata?: string;
  arrIata?: string;
  depTime?: string;
  arrTime?: string;
  checkInTime?: string;
  checkOutTime?: string;
  cabinClass?: string;
  statusLabel?: string;
  countdown?: string;
  progress?: number;
  via?: string[];
  segments?: WidgetDaySegment[];
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

function epochSec(iso?: string | null) {
  const d = parseFlightInstant(iso);
  if (!d) return undefined;
  return d.getTime() / 1000;
}

function formatCountdown(mins: number | null | undefined) {
  if (mins == null || !Number.isFinite(mins)) return undefined;
  const abs = Math.abs(Math.round(mins));
  if (abs < 1) return "NOW";
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h <= 0) return `${m}M`;
  if (m === 0) return `${h}H`;
  return `${h}H ${m}M`;
}

function dayRoute(flights: Duty[]) {
  const sorted = [...flights].filter((f) => f.depIata || f.arrIata);
  if (!sorted.length) {
    return { dep: undefined as string | undefined, arr: undefined as string | undefined, via: [] as string[] };
  }
  const dep = sorted[0].depIata;
  const arr = sorted[sorted.length - 1].arrIata;
  const via: string[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const code = sorted[i].arrIata;
    if (code && code !== dep && code !== arr && !via.includes(code)) via.push(code);
  }
  return { dep, arr, via };
}

function progressBetween(startIso?: string | null, endIso?: string | null, now = new Date()) {
  const start = parseFlightInstant(startIso);
  const end = parseFlightInstant(endIso);
  if (!start || !end || end.getTime() <= start.getTime()) return 0;
  const t = now.getTime();
  if (t <= start.getTime()) return 0;
  if (t >= end.getTime()) return 1;
  return Math.min(1, Math.max(0, (t - start.getTime()) / (end.getTime() - start.getTime())));
}

function liveForDuty(duty: Duty, liveByIata?: Record<string, LiveFlight>) {
  if (!liveByIata) return undefined;
  const key = toFlightIata(duty.flightNumber) ?? duty.flightNumber;
  if (!key) return undefined;
  return liveByIata[key] ?? liveByIata[key.toUpperCase()];
}

function widgetFlightStatus(duty: Duty, live?: LiveFlight | null) {
  const status = resolvedFlightStatus(duty, live);
  const delay = live?.delayMin ?? 0;
  const raw = (status ?? "").toLowerCase();
  if (raw.includes("cancel")) return { label: "Cancelled", delayed: false };
  if (delay >= 10 || raw.includes("delay")) {
    return { label: delay ? `Delayed +${Math.round(delay)}m` : "Delayed", delayed: true };
  }
  if (raw.includes("land")) return { label: "Landed", delayed: false };
  if (raw.includes("en-route") || raw.includes("active")) return { label: "En route", delayed: false };
  if (status) return { label: status.replace(/-/g, " "), delayed: false };
  return { label: "On time", delayed: false };
}

function buildDaySegments(
  flights: Duty[],
  checkInIso?: string | null,
  checkOutIso?: string | null,
  liveByIata?: Record<string, LiveFlight>,
): WidgetDaySegment[] {
  const segments: WidgetDaySegment[] = [];
  const first = flights[0];
  const last = flights[flights.length - 1];
  const startTz = airportTz(first?.depIata);

  if (checkInIso) {
    segments.push({
      kind: "start",
      label: "Shift start",
      startTime: formatClock(checkInIso, startTz),
    });
  }

  for (const flight of flights) {
    const live = liveForDuty(flight, liveByIata);
    const { label: status, delayed } = widgetFlightStatus(flight, live);
    const dep = flight.depIata ?? "—";
    const arr = flight.arrIata ?? "—";
    const gate = (live?.depGate || live?.arrGate || "").trim() || undefined;
    segments.push({
      kind: "flight",
      label: `${dep} → ${arr}`,
      flightNumber: flight.flightNumber,
      registration: live?.registration || undefined,
      aircraftType: live?.aircraftType || flight.aircraftType || undefined,
      gate,
      status,
      delayed,
      startTime: flight.std ? formatClock(flight.std, airportTz(flight.depIata)) : undefined,
      endTime: flight.sta ? formatClock(flight.sta, airportTz(flight.arrIata)) : undefined,
    });
  }

  if (checkOutIso) {
    segments.push({
      kind: "end",
      label: "Shift end",
      startTime: formatClock(checkOutIso, airportTz(last?.arrIata)),
    });
  }

  return segments;
}

function liveUpdatedAtSec(flights: Duty[], liveByIata?: Record<string, LiveFlight>) {
  let maxMs = 0;
  for (const flight of flights) {
    const live = liveForDuty(flight, liveByIata);
    if (live?.updatedAt && live.updatedAt > maxMs) maxMs = live.updatedAt;
  }
  return maxMs > 0 ? maxMs / 1000 : undefined;
}

function noteSnippetForDay(duties: Duty[], today: string, focus?: Duty) {
  const day = dutiesOnDate(duties, today);
  const ordered = [focus, ...day.filter((d) => d.id !== focus?.id)].filter(Boolean) as Duty[];
  for (const duty of ordered) {
    const note = duty.privateNotes?.trim();
    if (!note) continue;
    return note.length > 52 ? `${note.slice(0, 51)}…` : note;
  }
  return undefined;
}

function resolveDayKind(duties: Duty[], today: string, flights: Duty[]): WidgetDayKind {
  if (flights.length) return "flight";
  const day = dutiesOnDate(duties, today);
  if (day.some((d) => d.type === "standby")) return "standby";
  if (day.some((d) => d.type === "reserve")) return "reserve";
  // No flights (and no standby/reserve) → treat as day off
  return "off";
}

function dayKindCopy(
  kind: WidgetDayKind,
  base?: string,
): { headline: string; detail: string; statusLabel: string } {
  switch (kind) {
    case "standby":
      return {
        headline: base ? `Standby · ${base}` : "Standby",
        detail: base
          ? `BT-operated departures from ${base}`
          : "On call today — keep the app open for updates",
        statusLabel: "STANDBY",
      };
    case "reserve":
      return {
        headline: base ? `Reserve · ${base}` : "Reserve",
        detail: base
          ? `BT-operated departures from ${base}`
          : "Reserve duty today — stay reachable",
        statusLabel: "RESERVE",
      };
    case "off":
    case "empty":
    default:
      return {
        headline: "Day off",
        detail: "No flying today",
        statusLabel: "OFF",
      };
  }
}

function sbyDepartureSegments(rows: BaseDeparture[]): WidgetDaySegment[] {
  return rows.slice(0, 8).map((row) => {
    const times = departureTimes(row);
    const delayed = (row.delayMin ?? 0) > 0;
    return {
      kind: "flight" as const,
      label: departureBoardLabel(row),
      flightNumber: row.flightIata,
      aircraftType: row.aircraftType ?? undefined,
      gate: row.gate ? `Gate ${row.gate}` : row.terminal ? `T${row.terminal}` : undefined,
      status: delayed
        ? `Delayed +${Math.round(row.delayMin!)}m`
        : row.status
          ? row.status.replace(/_/g, " ")
          : "Scheduled",
      delayed,
      startTime: times.startTime,
      endTime: times.endTime,
    };
  });
}

function buildTomorrowPreview(duties: Duty[], today: string): WidgetTomorrowPreview {
  const tomorrow = nextDateKey(today);
  const flights = flightsOnDate(duties, tomorrow).filter(isFlightDuty);
  const kind = resolveDayKind(duties, tomorrow, flights);

  if (kind === "flight" && flights.length) {
    const bounds = shiftBounds(duties, tomorrow);
    const first = flights[0];
    const { dep, arr, via } = dayRoute(flights);
    const route = [dep, ...via, arr].filter(Boolean).join("→");
    const flightNums = flights.map((f) => f.flightNumber).filter(Boolean).join(" / ");
    const ciIso = bounds?.start || checkInIso(first);
    const checkInTime = ciIso ? formatClock(ciIso, airportTz(first.depIata)) : undefined;
    const detail = [flightNums || null, route || null, checkInTime ? `CI ${checkInTime}` : null, `${flights.length} sector${flights.length === 1 ? "" : "s"}`]
      .filter(Boolean)
      .join(" · ");
    return {
      kind: "flight",
      title: "Tomorrow",
      detail,
      route: route || undefined,
      flights: flightNums || undefined,
      checkInTime,
      flightCount: flights.length,
    };
  }

  if (kind === "standby" || kind === "reserve" || kind === "off") {
    const sby = todayStandby(duties, tomorrow);
    const copy = dayKindCopy(kind, sby?.depIata);
    return {
      kind,
      title: `Tomorrow · ${copy.headline}`,
      detail: copy.detail,
    };
  }

  return {
    kind: "off",
    title: "Tomorrow · Day off",
    detail: "No flying tomorrow",
  };
}

export type WidgetOptions = {
  position?: string;
  liveByIata?: Record<string, LiveFlight>;
  /** airBaltic departures from SBY base (BEG / RIX / …) */
  baseDepartures?: BaseDeparture[];
};

/** Build a compact snapshot for iOS WidgetKit. */
export function buildWidgetPayload(duties: Duty[], now = new Date(), opts: WidgetOptions = {}): WidgetPayload {
  const today = todayKey(now);
  const flights = flightsOnDate(duties, today).filter(isFlightDuty);
  const bounds = shiftBounds(duties, today);
  const focus = focusFlight(flights, now) ?? flights[0];
  const { dep: dayDep, arr: dayArr, via } = dayRoute(flights);
  const dayKind = resolveDayKind(duties, today, flights);
  const noteSnippet = noteSnippetForDay(duties, today, focus);
  const liveUpdatedAt = liveUpdatedAtSec(flights, opts.liveByIata);
  const tomorrow = buildTomorrowPreview(duties, today);
  const sby = todayStandby(duties, today);
  const flyingDone =
    flights.length > 0 &&
    flights.every((f) => {
      const left = minutesUntil(f.sta ?? f.std, now);
      return left != null && left <= 0;
    });

  // Pure SBY day, or flying finished and evening SBY remains
  if (sby && (!flights.length || flyingDone)) {
    return buildSbyBoardPayload(duties, today, now, opts, noteSnippet, liveUpdatedAt, tomorrow);
  }

  if (!focus && !flights.length) {
    return buildSbyBoardPayload(duties, today, now, opts, noteSnippet, liveUpdatedAt, tomorrow);
  }

  const first = flights[0] ?? focus!;
  const last = flights[flights.length - 1] ?? focus!;
  // Check-in is roster value or STD−1h10 — never live ETD / delay.
  const checkInIsoValue = bounds?.start || checkInIso(first) || first.std;
  const checkOutIso =
    bounds?.end || checkOutInstant(last)?.toISOString() || last.sta || last.std;
  const depTz = airportTz(focus?.depIata ?? dayDep);
  const arrTz = airportTz(focus?.arrIata ?? dayArr);

  const checkInTime = checkInIsoValue ? formatClock(checkInIsoValue, depTz) : undefined;
  const checkOutTime = checkOutIso ? formatClock(checkOutIso, arrTz) : undefined;
  const depTime = focus?.std ? formatClock(focus.std, airportTz(focus.depIata)) : undefined;
  const arrTime = focus?.sta ? formatClock(focus.sta, airportTz(focus.arrIata)) : undefined;
  const cabinClass = (focus?.position || opts.position || "").trim() || undefined;

  const reportAt = epochSec(checkInIsoValue);
  const checkoutAt = epochSec(checkOutIso);
  const phase = focus ? phaseForFlight(focus, now) : "pre";

  const toReport = minutesUntil(checkInIsoValue, now);
  const toStd = minutesUntil(focus?.std, now);
  const toSta = minutesUntil(focus?.sta, now);
  const toCheckout = minutesUntil(checkOutIso, now);

  let statusLabel = "ON DUTY";
  let countdown = "NOW";
  let progress = progressBetween(checkInIsoValue, checkOutIso, now);

  if (toReport != null && toReport > 0) {
    statusLabel = "REPORT IN";
    countdown = formatCountdown(toReport) ?? "—";
    progress = 0;
  } else if (toStd != null && toStd > 0) {
    statusLabel = "DEPARTS IN";
    countdown = formatCountdown(toStd) ?? "—";
    progress = Math.min(0.15, progressBetween(checkInIsoValue, focus?.std, now));
  } else if (toSta != null && toSta > 0) {
    statusLabel = phase === "landing" ? "LANDING IN" : "ARRIVE IN";
    countdown = formatCountdown(toSta) ?? "—";
    progress = progressBetween(focus?.std, focus?.sta, now);
  } else if (toCheckout != null && toCheckout > 0) {
    statusLabel = "CHECK OUT";
    countdown = formatCountdown(toCheckout) ?? "—";
    progress = 0.95;
  } else {
    statusLabel = "COMPLETED";
    countdown = "DONE";
    progress = 1;
  }

  const flightNumber = focus?.flightNumber;
  const route = focus ? flightRouteLabel(focus) : [dayDep, dayArr].filter(Boolean).join("–");
  const headline =
    toReport != null && toReport > 0
      ? `Report in ${formatCountdown(toReport)?.toLowerCase() ?? ""}`
      : flightNumber ?? route ?? "Duty";
  const detailParts = [
    flightNumber,
    route,
    checkInTime ? `CI ${checkInTime}` : null,
    checkOutTime ? `CO ${checkOutTime}` : null,
    noteSnippet,
  ];
  const detail = detailParts.filter(Boolean).join(" · ");

  const segments = buildDaySegments(flights, checkInIsoValue, checkOutIso, opts.liveByIata);

  return {
    type: "widget",
    updatedAt: now.getTime() / 1000,
    headline,
    detail,
    reportAt,
    checkoutAt,
    route,
    flightNumber,
    flightCount: flights.length,
    empty: false,
    dayKind: "flight",
    noteSnippet,
    liveUpdatedAt,
    tomorrow,
    depIata: focus?.depIata ?? dayDep,
    arrIata: focus?.arrIata ?? dayArr,
    depTime,
    arrTime,
    checkInTime,
    checkOutTime,
    cabinClass,
    statusLabel,
    countdown,
    progress,
    via: via.length ? via : undefined,
    segments,
  };
}

export function pushWidgetSnapshot(duties: Duty[], opts: WidgetOptions = {}) {
  const payload = buildWidgetPayload(duties, new Date(), opts);
  if (!hasNativeBridge()) return false;
  return postToNative(payload);
}

/** Keep trying briefly — WKWebView bridge may appear after first paint. */
export function startWidgetSync(getDuties: () => Duty[], getOpts: () => WidgetOptions = () => ({})) {
  if (typeof window === "undefined") return () => {};
  const push = () => pushWidgetSnapshot(getDuties(), getOpts());
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
