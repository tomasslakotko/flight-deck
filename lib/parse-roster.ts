import ICAL from "ical.js";
import type { Duty, DutyType, ImportPreview } from "@/lib/types";
import { airportTz, toFlightIata } from "@/lib/airports";
import { dateKey, dateKeyInZone, hhmmToToday } from "@/lib/dates";
import { parseCrewNotes } from "@/lib/parse-crew";
import { looksLikeNetlineIdp, parseNetlineIdp } from "@/lib/parse-netline-pdf";
import { looksLikeIata, pickAirportCode, pickAllRoutes, pickRoute } from "@/lib/route-text";

const DUTY_MATCHERS: { type: DutyType; re: RegExp }[] = [
  { type: "off", re: /\b(OFF|DO|D\/O|DAY[\s-]?OFF|FREE)\b/i },
  // SBYHOME2 / SBYA / HSBY — crew iCal uses glued codes, not bare "SBY"
  { type: "standby", re: /\b(?:H\/SBY|HSBY|ASBY|SBY[A-Z0-9]*|STANDBY|STB)\b/i },
  { type: "reserve", re: /\b(RES|RSV|RESERVE)\b/i },
  { type: "hotel", re: /\b(HTL|HOTEL|LAYOVER|OVN)\b/i },
  { type: "sim", re: /\b(SIM|SFI|EBT|LOFT)\b/i },
  { type: "ground", re: /\b(G\/S|GND|GROUND|TRAINING|CRM|SEP|ELEARN)\b/i },
  { type: "checkin", re: /\b(C\/I|C\/O|CHECK[\s-]?IN|CHECK[\s-]?OUT|REPORT)\b/i },
  { type: "travel", re: /\b(TVL|DH|DHC|DEADHEAD|PAXING)\b/i },
];

