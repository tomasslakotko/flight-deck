import type { Duty, LiveFlight } from "@/lib/types";
import { airportTz } from "@/lib/airports";
import { dateKeyInZone, formatClock, minutesUntil, nextDateKey, parseFlightInstant } from "@/lib/dates";
import { pickAirportCode, pickRoute } from "@/lib/route-text";

/** Consecutive flights with a ground time at or under this stay on the same shift. */
export const MAX_TURNAROUND_MIN = 60;

function instant(iso?: string | null) {
  return parseFlightInstant(iso);
}

export function isFlightDuty(duty: Duty) {
  if (duty.type === "checkin" || duty.type === "off" || duty.type === "standby" || duty.type === "reserve" || duty.type === "hotel" || duty.type === "sim" || duty.type === "ground") {
    return false;
  }
  return duty.type === "flight" || Boolean(duty.flightNumber) || Boolean(duty.depIata && duty.arrIata);
}

function byStd(a: Duty, b: Duty) {
  return (a.std ?? a.date).localeCompare(b.std ?? b.date);
}

function arrivalInstant(duty: Duty) {
  const std = instant(duty.std);
  let sta = instant(duty.sta);
  if (!sta) return null;
  if (std && sta.getTime() <= std.getTime()) {
    sta = new Date(sta.getTime() + 24 * 60 * 60 * 1000);
  }
  return sta;
}

function nearbyFlights(prev: Duty, next: Duty, maxMin = 360) {
  const std = instant(prev.std);
  let land = instant(prev.sta);
  const dep = instant(next.std);
  if (!land || !dep) return false;
  if (std && land.getTime() <= std.getTime()) {
    land = new Date(land.getTime() + 24 * 60 * 60 * 1000);
  }
  const gapMin = (dep.getTime() - land.getTime()) / 60_000;
  return gapMin >= -15 && gapMin <= maxMin;
}

export function isShortTurnaround(prev: Duty, next: Duty, maxMin = MAX_TURNAROUND_MIN) {
  if (!nearbyFlights(prev, next, maxMin)) return false;
  if (prev.arrIata && next.depIata && prev.arrIata !== next.depIata) return false;
  return true;
}

function dutyBlob(duty: Duty) {
  return `${duty.title}\n${duty.notes ?? ""}\n${duty.flightNumber ?? ""}`;
}

function withTextRoute(duty: Duty): Duty {
  const fromText = pickRoute(dutyBlob(duty));
  const single = pickAirportCode(dutyBlob(duty));
  const dep = duty.depIata || fromText.depIata || single;
  const arr = duty.arrIata || fromText.arrIata;
  if (dep === duty.depIata && arr === duty.arrIata) return duty;
  return { ...duty, depIata: dep, arrIata: arr };
}

function withNeighborRoute(duty: Duty, prev?: Duty, next?: Duty): Duty {
  let dep = duty.depIata;
  let arr = duty.arrIata;
  if (!dep && prev?.arrIata && nearbyFlights(prev, duty)) dep = prev.arrIata;
  if (!arr && next?.depIata && nearbyFlights(duty, next)) arr = next.depIata;
  if (!arr && dep && prev?.depIata && prev.arrIata === dep && nearbyFlights(prev, duty, MAX_TURNAROUND_MIN)) {
    arr = prev.depIata;
  }
  if (!dep && arr && next?.arrIata && next.depIata === arr && nearbyFlights(duty, next, MAX_TURNAROUND_MIN)) {
    dep = next.arrIata;
  }
  if (dep === duty.depIata && arr === duty.arrIata) return duty;
  return { ...duty, depIata: dep, arrIata: arr };
}

