import { NextRequest } from "next/server";
import { toFlightIata } from "@/lib/airports";
import { isAirBalticOperated, type BaseDeparture } from "@/lib/base-departures";

const TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; data: BaseDeparture[] }>();

type Json = Record<string, unknown>;

async function getJson(url: string, ms = 10_000): Promise<Json | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ms),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Json;
  } catch {
    return null;
  }
}

function str(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function toUtcIso(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const hasOffset = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  const withT = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(hasOffset ? withT : `${withT}Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function rowsFrom(json: Json | null): Json[] {
  if (!json) return [];
  if (Array.isArray(json.response)) return json.response as Json[];
  if (Array.isArray(json.data)) return json.data as Json[];
  if (Array.isArray(json)) return json as unknown as Json[];
  return [];
}

function fromAirLabsRow(row: Json, fallbackDep: string): BaseDeparture | null {
  const airlineIata = str(row.airline_iata)?.toUpperCase();
  const airlineIcao = str(row.airline_icao)?.toUpperCase();
  const flightIata =
    toFlightIata(str(row.flight_iata) ?? "") ??
    toFlightIata(`${airlineIata ?? ""}${str(row.flight_number) ?? ""}`);
  const registration =
    str(row.reg_number) ?? str(row.registration) ?? str(row.aircraft_registration);
  const operatorIata =
    str(row.operator_iata)?.toUpperCase() ??
    str(row.operating_airline_iata)?.toUpperCase() ??
    str(row.op_airline_iata)?.toUpperCase();
  const operatorIcao =
    str(row.operator_icao)?.toUpperCase() ?? str(row.operating_airline_icao)?.toUpperCase();

  if (
    !isAirBalticOperated({
      airlineIata,
      airlineIcao,
      flightIata,
      csAirlineIata: str(row.cs_airline_iata),
      operatorIata,
      operatorIcao,
      registration,
      depIata: str(row.dep_iata) ?? fallbackDep,
    })
  ) {
    return null;
  }
  if (!flightIata) return null;
  return {
    flightIata,
    airlineIata,
    operatorIata: operatorIata ?? (airlineIata === "BT" ? "BT" : registration ? "BT" : undefined),
    registration: registration?.toUpperCase(),
    depIata: (str(row.dep_iata) ?? fallbackDep).toUpperCase(),
    arrIata: str(row.arr_iata)?.toUpperCase(),
    std: toUtcIso(row.dep_time_utc) ?? toUtcIso(row.dep_time),
    etd:
      toUtcIso(row.dep_actual_utc) ??
      toUtcIso(row.dep_estimated_utc) ??
      toUtcIso(row.dep_time_utc) ??
      toUtcIso(row.dep_time),
    sta: toUtcIso(row.arr_time_utc) ?? toUtcIso(row.arr_time),
    status: str(row.status),
    gate: str(row.dep_gate),
    terminal: str(row.dep_terminal),
    delayMin: num(row.delayed) ?? num(row.dep_delayed) ?? null,
    aircraftType: str(row.aircraft_icao) ?? str(row.aircraft_iata) ?? null,
  };
}

function mergeByKey(into: Map<string, BaseDeparture>, item: BaseDeparture) {
  const stamp = item.std ?? item.etd ?? "";
  const keyId = `${item.flightIata}|${stamp}`;
  const prev = into.get(keyId);
  if (!prev) {
    into.set(keyId, item);
    return;
  }
  into.set(keyId, {
    ...prev,
    ...Object.fromEntries(
      Object.entries(item).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    ),
    registration: item.registration || prev.registration,
    operatorIata: item.operatorIata || prev.operatorIata,
    airlineIata: item.airlineIata || prev.airlineIata,
  });
}

async function fromAirLabs(dep: string): Promise<BaseDeparture[]> {
  const key = process.env.AIRLABS_API_KEY;
  if (!key) return [];
  const qs = `dep_iata=${encodeURIComponent(dep)}&api_key=${encodeURIComponent(key)}`;
  // Full airport board + live flights (regs) — then keep BT-operated only
  const [sched, live, btOnly, lxOnly] = await Promise.all([
    getJson(`https://airlabs.co/api/v9/schedules?${qs}`),
    getJson(`https://airlabs.co/api/v9/flights?${qs}`),
    getJson(`https://airlabs.co/api/v9/schedules?${qs}&airline_iata=BT`),
    getJson(`https://airlabs.co/api/v9/schedules?${qs}&airline_iata=LX`),
  ]);

  const byKey = new Map<string, BaseDeparture>();
  for (const row of [
    ...rowsFrom(sched),
    ...rowsFrom(live),
    ...rowsFrom(btOnly),
    ...rowsFrom(lxOnly),
  ]) {
    const item = fromAirLabsRow(row, dep);
    if (item) mergeByKey(byKey, item);
  }
  return [...byKey.values()];
}