/** BT/JU with optional space; any other IATA 2-letter only when glued to the number (avoids "to 12:00"). */
const FLIGHT_RE = /\b(?:(BTI|BT|JU)\s*-?\s*(\d{2,4})|([A-Z]{2})(\d{2,4}))\b/gi;
const TIME_RANGE_RE = /(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/;
const TIME_RE = /\b(\d{1,2}[:.]\d{2})\b/;
const HORIZON_BACK_DAYS = 45;
const HORIZON_FWD_DAYS = 180;
const MAX_OCCURRENCES = 400;

function shortHash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Stable unique ids — long calendar UIDs collide if we only keep the first 80 chars. */
function uid(prefix: string, seed: string) {
  const clean = seed.replace(/[^A-Za-z0-9-]/g, "");
  if (clean.length <= 96) return `${prefix}-${clean}`;
  return `${prefix}-${clean.slice(0, 40)}${clean.slice(-24)}-${shortHash(seed)}`;
}

function flightFromMatch(m: RegExpMatchArray) {
  const prefix = (m[1] || m[3] || "").toUpperCase();
  const num = m[2] || m[4];
  if (!prefix || !num) return undefined;
  return toFlightIata(`${prefix}${num}`);
}

export function pickFlight(text: string) {
  const re = new RegExp(FLIGHT_RE.source, "i");
  const m = text.toUpperCase().match(re);
  return m ? flightFromMatch(m) : undefined;
}

function pickAllFlights(text: string) {
  const found: string[] = [];
  const re = new RegExp(FLIGHT_RE.source, "gi");
  for (const m of text.toUpperCase().matchAll(re)) {
    const fn = flightFromMatch(m);
    if (fn && !found.includes(fn)) found.push(fn);
  }
  return found;
}

const REPORT_LABEL_RE = /^(CHECK[\s-]?IN|CHECK[\s-]?OUT|C\/I|C\/O|REPORT)\b/i;
/** ☎️ SBYHOME2 · HSBY · SBYA — home/airport standby codes from crew iCal */
const STANDBY_LABEL_RE =
  /^(?:H\/SBY|HSBY|ASBY|SBY[A-Z0-9]*|STANDBY|STB)\b/i;
/** HEL-MUC (03:00-05:35 UTC) — common crew iCal description */
const ICS_ROUTE_UTC_RE =
  /\b([A-Z]{3})\s*[-–—]\s*([A-Z]{3})\s*\(\s*(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s*UTC\s*\)/i;
/** HEL (02:00-03:00 UTC) — check-in / SBY base + UTC window */
const ICS_BASE_UTC_RE =
  /\b([A-Z]{3})\s*\(\s*(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s*UTC\s*\)/i;

function stripIcsEmoji(text: string) {
  return text
    .replace(/^[\uFE0F\u200D\s]*/u, "")
    .replace(/^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][\uFE0F\u200D]*)+\s*/u, "")
    .replace(/^[✈️🛩☎️📞📱🏠]\s*/u, "")
    .trim();
}

function isReportLabel(text: string) {
  return REPORT_LABEL_RE.test(stripIcsEmoji(text.trim()));
}

function isCheckoutLabel(text: string) {
  return /^(CHECK[\s-]?OUT|C\/O)\b/i.test(stripIcsEmoji(text.trim()));
}

function isStandbyLabel(text: string) {
  return STANDBY_LABEL_RE.test(stripIcsEmoji(text.trim()));
}

function classifyDuty(text: string): DutyType {
  const firstLine = text.split("\n", 1)[0] ?? text;
  if (isReportLabel(firstLine)) return "checkin";
  // Standby before route/flight guesses — "BEG (08:30-21:00 UTC)" must not become a fake sector
  if (isStandbyLabel(firstLine) || isStandbyLabel(text)) return "standby";
  if (/\b(?:H\/SBY|HSBY|ASBY|SBY[A-Z0-9]*|STANDBY)\b/i.test(text) && !pickFlight(text)) {
    return "standby";
  }
  if (pickFlight(text) || pickRoute(text).depIata) return "flight";
  for (const row of DUTY_MATCHERS) {
    if (row.re.test(text)) return row.type;
  }
  return "other";
}

function isReportDuty(duty: Duty) {
  if (duty.type === "checkin") return true;
  return isReportLabel(duty.title);
}

function isCheckoutDuty(duty: Duty) {
  return /check\s*-?out|\bc\/o\b/i.test(duty.title);
}

function pickIcsRouteUtc(text: string) {
  const m = text.toUpperCase().match(ICS_ROUTE_UTC_RE);
  if (!m) return null;
  const route = validRouteSafe(m[1], m[2]);
  if (!route.depIata || !route.arrIata) return null;
  return {
    depIata: route.depIata,
    arrIata: route.arrIata,
    stdUtc: m[3].replace(".", ":"),
    staUtc: m[4].replace(".", ":"),
  };
}

function pickIcsBaseUtc(text: string) {
  const m = text.toUpperCase().match(ICS_BASE_UTC_RE);
  if (!m) return null;
  if (!looksLikeIata(m[1])) return null;
  return {
    iata: m[1],
    fromUtc: m[2].replace(".", ":"),
    toUtc: m[3].replace(".", ":"),
  };
}

function validRouteSafe(dep?: string, arr?: string) {
  return pickRoute(`${dep}-${arr}`);
}

function utcHhmmOnDay(hhmm: string, day: Date) {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, 0));
  return d.toISOString();
}

function foldReportEvents(duties: Duty[]) {
  const reports = duties.filter(isReportDuty);
  const rest = duties.filter((d) => !isReportDuty(d));
  const flights = rest
    .filter((d) => d.type === "flight")
    .sort((a, b) => (a.std ?? a.date).localeCompare(b.std ?? b.date));
  for (const report of reports) {
    if (isCheckoutDuty(report) || !report.std) continue;
    const next =
      flights.find((f) => (f.std ?? "") >= report.std!) ??
      flights.find((f) => f.date === report.date);
    if (next && !next.checkIn) next.checkIn = report.std;
  }
  const seen = new Set<string>();
  const out: Duty[] = [];
  for (const duty of rest) {
    const key = `${duty.type}|${duty.date}|${duty.std ?? ""}|${duty.flightNumber ?? duty.title}`;
    if (seen.has(duty.uid) || seen.has(key)) continue;
    seen.add(duty.uid);
    seen.add(key);
    out.push(duty);
  }
  return out;
}

