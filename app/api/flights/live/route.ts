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
      etd: str(obj.dep_estimated_utc) ?? str(obj.dep_estimated) ?? str(obj.dep_time_utc),
      eta: str(obj.arr_estimated_utc) ?? str(obj.arr_estimated) ?? str(obj.arr_time_utc),
      std: str(obj.dep_time_utc) ?? str(obj.dep_time),
      sta: str(obj.arr_time_utc) ?? str(obj.arr_time),
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

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("flightIata") ?? "";
  const flightIata = toFlightIata(raw);
  if (!flightIata) {
    return Response.json({ error: "Missing flightIata" }, { status: 400 });
  }

  const cached = cache.get(flightIata);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return Response.json(cached.data);
  }

  const callsign = toCallsign(flightIata) ?? flightIata;
  let live: LiveFlight = {
    flightIata,
    callsign,
    sources: [],
    updatedAt: Date.now(),
  };

  const [airlabs, adsb] = await Promise.all([
    fromAirLabs(flightIata),
    fromAdsb(callsign),
  ]);
  live = merge(live, airlabs);
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
  return Response.json(live);
}