async function fromAviationStack(dep: string): Promise<BaseDeparture[]> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return [];
  const urls = [
    `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}&dep_iata=${encodeURIComponent(dep)}`,
    `http://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}&dep_iata=${encodeURIComponent(dep)}`,
  ];
  let json: Json | null = null;
  for (const url of urls) {
    json = await getJson(url);
    if (json && Array.isArray(json.data)) break;
  }
  const rows = Array.isArray(json?.data) ? (json.data as Json[]) : [];
  const out: BaseDeparture[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const airlineObj = row.airline && typeof row.airline === "object" ? (row.airline as Json) : undefined;
    const flightObj = row.flight && typeof row.flight === "object" ? (row.flight as Json) : undefined;
    const depObj = row.departure && typeof row.departure === "object" ? (row.departure as Json) : undefined;
    const arrObj = row.arrival && typeof row.arrival === "object" ? (row.arrival as Json) : undefined;
    const acObj = row.aircraft && typeof row.aircraft === "object" ? (row.aircraft as Json) : undefined;
    const code =
      toFlightIata(str(flightObj?.iata) ?? "") ??
      toFlightIata(`${str(airlineObj?.iata) ?? ""}${str(flightObj?.number) ?? ""}`);
    const registration = str(acObj?.registration)?.toUpperCase();
    if (
      !isAirBalticOperated({
        airlineIata: str(airlineObj?.iata),
        airlineIcao: str(airlineObj?.icao),
        flightIata: code,
        registration,
        depIata: str(depObj?.iata) ?? dep,
      })
    ) {
      continue;
    }
    if (!code) continue;
    const item: BaseDeparture = {
      flightIata: code,
      airlineIata: str(airlineObj?.iata)?.toUpperCase(),
      operatorIata: registration ? "BT" : str(airlineObj?.iata)?.toUpperCase() === "BT" ? "BT" : undefined,
      registration,
      depIata: (str(depObj?.iata) ?? dep).toUpperCase(),
      arrIata: str(arrObj?.iata)?.toUpperCase(),
      std: toUtcIso(depObj?.scheduled),
      etd: toUtcIso(depObj?.estimated) ?? toUtcIso(depObj?.actual) ?? toUtcIso(depObj?.scheduled),
      sta: toUtcIso(arrObj?.scheduled),
      status: str(row.flight_status),
      gate: str(depObj?.gate),
      terminal: str(depObj?.terminal),
      delayMin: num(depObj?.delay) ?? null,
      aircraftType: str(acObj?.icao) ?? str(acObj?.iata) ?? null,
    };
    const keyId = `${item.flightIata}|${item.std ?? ""}`;
    if (seen.has(keyId)) continue;
    seen.add(keyId);
    out.push(item);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const rawDep = (req.nextUrl.searchParams.get("dep") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(rawDep)) {
    return Response.json({ error: "Missing dep airport (IATA)" }, { status: 400 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const cacheKey = `${rawDep}|BT-op`;
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return Response.json({
      dep: rawDep,
      operator: "BT",
      flights: cached.data,
      updatedAt: cached.at,
    });
  }

  let flights = await fromAirLabs(rawDep);
  if (!flights.length) flights = await fromAviationStack(rawDep);
  flights.sort((a, b) => (a.std ?? a.etd ?? "").localeCompare(b.std ?? b.etd ?? ""));
  const at = Date.now();
  cache.set(cacheKey, { at, data: flights });
  return Response.json({
    dep: rawDep,
    operator: "BT",
    flights,
    updatedAt: at,
  });
}