function pickHotel(text: string) {
  const m = text.match(/(?:hotel|htl|layover)[:\s-]+([A-Za-z0-9 .'-]{3,40})/i);
  return m?.[1]?.trim();
}

function pickPosition(text: string) {
  const m = text.match(/\b(?:pos(?:ition)?[:\s]*)?([LR][1-5]|SCC|PURSER)\b/i);
  return m?.[1]?.toUpperCase();
}

function pickNotes(description: string, summary: string) {
  const desc = description.trim();
  if (parseCrewNotes(desc).crew.length) return desc || undefined;
  const fromSummary = parseCrewNotes(summary);
  if (!fromSummary.crew.length) return desc || undefined;
  const crewText = fromSummary.crew.map((member) => `${member.role}: ${member.code}`).join(" ");
  return [desc, crewText].filter(Boolean).join("\n") || undefined;
}

function pickCheckIn(text: string, day: Date) {
  const m = text.match(/(?:check[\s-]?in|c\/i|report)[:\s]*(\d{1,2}[:.]\d{2})/i);
  if (!m) return undefined;
  return hhmmToToday(m[1].replace(".", ":"), day);
}

function icalInstant(time?: ICAL.Time | null) {
  if (!time) return undefined;
  try {
    const js = time.toJSDate();
    return Number.isNaN(js.getTime()) ? undefined : js;
  } catch {
    return undefined;
  }
}

function icalDateKey(time?: ICAL.Time | null, start?: Date, depIata?: string) {
  if (time?.isDate) {
    const y = time.year;
    const m = String(time.month).padStart(2, "0");
    const d = String(time.day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (start) return dutyDate(start, depIata);
  return "";
}

function registerTimezones(comp: ICAL.Component) {
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* already registered */
    }
  }
}

function dutyDate(start: Date, depIata?: string) {
  return dateKeyInZone(start, airportTz(depIata)) || dateKey(start);
}

function pushDuty(duties: Duty[], partial: Duty) {
  duties.push(partial);
}

function eventToDuties(
  event: ICAL.Event,
  start: Date,
  end: Date | undefined,
  source: Duty["source"],
  occurrenceKey: string,
  startTime?: ICAL.Time | null,
): Duty[] {
  const summary = (event.summary ?? "").replace(/^\uFEFF/, "").trim();
  const description = event.description ?? "";
  const location = event.location ?? "";
  const blob = `${summary}\n${description}\n${location}`;
  const cleanSummary = stripIcsEmoji(summary);

  // CHECKIN / CHECKOUT — never invent a fake flight route from the description.
  if (isReportLabel(cleanSummary) || isReportLabel(summary)) {
    const base = pickIcsBaseUtc(blob);
    const depIata =
      base?.iata ??
      pickAirportCode(location) ??
      pickAirportCode(description) ??
      undefined;
    const date = icalDateKey(startTime, start, depIata);
    const seed = `${event.uid || summary}-${date}-${occurrenceKey}`;
    return [
      {
        id: uid("ics", seed),
        uid: event.uid || uid("ics", seed),
        date,
        type: "checkin",
        title: isCheckoutLabel(cleanSummary) || isCheckoutLabel(summary) ? "CHECKOUT" : "CHECKIN",
        depIata,
        std: start.toISOString(),
        sta: end?.toISOString(),
        notes: pickNotes(description, summary),
        source,
      },
    ];
  }

  // ☎️ SBYHOME2 + BEG (08:30-21:00 UTC) — home standby, not a flight
  if (isStandbyLabel(cleanSummary) || isStandbyLabel(summary) || classifyDuty(blob) === "standby") {
    const base = pickIcsBaseUtc(blob);
    const depIata =
      base?.iata ??
      pickAirportCode(location) ??
      pickAirportCode(description) ??
      undefined;
    const date = icalDateKey(startTime, start, depIata);
    const title = cleanSummary || "SBY";
    const seed = `${event.uid || title}-${date}-${occurrenceKey}`;
    return [
      {
        id: uid("ics", seed),
        uid: event.uid || uid("ics", seed),
        date,
        type: "standby",
        title,
        depIata,
        std: start.toISOString(),
        sta: end?.toISOString(),
        notes: pickNotes(description, summary),
        source,
      },
    ];
  }

  const flights = pickAllFlights(blob);
  const icsRoute = pickIcsRouteUtc(blob);
  const routes = icsRoute
    ? [{ depIata: icsRoute.depIata, arrIata: icsRoute.arrIata }]
    : pickAllRoutes(blob);
  const locIata = pickAirportCode(location);
  const ranges = [...blob.matchAll(new RegExp(TIME_RANGE_RE.source, "g"))];
  const looksLikeFlight = flights.length > 0 || routes.length > 0;

  const legs =
    flights.length > 1
      ? flights.map((fn, i) => ({
          flightNumber: fn,
          route: routes[i] ?? routes[0] ?? {},
        }))
      : [
          {
            flightNumber: flights[0],
            route: routes[0] ?? pickRoute(blob),
          },
        ];

  if (looksLikeFlight && legs.length === 1 && locIata && !legs[0].route.depIata) {
    legs[0].route = { ...legs[0].route, depIata: locIata };
  }

  let stdBase = start;
  let staBase = end;
  // Prefer UTC block times from description when present (crew iCal style).
  if (icsRoute && legs.length === 1) {
    const stdIso = utcHhmmOnDay(icsRoute.stdUtc, start);
    let staIso = utcHhmmOnDay(icsRoute.staUtc, start);
    if (stdIso && staIso && Date.parse(staIso) <= Date.parse(stdIso)) {
      const next = new Date(start);
      next.setUTCDate(next.getUTCDate() + 1);
      staIso = utcHhmmOnDay(icsRoute.staUtc, next);
    }
    if (stdIso) stdBase = new Date(stdIso);
    if (staIso) staBase = new Date(staIso);
    legs[0].route = { depIata: icsRoute.depIata, arrIata: icsRoute.arrIata };
  }

  const span = Math.max(1, (staBase?.getTime() ?? stdBase.getTime()) - stdBase.getTime());
  const out: Duty[] = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    let std = stdBase;
    let sta = staBase;
    if (legs.length > 1) {
      const slice = span / legs.length;
      std = new Date(stdBase.getTime() + i * slice);
      sta = new Date(stdBase.getTime() + (i + 1) * slice);
      const range = ranges[i];
      if (range) {
        const from = hhmmToToday(range[1].replace(".", ":"), std);
        let to = hhmmToToday(range[2].replace(".", ":"), std);
        if (from) std = new Date(from);
        if (from && to && Date.parse(to) <= Date.parse(from)) {
          const next = new Date(std);
          next.setDate(next.getDate() + 1);
          to = hhmmToToday(range[2].replace(".", ":"), next);
        }
        if (to) sta = new Date(to);
      }
    } else if (stdBase && staBase && staBase.getTime() <= stdBase.getTime()) {
      sta = new Date(staBase.getTime() + 24 * 60 * 60 * 1000);
    }

    const depIata = leg.route.depIata;
    const arrIata = leg.route.arrIata;
    const flightNumber = leg.flightNumber;
    const type = classifyDuty(blob);
    const resolvedType = flightNumber || (depIata && arrIata) ? "flight" : type;
    const date = icalDateKey(startTime, std, depIata);
    const title =
      flightNumber && depIata
        ? `${flightNumber} ${depIata}–${arrIata ?? ""}`
        : cleanSummary || summary.trim() || type.toUpperCase();
    const seed = `${event.uid || title}-${date}-${flightNumber ?? i}-${occurrenceKey}`;
    out.push({
      id: uid("ics", seed),
      uid: legs.length > 1 ? `${event.uid || seed}#${i}` : event.uid || uid("ics", seed),
      date,
      type: resolvedType,
      title,
      flightNumber,
      depIata,
      arrIata,
      std: std.toISOString(),
      sta: sta?.toISOString(),
      checkIn: pickCheckIn(blob, std),
      notes: pickNotes(description, summary),
      hotelName: pickHotel(blob),
      position: pickPosition(blob),
      source,
    });
  }
  return out;
}

function expandEvent(event: ICAL.Event, source: Duty["source"]): Duty[] {
  const duties: Duty[] = [];
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - HORIZON_BACK_DAYS);
  const until = new Date(now);
  until.setDate(until.getDate() + HORIZON_FWD_DAYS);

  if (event.isRecurring()) {
    try {
      const iter = event.iterator();
      let next;
      let n = 0;
      while ((next = iter.next()) && n < MAX_OCCURRENCES) {
        n += 1;
        const details = event.getOccurrenceDetails(next);
        const start = icalInstant(details.startDate);
        if (!start) continue;
        if (start < from) continue;
        if (start > until) break;
        let end = icalInstant(details.endDate);
        duties.push(
          ...eventToDuties(event, start, end, source, next.toString(), details.startDate),
        );
      }
    } catch {
      const start = icalInstant(event.startDate);
      if (start) {
        duties.push(
          ...eventToDuties(event, start, icalInstant(event.endDate), source, "0", event.startDate),
        );
      }
    }
    return duties;
  }

  const start = icalInstant(event.startDate);
  if (!start) return [];
  duties.push(
    ...eventToDuties(event, start, icalInstant(event.endDate), source, "0", event.startDate),
  );
  return duties;
}

export function parseIcs(raw: string, source: Duty["source"] = "ical"): ImportPreview {
  const unmatched: string[] = [];
  const duties: Duty[] = [];
  try {
    const parsed = ICAL.parse(raw);
    const roots = Array.isArray(parsed[0]) ? parsed : [parsed];
    for (const jcal of roots) {
      if (!jcal) continue;
      const comp = new ICAL.Component(jcal);
      registerTimezones(comp);
      const events = comp.getAllSubcomponents("vevent");
      for (const vevent of events) {
        try {
          const event = new ICAL.Event(vevent);
          if (event.isRecurrenceException()) continue;
          const rows = expandEvent(event, source);
          if (!rows.length) {
            unmatched.push(event.summary || "Untitled event");
            continue;
          }
          for (const row of rows) pushDuty(duties, row);
        } catch {
          unmatched.push("Unreadable calendar event");
        }
      }
    }
  } catch {
    return parseRosterText(raw, source);
  }
  if (!duties.length) return parseRosterText(raw, source);
  return { duties: foldReportEvents(duties), unmatched };
}

export function parseRosterText(raw: string, source: Duty["source"] = "pdf"): ImportPreview {
  if (looksLikeNetlineIdp(raw)) {
    const netline = parseNetlineIdp(raw, source);
    if (netline.duties.length) return netline;
  }

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
    const compact = line.match(/\b(20\d{2})(\d{2})(\d{2})(?:T|\b)/);
    if (compact) return new Date(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]), 12);
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
    let sta = times ? hhmmToToday(times[2].replace(".", ":"), currentDate) : undefined;
    if (times && std && sta && Date.parse(sta) <= Date.parse(std)) {
      const nextDay = new Date(currentDate);
      nextDay.setDate(nextDay.getDate() + 1);
      sta = hhmmToToday(times[2].replace(".", ":"), nextDay);
    }
    const date = dutyDate(std ? new Date(std) : currentDate, route.depIata);
    const resolvedType = flightNumber || route.depIata ? "flight" : type;
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

  return { duties: foldReportEvents(duties), unmatched: unmatched.slice(0, 40) };
}

function atNoon(day: Date) {
  const d = new Date(day);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}
