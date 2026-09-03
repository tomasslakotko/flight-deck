import ICAL from "ical.js";
import type { Duty, DutyType, ImportPreview } from "@/lib/types";
import { dateKey, hhmmToToday } from "@/lib/dates";
import { toFlightIata } from "@/lib/airports";

const IATA = new Set([
  "RIX","CPH","AMS","ARN","OSL","HEL","TLL","VNO","WAW","BER","MUC","FRA","DUS",
  "HAM","CDG","LGW","LHR","STN","DUB","BCN","MXP","FCO","PMI","AYT","TFS","DXB",
  "TLV","IST","VIE","PRG","BUD","GVA","ZRH","BRU","NCE","AGP","ALC","SKG","ATH",
  "KEF","TMP","TKU","OUL","MAD","LIS","MAN","EDI","BHX","NCL","GOT","BGO","TRD",
]);

const DUTY_MATCHERS: { type: DutyType; re: RegExp }[] = [
  { type: "off", re: /\b(OFF|DO|D\/O|DAY[\s-]?OFF|FREE)\b/i },
  { type: "standby", re: /\b(SBY|STB|STANDBY|HSBY|ASBY|H\/SBY)\b/i },
  { type: "reserve", re: /\b(RES|RSV|RESERVE)\b/i },
  { type: "hotel", re: /\b(HTL|HOTEL|LAYOVER|OVN)\b/i },
  { type: "sim", re: /\b(SIM|SFI|EBT|LOFT)\b/i },
  { type: "ground", re: /\b(G\/S|GND|GROUND|TRAINING|CRM|SEP|ELEARN)\b/i },
  { type: "checkin", re: /\b(C\/I|CHECK[\s-]?IN|REPORT)\b/i },
  { type: "travel", re: /\b(TVL|DH|DHC|DEADHEAD|PAXING)\b/i },
];

