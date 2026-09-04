import type { Duty, ImportPreview } from "@/lib/types";
import { toFlightIata } from "@/lib/airports";
import { dateKey, hhmmOnDate, parseFlightInstant } from "@/lib/dates";

/** NetLine/CrewLink IDP clocks are UTC (same as crew iCal Zulu). */
const NETLINE_TZ = "UTC";

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

const DAY_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(\d{2})\b/gi;
/** JU 422 BEG 1110 1255 IST | BT 211 R RIX 0400 0540 BER | DH/BT 488 BEG 1200 1415 RIX */
const FLIGHT_RE =
  /\b(?:DH\/)?([A-Z]{2})\s+(\d{2,4})\s+(?:R\s+)?([A-Z]{3})\s+(\d{3,4})\s+(\d{3,4})\s+([A-Z]{3})\b/gi;
const CHECKIN_RE = /\bC\/I\s+([A-Z]{3})\s+(\d{3,4})\b/gi;
const DAYOFF_RE = /\bDAYOFF\b/i;
const SBY_RE = /\b(SBY[A-Z0-9-]*)\s+([A-Z]{3})\s+(\d{3,4})\s+(\d{3,4})\b/gi;

function shortHash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function uid(seed: string) {
  const clean = seed.replace(/[^A-Za-z0-9-]/g, "");
  return `pdf-${clean.slice(0, 48)}-${shortHash(seed)}`;
}

function padTime(hhmm: string) {
  const raw = hhmm.replace(/\D/g, "").padStart(4, "0").slice(-4);
  return `${raw.slice(0, 2)}:${raw.slice(2)}`;
}

