import { airportTz } from "@/lib/airports";
import { formatClock, parseFlightInstant } from "@/lib/dates";
import type { Duty } from "@/lib/types";

/** airBaltic IATA / ICAO */
export const SBY_BOARD_AIRLINE = "BT";
export const SBY_BOARD_ICAO = "BTI";
/** Latvian registry — airBaltic AOC fleet (incl. wet-lease on LX etc.) */
export const BT_REG_RE = /^YL-/i;
/**
 * Airports where BT* marketing usually means BT-operated (own schedule).
 * Elsewhere BT404-style codeshares (e.g. on JU404 BEG–FCO) must not count.
 */
export const BT_OWN_DEP_HUBS = new Set(["RIX"]);

export type BaseDeparture = {
  flightIata: string;
  depIata: string;
  arrIata?: string;
  /** Marketing airline (LX, BT, …) */
  airlineIata?: string;
  /** Operating carrier when known (BT / BTI) */
  operatorIata?: string;
  registration?: string;
  std?: string | null;
  etd?: string | null;
  sta?: string | null;
  status?: string;
  gate?: string | null;
  terminal?: string | null;
  delayMin?: number | null;
  aircraftType?: string | null;
};

export type OperatorHints = {
  airlineIata?: string | null;
  airlineIcao?: string | null;
  flightIata?: string | null;
  csAirlineIata?: string | null;
  /** Explicit operator when the feed provides it */
  operatorIata?: string | null;
  operatorIcao?: string | null;
  registration?: string | null;
  depIata?: string | null;
};

/**
 * True when airBaltic is the *operating* carrier (own metal / wet-lease),
 * not merely a codeshare marketing code (BT404 on JU404, etc.).
 */
export function isAirBalticOperated(row: OperatorHints) {
  const airline = (row.airlineIata ?? "").toUpperCase();
  const airlineIcao = (row.airlineIcao ?? "").toUpperCase();
  const flight = (row.flightIata ?? "").toUpperCase();
  const op = (row.operatorIata ?? "").toUpperCase();
  const opIcao = (row.operatorIcao ?? "").toUpperCase();
  const reg = (row.registration ?? "").toUpperCase().replace(/\s+/g, "");
  const cs = (row.csAirlineIata ?? "").toUpperCase();
  const dep = (row.depIata ?? "").toUpperCase();

  // Explicit operating carrier
  if (op === SBY_BOARD_AIRLINE || opIcao === SBY_BOARD_ICAO) return true;
  // BT metal / Latvian registry — JU/LX wet-lease with YL- still needs BT crew
  if (reg && BT_REG_RE.test(reg)) return true;

  const marketedBt =
    airline === SBY_BOARD_AIRLINE ||
    airlineIcao === SBY_BOARD_ICAO ||
    flight.startsWith(SBY_BOARD_AIRLINE);
  if (!marketedBt) return false;

  // Known codeshare partner → not BT-operated
  if (cs && cs !== SBY_BOARD_AIRLINE && cs !== SBY_BOARD_ICAO) return false;

  // Marketing BT* without metal/operator: only trust at BT’s own hubs (e.g. RIX)
  if (dep && BT_OWN_DEP_HUBS.has(dep)) return true;
  return false;
}

export function todayStandby(duties: Duty[], date: string): Duty | undefined {
  return duties
    .filter((d) => d.date === date && (d.type === "standby" || d.type === "reserve"))
    .sort((a, b) => (a.std ?? "").localeCompare(b.std ?? ""))[0];
}

/** Prefer SBY airport; else infer from today’s last landing / first dep (common after a flying duty). */
export function resolveSbyBase(sby: Duty | undefined, flights: Duty[] = []) {
  const fromSby = sby?.depIata?.trim().toUpperCase();
  if (fromSby && /^[A-Z]{3}$/.test(fromSby)) return fromSby;
  const sorted = [...flights].sort((a, b) => (a.std ?? "").localeCompare(b.std ?? ""));
  const lastArr = sorted[sorted.length - 1]?.arrIata?.trim().toUpperCase();
  if (lastArr && /^[A-Z]{3}$/.test(lastArr)) return lastArr;
  const firstDep = sorted[0]?.depIata?.trim().toUpperCase();
  if (firstDep && /^[A-Z]{3}$/.test(firstDep)) return firstDep;
  return undefined;
}

/**
 * Live status means the sector already has operating crew (not a call-out target for SBY).
 * en-route / active / departed / airborne, etc.
 */
export function isDepartureAlreadyCrewed(row: Pick<BaseDeparture, "status">) {
  const status = (row.status ?? "").toLowerCase().replace(/[_-]+/g, " ");
  if (!status) return false;
  return (
    status.includes("en route") ||
    status.includes("enroute") ||
    status.includes("airborne") ||
    status.includes("in air") ||
    status.includes("in flight") ||
    status.includes("departed") ||
    status === "active" ||
    status.includes(" active") ||
    status.startsWith("active ")
  );
}

/** Keep departures that still matter during the SBY window (or remaining today). */
export function filterDeparturesForStandby(
  rows: BaseDeparture[],
  sby: Duty | undefined,
  now = new Date(),
) {
  const windowStart = parseFlightInstant(sby?.std)?.getTime() ?? now.getTime() - 60 * 60 * 1000;
  const windowEnd =
    parseFlightInstant(sby?.sta)?.getTime() ?? now.getTime() + 18 * 60 * 60 * 1000;

  return rows
    .filter((row) => {
      // Already airborne → crew on board; SBY does not need this flight
      if (isDepartureAlreadyCrewed(row)) return false;

      const when = parseFlightInstant(row.etd ?? row.std);
      if (!when) return true;
      const t = when.getTime();
      if (t < windowStart - 30 * 60 * 1000) return false;
      if (t > windowEnd + 30 * 60 * 1000) return false;
      const status = (row.status ?? "").toLowerCase();
      if (status.includes("landed") || status.includes("cancelled") || status.includes("canceled")) {
        return false;
      }
      // Drop departures already gone >45m ago
      if (t < now.getTime() - 45 * 60 * 1000) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = parseFlightInstant(a.etd ?? a.std)?.getTime() ?? 0;
      const tb = parseFlightInstant(b.etd ?? b.std)?.getTime() ?? 0;
      return ta - tb;
    });
}

export function departureBoardLabel(row: BaseDeparture) {
  const dep = row.depIata;
  const arr = row.arrIata;
  if (dep && arr) return `${dep} → ${arr}`;
  return row.flightIata;
}

/** e.g. LX1234 marketed Swiss, BT-operated */
export function departureOperatorHint(row: BaseDeparture) {
  const mkt = (row.airlineIata ?? row.flightIata.slice(0, 2)).toUpperCase();
  if (mkt && mkt !== SBY_BOARD_AIRLINE) {
    return row.registration ? `BT op · ${row.registration}` : "BT operated";
  }
  return row.registration || undefined;
}

export function departureTimes(row: BaseDeparture) {
  const tz = airportTz(row.depIata);
  const start = row.etd || row.std;
  const end = row.sta;
  return {
    startTime: start ? formatClock(start, tz) : undefined,
    endTime: end ? formatClock(end, airportTz(row.arrIata)) : undefined,
  };
}

export async function fetchBaseDepartures(
  depIata: string,
  opts?: { force?: boolean },
): Promise<BaseDeparture[]> {
  const code = depIata.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return [];
  const qs = new URLSearchParams({ dep: code });
  if (opts?.force) qs.set("force", "1");
  const res = await fetch(`/api/flights/departures?${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { flights?: BaseDeparture[] };
  return Array.isArray(json.flights) ? json.flights : [];
}