const FLIGHT_RE = /\b(BTI?|BT)\s*-?\s*(\d{2,4})\b/i;
const ROUTE_RE = /\b([A-Z]{3})\s*(?:[-–—to/]|→|✈)+\s*([A-Z]{3})\b/;
const TIME_RANGE_RE = /(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/;
const TIME_RE = /\b(\d{1,2}[:.]\d{2})\b/;

function uid(prefix: string, seed: string) {
  return `${prefix}-${seed.replace(/[^A-Za-z0-9-]/g, "").slice(0, 80)}`;
}

function classifyDuty(text: string): DutyType {
  for (const row of DUTY_MATCHERS) {
    if (row.re.test(text)) return row.type;
  }
  if (FLIGHT_RE.test(text) || ROUTE_RE.test(text)) return "flight";
  return "other";
}

function pickRoute(text: string) {
  const m = text.toUpperCase().match(ROUTE_RE);
  if (!m) return {};
  const dep = m[1];
  const arr = m[2];
  if (!IATA.has(dep) || !IATA.has(arr) || dep === arr) return {};
  return { depIata: dep, arrIata: arr };
}

function pickFlight(text: string) {
  const m = text.toUpperCase().match(FLIGHT_RE);
  if (!m) return undefined;
  return toFlightIata(`${m[1]}${m[2]}`);
}

function pickHotel(text: string) {
  const m = text.match(/(?:hotel|htl|layover)[:\s-]+([A-Za-z0-9 .'-]{3,40})/i);
  return m?.[1]?.trim();
}

function pickPosition(text: string) {
  const m = text.match(/\b(?:pos(?:ition)?[:\s]*)?([LR][1-5]|SCC|PURSER)\b/i);
  return m?.[1]?.toUpperCase();
}

function pickCheckIn(text: string, day: Date) {
  const m = text.match(/(?:check[\s-]?in|c\/i|report)[:\s]*(\d{1,2}[:.]\d{2})/i);
  if (!m) return undefined;
  return hhmmToToday(m[1].replace(".", ":"), day);
}

export function parseIcs(raw: string, source: Duty["source"] = "ical"): ImportPreview {
  const unmatched: string[] = [];
  const duties: Duty[] = [];
  try {
    const jcal = ICAL.parse(raw);
    const comp = new ICAL.Component(jcal);
    const events = comp.getAllSubcomponents("vevent");
    for (const vevent of events) {
      const event = new ICAL.Event(vevent);
      const start = event.startDate?.toJSDate?.() ?? undefined;
      const end = event.endDate?.toJSDate?.() ?? undefined;
      const summary = event.summary ?? "";
      const description = event.description ?? "";
      const blob = `${summary}\n${description}`;
      if (!start) {
        unmatched.push(summary || "Untitled event");
        continue;
      }
      const date = dateKey(start);
      const type = classifyDuty(blob);
      const flightNumber = pickFlight(blob);
      const route = pickRoute(blob);
      const title =
        flightNumber && route.depIata
          ? `${flightNumber} ${route.depIata}–${route.arrIata}`
          : summary.trim() || type.toUpperCase();
      duties.push({
        id: uid("ics", event.uid || `${date}-${title}`),
        uid: event.uid || uid("ics", `${date}-${title}`),
        date,
        type: flightNumber ? "flight" : type,
        title,
        flightNumber,
        depIata: route.depIata,
        arrIata: route.arrIata,
        std: start.toISOString(),
        sta: end?.toISOString(),
        checkIn: pickCheckIn(blob, start),
        notes: description.trim() || undefined,
        hotelName: pickHotel(blob),
        position: pickPosition(blob),
        source,
      });
    }
  } catch {
    return parseRosterText(raw, source);
  }
  if (!duties.length) return parseRosterText(raw, source);
  return { duties, unmatched };
}

export function parseRosterText(raw: string, source: Duty["source"] = "pdf"): ImportPreview {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const duties: Duty[] = [];
  const unmatched: string[] = [];
  let currentDate: Date | undefined;

  const dateLine = (line: string) => {
    const iso = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return new Date(`${iso[1]}T12:00:00`);
    const dmy = line.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
    if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 12);
    const named = line.match(
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i,
    );
    if (named) return new Date(`${named[1]} ${named[2]} ${named[3]}`);
    return undefined;
  };

  for (const line of lines) {
    const parsedDate = dateLine(line);
    if (parsedDate && !Number.isNaN(parsedDate.getTime())) {
      currentDate = parsedDate;
    }
    const type = classifyDuty(line);
    const flightNumber = pickFlight(line);
    const route = pickRoute(line);
    const isDuty =
      Boolean(flightNumber || route.depIata) ||
      DUTY_MATCHERS.some((m) => m.re.test(line));
    if (!isDuty) {
      if (line.length > 8 && !parsedDate) unmatched.push(line);
      continue;
    }
    if (!currentDate) {
      unmatched.push(line);
      continue;
    }
    const times = line.match(TIME_RANGE_RE);
    const single = !times ? line.match(TIME_RE) : null;
    const std = times
      ? hhmmToToday(times[1].replace(".", ":"), currentDate)
      : single
        ? hhmmToToday(single[1].replace(".", ":"), currentDate)
        : atNoon(currentDate);
    const sta = times ? hhmmToToday(times[2].replace(".", ":"), currentDate) : undefined;
    const date = dateKey(currentDate);
    const resolvedType = flightNumber ? "flight" : type;
    const title =
      flightNumber && route.depIata
        ? `${flightNumber} ${route.depIata}–${route.arrIata}`
        : line.slice(0, 48);
    duties.push({
      id: uid(source, `${date}-${title}-${std ?? ""}`),
      uid: uid(source, `${date}-${title}-${std ?? ""}`),
      date,
      type: resolvedType,
      title,
      flightNumber,
      depIata: route.depIata,
      arrIata: route.arrIata,
      std,
      sta,
      checkIn: pickCheckIn(line, currentDate),
      notes: line,
      hotelName: pickHotel(line),
      position: pickPosition(line),
      source,
    });
  }

  return { duties, unmatched: unmatched.slice(0, 40) };
}

function atNoon(day: Date) {
  const d = new Date(day);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}