function parsePeriod(text: string) {
  const m = text.match(
    /Period:\s*(\d{1,2})([A-Za-z]{3})(\d{2})\s*[-–—]\s*(\d{1,2})([A-Za-z]{3})(\d{2})/i,
  );
  if (!m) return null;
  const y1 = 2000 + Number(m[3]);
  const y2 = 2000 + Number(m[6]);
  const start = new Date(y1, MONTHS[m[2].toUpperCase()] ?? 0, Number(m[1]), 12);
  const end = new Date(y2, MONTHS[m[5].toUpperCase()] ?? 0, Number(m[4]), 12);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function dayDate(dayNum: number, period: { start: Date; end: Date }) {
  const candidates = [
    new Date(period.start.getFullYear(), period.start.getMonth(), dayNum, 12),
    new Date(period.start.getFullYear(), period.start.getMonth() + 1, dayNum, 12),
    new Date(period.start.getFullYear(), period.start.getMonth() - 1, dayNum, 12),
  ];
  const startMs = new Date(period.start);
  startMs.setHours(0, 0, 0, 0);
  const endMs = new Date(period.end);
  endMs.setHours(23, 59, 59, 999);
  return (
    candidates.find((d) => !Number.isNaN(d.getTime()) && d >= startMs && d <= endMs) ??
    candidates[0]
  );
}

function flightKey(duty: Duty) {
  return `${duty.date}|${duty.flightNumber ?? duty.title}|${duty.depIata ?? ""}|${duty.arrIata ?? ""}|${duty.type}`;
}

function preferDuty(a: Duty, b: Duty) {
  const score = (d: Duty) =>
    (d.checkIn ? 4 : 0) +
    (d.source === "pdf" ? 2 : 0) +
    (d.aircraftType ? 1 : 0) +
    (d.notes?.length ?? 0) / 100;
  return score(b) > score(a) ? b : a;
}

export function looksLikeNetlineIdp(text: string) {
  return /Individual duty plan|NetLine\/Crew/i.test(text);
}

/** Collapse duplicate same-day sectors (e.g. iCal UTC + PDF local). */
export function dedupeFlightDuties(duties: Duty[]) {
  const byFlight = new Map<string, Duty>();
  const other: Duty[] = [];

  for (const duty of duties) {
    if (duty.type !== "flight" && duty.type !== "travel") {
      other.push(duty);
      continue;
    }
    const key = flightKey(duty);
    const prev = byKeyOrNear(byFlight, key, duty);
    if (!prev) {
      byFlight.set(key, duty);
      continue;
    }
    byFlight.set(key, preferDuty(prev, duty));
  }

  const byOff = new Map<string, Duty>();
  const byOther = new Map<string, Duty>();
  for (const duty of other) {
    if (duty.type === "off") {
      byOff.set(duty.date, duty);
      continue;
    }
    const key = `${duty.date}|${duty.type}|${duty.title}|${duty.std ?? ""}`;
    byOther.set(key, duty);
  }

  return [...byFlight.values(), ...byOff.values(), ...byOther.values()].sort((a, b) =>
    (a.std ?? a.date).localeCompare(b.std ?? b.date),
  );
}

function nearStd(a?: string, b?: string) {
  const ta = parseFlightInstant(a)?.getTime() ?? 0;
  const tb = parseFlightInstant(b)?.getTime() ?? 0;
  if (!ta || !tb) return true;
  return Math.abs(ta - tb) <= 3 * 60 * 60 * 1000;
}

function byKeyOrNear(map: Map<string, Duty>, key: string, duty: Duty) {
  const exact = map.get(key);
  if (exact && nearStd(exact.std, duty.std)) return exact;

  for (const prev of map.values()) {
    if (prev.date !== duty.date) continue;
    if ((prev.flightNumber ?? "") !== (duty.flightNumber ?? "")) continue;
    if ((prev.depIata ?? "") !== (duty.depIata ?? "")) continue;
    if ((prev.arrIata ?? "") !== (duty.arrIata ?? "")) continue;
    if (nearStd(prev.std, duty.std)) return prev;
  }
  return undefined;
}

/** Parse airBaltic / NetLine CrewLink Individual Duty Plan PDF text. */
export function parseNetlineIdp(raw: string, source: Duty["source"] = "pdf"): ImportPreview {
  const text = raw.replace(/\s+/g, " ").trim();
  const unmatched: string[] = [];
  const duties: Duty[] = [];
  const period = parsePeriod(text);
  if (!period) {
    return { duties: [], unmatched: ["Could not read Period: from NetLine duty plan"] };
  }

  const markers = [...text.matchAll(DAY_RE)];
  if (!markers.length) {
    return { duties: [], unmatched: ["No day columns found in NetLine duty plan"] };
  }

  // Prefer the duty-table slice (most flights), not the long CRM crew strip
  const bestSlice = new Map<string, { day: Date; slice: string; score: number }>();
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const dayNum = Number(marker[2]);
    const day = dayDate(dayNum, period);
    if (Number.isNaN(day.getTime())) continue;
    const startIdx = marker.index ?? 0;
    const endIdx = i + 1 < markers.length ? (markers[i + 1].index ?? text.length) : text.length;
    const slice = text.slice(startIdx, endIdx);
    if (slice.length < 8) continue;
    const key = dateKey(day);
    FLIGHT_RE.lastIndex = 0;
    const flightHits = [...slice.matchAll(new RegExp(FLIGHT_RE.source, "gi"))].length;
    const hasCheckIn = /C\/I\s+[A-Z]{3}/i.test(slice) ? 2 : 0;
    const score = flightHits * 10 + hasCheckIn + Math.min(slice.length, 40) / 40;
    const prev = bestSlice.get(key);
    if (!prev || score > prev.score) bestSlice.set(key, { day, slice, score });
  }

  for (const { day, slice } of bestSlice.values()) {
    const date = dateKey(day);

    FLIGHT_RE.lastIndex = 0;
    if (DAYOFF_RE.test(slice) && !new RegExp(FLIGHT_RE.source, "i").test(slice)) {
      duties.push({
        id: uid(`${date}-off`),
        uid: uid(`${date}-off`),
        date,
        type: "off",
        title: "Day off",
        source,
      });
      continue;
    }

    let checkIn: string | undefined;
    CHECKIN_RE.lastIndex = 0;
    const ci = CHECKIN_RE.exec(slice);
    if (ci) {
      checkIn = hhmmOnDate(padTime(ci[2]), day, NETLINE_TZ);
    }

    SBY_RE.lastIndex = 0;
    for (const sby of slice.matchAll(SBY_RE)) {
      const std = hhmmOnDate(padTime(sby[3]), day, NETLINE_TZ);
      let sta = hhmmOnDate(padTime(sby[4]), day, NETLINE_TZ);
      if (std && sta && Date.parse(sta) <= Date.parse(std)) {
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        sta = hhmmOnDate(padTime(sby[4]), next, NETLINE_TZ);
      }
      duties.push({
        id: uid(`${date}-${sby[1]}-${sby[3]}`),
        uid: uid(`${date}-${sby[1]}-${sby[3]}`),
        date,
        type: "standby",
        title: sby[1].toUpperCase(),
        depIata: sby[2],
        std,
        sta,
        source,
      });
    }

    FLIGHT_RE.lastIndex = 0;
    let firstFlight = true;
    for (const m of slice.matchAll(FLIGHT_RE)) {
      const airline = m[1].toUpperCase();
      const num = m[2];
      const dep = m[3].toUpperCase();
      const arr = m[6].toUpperCase();
      const flightNumber = toFlightIata(`${airline}${num}`) ?? `${airline}${num}`;
      const std = hhmmOnDate(padTime(m[4]), day, NETLINE_TZ);
      let sta = hhmmOnDate(padTime(m[5]), day, NETLINE_TZ);
      if (std && sta && Date.parse(sta) <= Date.parse(std)) {
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        sta = hhmmOnDate(padTime(m[5]), next, NETLINE_TZ);
      }
      const isDh = /^DH\//i.test(m[0]);
      duties.push({
        id: uid(`${date}-${flightNumber}-${dep}-${arr}`),
        uid: uid(`${date}-${flightNumber}-${dep}-${arr}`),
        date,
        type: isDh ? "travel" : "flight",
        title: `${flightNumber} ${dep}–${arr}`,
        flightNumber,
        depIata: dep,
        arrIata: arr,
        std,
        sta,
        checkIn: firstFlight ? checkIn : undefined,
        aircraftType: /A220/i.test(slice.slice(m.index ?? 0, (m.index ?? 0) + 40))
          ? "A220"
          : undefined,
        notes: isDh ? "Deadhead" : undefined,
        source,
      });
      firstFlight = false;
    }
  }

  const unique = dedupeFlightDuties(duties);
  if (!unique.length) unmatched.push("NetLine plan recognised, but no flights parsed");
  return { duties: unique, unmatched };
}