/** Fill missing dep/arr from text and neighbouring legs (already-stored rosters too). */
export function enrichDutyRoutes(duties: Duty[]): Duty[] {
  const fromText = duties.map((d) => (isFlightDuty(d) ? withTextRoute(d) : d));
  const flights = fromText.filter(isFlightDuty).sort(byStd);
  const filled = new Map<string, Duty>();
  for (let i = 0; i < flights.length; i++) {
    const next = withNeighborRoute(flights[i], flights[i - 1], flights[i + 1]);
    flights[i] = next;
    filled.set(next.id, next);
  }
  for (let i = flights.length - 1; i >= 0; i--) {
    const next = withNeighborRoute(flights[i], flights[i - 1], flights[i + 1]);
    flights[i] = next;
    filled.set(next.id, next);
  }
  return fromText.map((d) => filled.get(d.id) ?? d);
}

function withRoutes(duties: Duty[]) {
  return enrichDutyRoutes(duties);
}

/** Group flights that are one duty: overnight returns with a short turnaround stay together. */
export function flightPairings(duties: Duty[]): Duty[][] {
  const flights = withRoutes(duties).filter(isFlightDuty).sort(byStd);
  const groups: Duty[][] = [];
  for (const flight of flights) {
    const lastGroup = groups[groups.length - 1];
    const prev = lastGroup?.[lastGroup.length - 1];
    if (prev && isShortTurnaround(prev, flight)) lastGroup.push(flight);
    else groups.push([flight]);
  }
  return groups;
}

export function pairingStartDate(group: Duty[]) {
  const first = group[0];
  if (!first) return "";
  const fromStd = dateKeyInZone(first.std, airportTz(first.depIata));
  return fromStd || first.date;
}

export function pairingEndDate(group: Duty[]) {
  let end = pairingStartDate(group);
  for (const duty of group) {
    if (duty.date > end) end = duty.date;
    const land = arrivalInstant(duty);
    const fromSta = land ? dateKeyInZone(land, airportTz(duty.arrIata)) : "";
    if (fromSta > end) end = fromSta;
    const fromStd = dateKeyInZone(duty.std, airportTz(duty.depIata));
    if (fromStd > end) end = fromStd;
  }
  return end;
}

function dutyTouchesDate(duty: Duty, date: string) {
  if (duty.date === date) return true;
  const start = dateKeyInZone(duty.std, airportTz(duty.depIata)) || duty.date;
  const land = arrivalInstant(duty);
  const end = (land ? dateKeyInZone(land, airportTz(duty.arrIata)) : "") || start;
  if (!start) return false;
  const last = end >= start ? end : start;
  return start <= date && date <= last;
}

function pairingTouchesDate(group: Duty[], date: string) {
  const start = pairingStartDate(group);
  const end = pairingEndDate(group);
  if (start && start <= date && date <= end) return true;
  return group.some((duty) => dutyTouchesDate(duty, date));
}

function putDuty(map: Map<string, Duty[]>, key: string, duty: Duty) {
  const list = map.get(key) ?? [];
  list.push(duty);
  map.set(key, list);
}

/** Week view: the whole pairing sits on the day the shift starts. */
export function dutiesByScheduleDate(duties: Duty[]) {
  const rows = withRoutes(duties);
  const pairings = flightPairings(rows);
  const shiftDate = new Map<string, string>();
  for (const group of pairings) {
    const start = pairingStartDate(group);
    for (const duty of group) shiftDate.set(duty.id, start);
  }
  const map = new Map<string, Duty[]>();
  for (const duty of rows) {
    putDuty(map, shiftDate.get(duty.id) ?? duty.date, duty);
  }
  for (const list of map.values()) list.sort(byStd);
  return map;
}

export type ShiftContinuation = {
  fromDate: string;
  last: Duty;
  flights: Duty[];
};

/** Overlap days after the shift-start date: compact continuation, not a second full pairing. */
export function continuationsByDate(duties: Duty[]) {
  const map = new Map<string, ShiftContinuation[]>();
  for (const group of flightPairings(duties)) {
    const start = pairingStartDate(group);
    const end = pairingEndDate(group);
    if (!start || !end || start >= end) continue;
    const last = group[group.length - 1];
    if (!last) continue;
    let day = nextDateKey(start);
    while (day && day <= end) {
      const list = map.get(day) ?? [];
      list.push({ fromDate: start, last, flights: group });
      map.set(day, list);
      day = nextDateKey(day);
    }
  }
  return map;
}

