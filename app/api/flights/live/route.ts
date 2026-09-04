import { NextRequest } from "next/server";
import { toCallsign, toFlightIata } from "@/lib/airports";
import type { LiveFlight } from "@/lib/types";

const TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; data: LiveFlight }>();

type Json = Record<string, unknown>;

async function getJson(url: string, ms = 8000): Promise<Json | null> {
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

function obj(v: unknown): Json | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined;
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

function num(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function fromAirLabs(flightIata: string): Promise<Partial<LiveFlight>> {
  const key = process.env.AIRLABS_API_KEY;
  if (!key) return {};
  const sources: string[] = [];
  const flight = await getJson(
    `https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(flightIata)}&api_key=${encodeURIComponent(key)}`,
  );
  const response = (flight?.response as Json | undefined) ?? flight;
  const error = flight?.error as Json | undefined;
  if (error && !response) return { message: str(error.message) };

  const pick = (obj?: Json | null): Partial<LiveFlight> => {
    if (!obj) return {};
    return {
      status: str(obj.status),
      hex: str(obj.hex),
      registration: str(obj.reg_number),
      aircraftType: str(obj.aircraft_icao) ?? str(obj.model),
      etd:
        toUtcIso(obj.dep_actual_utc) ??
        toUtcIso(obj.dep_estimated_utc) ??
        toUtcIso(obj.dep_time_utc),
      eta:
        toUtcIso(obj.arr_actual_utc) ??
        toUtcIso(obj.arr_estimated_utc) ??
        toUtcIso(obj.arr_time_utc),
      std: toUtcIso(obj.dep_time_utc),
      sta: toUtcIso(obj.arr_time_utc),
      depGate: str(obj.dep_gate),
      arrGate: str(obj.arr_gate),
      terminal: str(obj.dep_terminal),
      delayMin: num(obj.dep_delayed) ?? num(obj.delayed) ?? null,
      lat: num(obj.lat) ?? null,
      lng: num(obj.lng) ?? null,
      alt: num(obj.alt) ?? null,
      heading: num(obj.dir) ?? null,
    };
  };

  let data = pick(response);
  if (data.status || data.registration || data.etd) sources.push("AirLabs");

  if (!data.status && !data.std) {
    const sched = await getJson(
      `https://airlabs.co/api/v9/schedules?flight_iata=${encodeURIComponent(flightIata)}&api_key=${encodeURIComponent(key)}`,
    );
    const rows = Array.isArray(sched?.response)
      ? (sched?.response as Json[])
      : Array.isArray(sched)
        ? (sched as unknown as Json[])
        : [];
    if (rows[0]) {
      data = { ...pick(rows[0]), ...data };
      sources.push("AirLabs schedules");
    }
  }

  return { ...data, sources };
}

async function fromAviationStack(flightIata: string): Promise<Partial<LiveFlight>> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return {};
  const qs = `access_key=${encodeURIComponent(key)}&flight_iata=${encodeURIComponent(flightIata)}&limit=10`;
  let json = await getJson(`https://api.aviationstack.com/v1/flights?${qs}`);
  const err = obj(json?.error);
  const errCode = str(err?.code) ?? (typeof err?.code === "number" ? String(err.code) : undefined);
  if (errCode === "https_access_restricted" || errCode === "105" || !json) {
    json = await getJson(`http://api.aviationstack.com/v1/flights?${qs}`);
  }
  if (obj(json?.error) && !Array.isArray(json?.data)) {
    return { message: str(obj(json?.error)?.info) ?? str(obj(json?.error)?.message) };
  }
  const rows = Array.isArray(json?.data) ? (json?.data as Json[]) : [];
  if (!rows.length) return {};

  const want = flightIata.toUpperCase();
  const matched = rows.filter((row) => {
    const flight = obj(row.flight);
    return str(flight?.iata)?.toUpperCase() === want;
  });
  const pool = matched.length ? matched : rows;
  const today = new Date().toISOString().slice(0, 10);
  const rank = (status?: string) =>
    status === "active" ? 0 : status === "landed" ? 1 : status === "scheduled" ? 2 : 3;
  const row =
    pool.find((r) => str(r.flight_date) === today) ??
    [...pool].sort((a, b) => rank(str(a.flight_status)) - rank(str(b.flight_status)))[0];
  if (!row) return {};

  const dep = obj(row.departure);
  const arr = obj(row.arrival);
  const aircraft = obj(row.aircraft);
  const live = obj(row.live);
  const delay = num(dep?.delay) ?? num(arr?.delay) ?? null;

  return {
    status: str(row.flight_status),
    registration: str(aircraft?.registration),
    aircraftType: str(aircraft?.icao) ?? str(aircraft?.iata),
    hex: str(aircraft?.icao24),
    etd: toUtcIso(dep?.actual) ?? toUtcIso(dep?.estimated) ?? toUtcIso(dep?.scheduled),
    eta: toUtcIso(arr?.actual) ?? toUtcIso(arr?.estimated) ?? toUtcIso(arr?.scheduled),
    std: toUtcIso(dep?.scheduled),
    sta: toUtcIso(arr?.scheduled),
    depGate: str(dep?.gate),
    arrGate: str(arr?.gate),
    terminal: str(dep?.terminal),
    delayMin: delay,
    lat: num(live?.latitude) ?? null,
    lng: num(live?.longitude) ?? null,
    alt: num(live?.altitude) ?? null,
    heading: num(live?.direction) ?? null,
    sources: ["AviationStack"],
  };
}

async function fromAdsb(callsign: string): Promise<Partial<LiveFlight>> {
  const json = await getJson(
    `https://api.adsb.lol/v2/callsign/${encodeURIComponent(callsign)}`,
    7000,
  );
  const ac = Array.isArray(json?.ac) ? (json?.ac as Json[])[0] : undefined;
  if (!ac) return {};
  return {
    callsign: str(ac.flight)?.trim(),
    hex: str(ac.hex),
    registration: str(ac.r),
    aircraftType: str(ac.t),
    lat: num(ac.lat) ?? null,
    lng: num(ac.lon) ?? null,
    alt: num(ac.alt_baro) ?? num(ac.alt_geom) ?? null,
    heading: num(ac.track) ?? null,
    status: "en-route",
    sources: ["adsb.lol"],
  };
}

async function fromHexdb(hex: string): Promise<Partial<LiveFlight>> {
  const json = await getJson(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(hex)}`, 6000);
  if (!json) return {};
  return {
    registration: str(json.Registration),
    aircraftType: str(json.ICAOTypeCode) ?? str(json.Type),
    sources: ["hexdb.io"],
  };
}

async function fromOpenSky(hex?: string, callsign?: string): Promise<Partial<LiveFlight>> {
  const url = hex
    ? `https://opensky-network.org/api/states/all?icao24=${encodeURIComponent(hex.toLowerCase())}`
    : "https://opensky-network.org/api/states/all";
  const json = await getJson(url, 8000);
  const states = Array.isArray(json?.states) ? (json?.states as unknown[][]) : [];
  const row = hex
    ? states[0]
    : states.find((s) => String(s[1] ?? "").trim().toUpperCase() === callsign?.toUpperCase());
  if (!row) return {};
  return {
    callsign: str(row[1])?.trim(),
    lat: num(row[6]) ?? null,
    lng: num(row[5]) ?? null,
    alt: num(row[7]) ?? null,
    heading: num(row[10]) ?? null,
    status: row[8] ? "landed" : "en-route",
    sources: ["OpenSky"],
  };
}

function merge(base: LiveFlight, extra: Partial<LiveFlight>): LiveFlight {
  const next = { ...base };
  const keys: (keyof LiveFlight)[] = [
    "status","registration","aircraftType","etd","eta","std","sta",
    "depGate","arrGate","terminal","delayMin","lat","lng","alt","heading","callsign","message","hex",
  ];
  for (const k of keys) {
    const v = extra[k];
    if (v !== undefined && v !== null && v !== "" && (next[k] === undefined || next[k] === null || next[k] === "")) {
      (next as Record<string, unknown>)[k] = v;
    }
  }
  if (extra.sources?.length) {
    next.sources = [...new Set([...next.sources, ...extra.sources])];
  }
  return next;
}

async function lookupLive(flightIata: string): Promise<LiveFlight> {
  const cached = cache.get(flightIata);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }

  const callsign = toCallsign(flightIata) ?? flightIata;
  let live: LiveFlight = {
    flightIata,
    callsign,
    sources: [],
    updatedAt: Date.now(),
  };

  const [airlabs, aviationstack, adsb] = await Promise.all([
    fromAirLabs(flightIata),
    fromAviationStack(flightIata),
    fromAdsb(callsign),
  ]);
  live = merge(live, airlabs);
  live = merge(live, aviationstack);
  live = merge(live, adsb);

  const icao24 = live.hex;
  if (icao24 && (!live.registration || !live.lat)) {
    if (!live.registration) live = merge(live, await fromHexdb(icao24));
    if (!live.lat) live = merge(live, await fromOpenSky(icao24, callsign));
  }

  if (!live.status && !live.registration && !live.etd && !live.lat) {
    live.unavailable = true;
    live.message = live.message ?? "Live data is unavailable for this flight right now.";
  }

  cache.set(flightIata, { at: Date.now(), data: live });
  return live;
}

function parseRequestedFlights(req: NextRequest) {
  const batch = req.nextUrl.searchParams.get("flights");
  const single = req.nextUrl.searchParams.get("flightIata") ?? "";
  const raw = batch ? batch.split(/[,\s]+/) : single ? [single] : [];
  return [...new Set(raw.map((item) => toFlightIata(item)).filter(Boolean) as string[])].slice(
    0,
    8,
  );
}

export async function GET(req: NextRequest) {
  const iatas = parseRequestedFlights(req);
  if (!iatas.length) {
    return Response.json({ error: "Missing flightIata" }, { status: 400 });
  }

  const flights = await Promise.all(iatas.map((code) => lookupLive(code)));
  if (iatas.length === 1 && !req.nextUrl.searchParams.get("flights")) {
    return Response.json(flights[0]);
  }
  return Response.json({ flights });
}