function uniqueById(duties: Duty[]) {
  const seen = new Set<string>();
  const out: Duty[] = [];
  for (const duty of duties) {
    if (seen.has(duty.id)) continue;
    seen.add(duty.id);
    out.push(duty);
  }
  return out;
}

function dutiesTouchingDate(duties: Duty[], date: string) {
  const rows = withRoutes(duties);
  const ids = new Set<string>();
  for (const group of flightPairings(rows)) {
    if (!pairingTouchesDate(group, date)) continue;
    for (const duty of group) ids.add(duty.id);
  }
  return uniqueById(
    rows
      .filter((d) => ids.has(d.id) || d.date === date || (isFlightDuty(d) && dutyTouchesDate(d, date)))
      .sort(byStd),
  );
}

export function flightsOnDate(duties: Duty[], date: string) {
  return dutiesTouchingDate(duties, date).filter(isFlightDuty);
}

export function dutiesOnDate(duties: Duty[], date: string) {
  return dutiesTouchingDate(duties, date);
}

export const CHECK_OUT_AFTER_STA_MIN = 30;

/** Crew check-in is fixed vs scheduled STD — delays / ETD never move it. */
export const CHECK_IN_BEFORE_STD_MIN = 70;

/** Report time: roster check-in if present, else STD − 1h10. Never uses live ETD. */
export function checkInInstant(duty: Duty) {
  if (duty.checkIn) return instant(duty.checkIn);
  const std = instant(duty.std);
  if (!std) return null;
  return new Date(std.getTime() - CHECK_IN_BEFORE_STD_MIN * 60_000);
}

export function checkInIso(duty: Duty) {
  return checkInInstant(duty)?.toISOString() ?? undefined;
}

export function checkOutInstant(duty: Duty) {
  const land = arrivalInstant(duty);
  if (!land) return null;
  return new Date(land.getTime() + CHECK_OUT_AFTER_STA_MIN * 60_000);
}

export function shiftBounds(duties: Duty[], date: string) {
  const day = dutiesOnDate(duties, date).filter((d) => d.type !== "off");
  const flights = day.filter(isFlightDuty);
  if (!day.length) return null;
  const first = flights[0] ?? day[0];
  const last = flights[flights.length - 1] ?? day[day.length - 1];
  const start = checkInIso(first) || first.std;
  const end = checkOutInstant(last)?.toISOString() || last.sta || last.std;
  return { start, end, duties: day };
}

export type FlightPhase =
  | "pre"
  | "preparation"
  | "boarding"
  | "service"
  | "landing"
  | "transfer"
  | "done";

export function phaseForFlight(duty: Duty, now = new Date()): FlightPhase {
  if (!duty.std) return "pre";
  const toStd = minutesUntil(duty.std, now) ?? 0;
  const toSta = minutesUntil(duty.sta, now) ?? toStd - 90;
  if (toStd > 60) return "pre";
  if (toStd > 30) return "preparation";
  if (toStd > 0) return "boarding";
  if (toSta > 30) return "service";
  if (toSta > 0) return "landing";
  if (toSta > -30) return "transfer";
  return "done";
}

export function focusFlight(flights: Duty[], now = new Date()) {
  const sorted = [...flights].filter(isFlightDuty).sort(byStd);
  if (!sorted.length) return undefined;
  const open = sorted.find((f) => phaseForFlight(f, now) !== "done");
  return open ?? sorted[sorted.length - 1];
}

export function phaseForShift(flights: Duty[], now = new Date()): FlightPhase {
  const sorted = [...flights].filter(isFlightDuty).sort(byStd);
  if (!sorted.length) return "pre";
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const report = checkInIso(first) || first.std;
  const toReport = minutesUntil(report, now);
  const toLastSta = minutesUntil(last.sta || last.std, now) ?? 0;
  if (toReport != null && toReport > 60) return "pre";
  if (toLastSta <= -30) return "done";
  if (toLastSta <= 0) return "transfer";
  const focus = focusFlight(sorted, now);
  return focus ? phaseForFlight(focus, now) : "pre";
}

export const PHASE_LABEL: Record<FlightPhase, string> = {
  pre: "Before report",
  preparation: "Check in",
  boarding: "Boarding",
  service: "Service",
  landing: "Landing prep",
  transfer: "Check out",
  done: "Completed",
};

function asDutyList(dutyOrFlights: Duty | Duty[]) {
  return (Array.isArray(dutyOrFlights) ? dutyOrFlights : [dutyOrFlights]).filter(isFlightDuty).sort(byStd);
}

export function phaseSchedule(dutyOrFlights: Duty | Duty[]) {
  const list = asDutyList(dutyOrFlights);
  const first = list[0];
  const last = list[list.length - 1];
  const focus = focusFlight(list) ?? first;
  if (!first?.std || !focus?.std) return [];
  const firstStd = instant(first.std);
  const focusStd = instant(focus.std);
  const focusSta = arrivalInstant(focus) ?? (focusStd ? new Date(focusStd.getTime() + 90 * 60_000) : null);
  const lastSta = arrivalInstant(last) ?? focusSta;
  if (!firstStd || !focusStd || !focusSta || !lastSta) return [];
  const report = checkInInstant(first) ?? new Date(firstStd.getTime() - CHECK_IN_BEFORE_STD_MIN * 60_000);
  const depTz = airportTz(first.depIata);
  const focusDepTz = airportTz(focus.depIata);
  const focusArrTz = airportTz(focus.arrIata);
  const lastArrTz = airportTz(last.arrIata);
  const mk = (label: string, date: Date, key: FlightPhase, timeZone?: string) => ({
    label,
    time: formatClock(date.toISOString(), timeZone),
    key,
  });
  const at = (base: Date, min: number) => new Date(base.getTime() + min * 60_000);
  return [
    mk("Check in", report ?? at(firstStd, -CHECK_IN_BEFORE_STD_MIN), "preparation", depTz),
    mk("Boarding", at(focusStd, -30), "boarding", focusDepTz),
    mk("Service", at(focusStd, 20), "service", focusDepTz),
    mk("Landing prep", at(focusSta, -30), "landing", focusArrTz),
    mk("Check out", at(lastSta, CHECK_OUT_AFTER_STA_MIN), "transfer", lastArrTz),
  ];
}

export function nextDuty(duties: Duty[], now = new Date()) {
  const upcoming = withRoutes(duties)
    .filter((d) => isFlightDuty(d) && d.std && (arrivalInstant(d)?.getTime() ?? 0) > now.getTime())
    .sort((a, b) => (a.std ?? "").localeCompare(b.std ?? ""));
  return upcoming[0];
}

/** First flight pairing that starts after the current shift ends (check-out). */
export function nextPairingAfter(duties: Duty[], afterIso?: string | null) {
  const after = afterIso ? instant(afterIso)?.getTime() : undefined;
  if (after == null) return null;
  for (const group of flightPairings(duties)) {
    const first = group[0];
    if (!first) continue;
    const start = checkInInstant(first)?.getTime() ?? instant(first.std)?.getTime() ?? 0;
    if (start > after) return group;
  }
  return null;
}

/** Prefer live status, but never keep "scheduled" after STA. */
export function resolvedFlightStatus(duty: Duty, live?: LiveFlight | null, now = new Date()) {
  const raw = (live?.status ?? "").toLowerCase();
  if (raw.includes("cancel")) return live?.status;
  const sta = arrivalInstant(duty) ?? instant(live?.sta ?? undefined);
  const std = instant(duty.std) ?? instant(live?.std ?? undefined);
  if (sta && now.getTime() > sta.getTime()) {
    if (!raw || raw.includes("schedul") || raw.includes("active") || raw.includes("en-route") || raw.includes("land")) {
      return "landed";
    }
  }
  if (std && sta && now.getTime() >= std.getTime() && now.getTime() <= sta.getTime()) {
    if (!raw || raw.includes("schedul")) return "en-route";
  }
  return live?.status;
}
