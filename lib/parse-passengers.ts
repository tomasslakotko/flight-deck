import type { Passenger } from "@/lib/types";

export const MEAL_CODES = [
  "AVML","BBML","BLML","CHML","DBML","FPML","FSML","GFML","HNML","KSML",
  "LCML","LFML","LSML","MOML","NLML","PMML","RVML","SFML","SPML","VGML",
  "VJML","VLML","VOML",
];

const SSR_CODES = [
  ...MEAL_CODES,
  "WCHR","WCHS","WCHC","WCMP","UMNR","BLND","DEAF","PETC","EXST","CBBG",
  "STCR","INFT","MAAS","VIP","CIP","SEMN","DEPA","DEPU","CHD","INF",
  "HAND","BASE","UNPAID",
];

const LOYALTY = ["GOLD","SILVER","BRONZE","PLATINUM","DIAMOND","PLUS"];
const TITLES = "MR|MRS|MS|MISS|MSTR|DR|CAPT|M";
const TR_CODES = "CHD|INF|INFT|UMNR";
const BAGGAGE_CODES = ["HAND", "BASE", "UNPAID"];

const SEAT_DEST_LINE = /^(\d{1,3}[A-F])\/([A-Z]{3})?\s*(.*)$/i;

function shortHash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Seat + name first so long ics flight ids cannot collide after truncation. */
function idFor(flightDutyId: string, seat: string, name: string) {
  const seatKey = seat.replace(/\s+/g, "").toUpperCase() || "NA";
  const nameKey = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "PAX";
  const seed = `${flightDutyId}-${seatKey}-${nameKey}`;
  return `pax-${seatKey}-${nameKey}-${shortHash(seed)}`;
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function splitName(raw: string) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const slash = cleaned.indexOf("/");
  const titleRe = new RegExp(`^(?:${TITLES})$`, "i");

  if (slash === -1) {
    const parts = cleaned.split(" ").filter(Boolean);
    if (parts.length === 1) return { lastName: parts[0].toUpperCase(), firstName: "" };
    return {
      lastName: parts[0].toUpperCase(),
      firstName: titleCase(parts.slice(1).join(" ")),
    };
  }

  const lastName = cleaned.slice(0, slash).trim().toUpperCase();
  const tokens = cleaned.slice(slash + 1).trim().split(/\s+/).filter(Boolean);
  const firstTokens: string[] = [];
  let title: string | undefined;
  for (const token of tokens) {
    if (titleRe.test(token)) {
      title = token.toUpperCase();
      break;
    }
    firstTokens.push(token);
  }
  return {
    lastName,
    firstName: titleCase(firstTokens.join(" ")),
    title,
  };
}

function codesIn(line: string) {
  const upper = line.toUpperCase();
  return SSR_CODES.filter((c) => new RegExp(`\\b${c}\\b`).test(upper));
}

function mealIn(ssrs: string[]) {
  return ssrs.find((c) => MEAL_CODES.includes(c));
}

function loyaltyIn(line: string) {
  const upper = line.toUpperCase();
  return LOYALTY.find((c) => new RegExp(`\\b${c}\\b`).test(upper));
}

function parseDelimited(text: string, flightDutyId: string): Passenger[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].toLowerCase();
  if (!header.includes("seat") && !header.includes("name")) return null;
  if (/onboard list/i.test(text) || /^[cy] cabin\b/i.test(header)) return null;
  const delim = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";
  const cols = header.split(delim).map((c) => c.trim().toLowerCase());
  const idx = (name: string) => cols.findIndex((c) => c.includes(name));
  const out: Passenger[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(delim).map((c) => c.trim());
    const nameRaw = cells[idx("name")] || cells[idx("pax")] || "";
    if (!nameRaw) continue;
    const names = splitName(nameRaw);
    const seat = (cells[idx("seat")] || "").toUpperCase();
    const extra = cells.join(" ");
    const ssrs = codesIn(extra);
    out.push({
      id: idFor(flightDutyId, seat, names.lastName),
      flightDutyId,
      seat: seat || undefined,
      lastName: names.lastName,
      firstName: names.firstName,
      title: names.title,
      loyaltyLevel: cells[idx("loyalty")] || loyaltyIn(extra),
      ssrs,
      meal: cells[idx("meal")] || mealIn(ssrs),
      checkedIn: /check/i.test(cells[idx("status")] || extra),
      vip: /\bvip\b/i.test(extra),
      ticketNumber: cells[idx("ticket")] || undefined,
      notes: extra,
    });
  }
  return out.length ? out : null;
}

const SEAT_NAME =
  /^([0-9]{1,2}[A-F])\s+([A-Z' -]+\/[A-Z' -]+(?:\s+(?:MR|MRS|MS|MISS|MSTR|DR))?)/i;
const NAME_SEAT =
  /^([A-Z' -]+\/[A-Z' -]+(?:\s+(?:MR|MRS|MS|MISS|MSTR|DR))?)\s+([0-9]{1,2}[A-F])\b/i;

export function looksLikeOnboardList(text: string): boolean {
  if (/ONBOARD LIST/i.test(text)) return true;
  if (/\b[CY] CABIN\b/i.test(text) && /\bTOTAL PAX\b/i.test(text)) return true;
  const seatSlash = text
    .split(/\r?\n/)
    .filter((l) => /^\s*\d{1,3}[A-F]\//.test(l.trim())).length;
  return seatSlash >= 3;
}

function isOnboardJunk(line: string): boolean {
  if (!line) return true;
  if (/^[.\s]+$/.test(line)) return true;
  return /^(CODESHARE|FLIGHT INFO|CONFIGURATION|STATUS\b|SEAT\/DES|[CY] CABIN\b|TTL\b|PAD\b)/i.test(
    line,
  ) || /ONBOARD LIST/i.test(line)
    || /^BT\d{2,4}\b/i.test(line)
    || /^-[A-Z]{3}\b/.test(line);
}

export function normalizeSeat(raw: string): string {
  const m = raw.toUpperCase().match(/^0*(\d+)([A-F])$/);
  return m ? `${Number(m[1])}${m[2]}` : raw.toUpperCase();
}

function addSsr(pax: Passenger, code: string) {
  const value = code.toUpperCase();
  if (!pax.ssrs.includes(value)) pax.ssrs.push(value);
}

function pushNote(pax: Passenger, part: string) {
  const bit = part.replace(/\s+/g, " ").trim();
  if (!bit) return;
  if (!pax.notes) {
    pax.notes = bit;
    return;
  }
  if (pax.notes.split(" · ").includes(bit)) return;
  pax.notes = `${pax.notes} · ${bit}`;
}

function applyKnownCodes(pax: Passenger, text: string) {
  const tokens = text.toUpperCase().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (MEAL_CODES.includes(token)) {
      addSsr(pax, token);
      if (!pax.meal) pax.meal = token;
      continue;
    }
    if (BAGGAGE_CODES.includes(token) || token === "CHD" || token === "INF" || token === "INFT" || token === "UMNR") {
      addSsr(pax, token === "INFT" ? "INF" : token);
    }
  }
}

function applyContinuation(pax: Passenger, text: string) {
  applyKnownCodes(pax, text);
  const titleRe = new RegExp(`^(?:${TITLES})$`);
  const known = new Set([...MEAL_CODES, ...BAGGAGE_CODES, "CHD", "INF", "INFT", "UMNR"]);
  for (const token of text.toUpperCase().split(/\s+/).filter(Boolean)) {
    if (known.has(token) || titleRe.test(token)) continue;
    if (/^[A-Z0-9]{3,}$/.test(token)) pushNote(pax, token);
  }
}

function parseOnboardName(raw: string): {
  lastName: string;
  firstName: string;
  title?: string;
  codeshare?: string;
} | null {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s.includes("/")) return null;
  let codeshare: string | undefined;
  const tail = s.match(/\s+([A-Z]{2})$/i);
  if (tail && !new RegExp(`^(?:${TITLES})$`, "i").test(tail[1])) {
    codeshare = tail[1].toUpperCase();
    s = s.slice(0, -tail[0].length).trim();
  }
  const names = splitName(s);
  if (!names.lastName) return null;
  return { ...names, codeshare };
}

function parseOnboardRest(rest: string) {
  let s = rest.replace(/\s+/g, " ").trim();
  if (!s) return null;

  let tr: string | undefined;
  const trm = s.match(new RegExp(`^(${TR_CODES})\\s+`, "i"));
  if (trm) {
    tr = trm[1].toUpperCase() === "INFT" ? "INF" : trm[1].toUpperCase();
    s = s.slice(trm[0].length);
  }

  let cs: string | undefined;
  const csm = s.match(/^([A-Z])\s+(?=.*\/)/i);
  if (csm) {
    cs = csm[1].toUpperCase();
    s = s.slice(csm[0].length);
  }

  const names = parseOnboardName(s);
  if (!names) return null;
  return { tr, cs, ...names };
}

export function parseOnboardList(text: string, flightDutyId: string): Passenger[] {
  const out: Passenger[] = [];
  let current: Passenger | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\u00a0/g, " ").trimEnd().trimStart();
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isOnboardJunk(trimmed)) {
      current = null;
      continue;
    }

    const seatMatch = trimmed.match(SEAT_DEST_LINE);
    if (seatMatch) {
      const seat = normalizeSeat(seatMatch[1]);
      const dest = seatMatch[2]?.toUpperCase();
      const parsed = parseOnboardRest(seatMatch[3] ?? "");
      if (!parsed) {
        current = null;
        continue;
      }

      const pax: Passenger = {
        id: idFor(
          flightDutyId,
          `${seat}${parsed.tr ?? ""}`,
          parsed.lastName + parsed.firstName,
        ),
        flightDutyId,
        seat,
        lastName: parsed.lastName,
        firstName: parsed.firstName,
        title: parsed.title,
        ssrs: [],
        checkedIn: true,
      };
      if (parsed.tr) addSsr(pax, parsed.tr);
      if (dest) pushNote(pax, dest);
      if (parsed.cs) pushNote(pax, `C/S ${parsed.cs}`);
      if (parsed.codeshare) pushNote(pax, parsed.codeshare);
      applyKnownCodes(pax, seatMatch[3] ?? "");
      out.push(pax);
      current = pax;
      continue;
    }

    if (current) applyContinuation(current, trimmed);
  }

  return out;
}

export function parsePassengerPaste(text: string, flightDutyId: string): Passenger[] {
  if (/estimated\s+pax\s+with\s+meal/i.test(text)) return [];

  if (looksLikeOnboardList(text)) {
    const onboard = parseOnboardList(text, flightDutyId);
    if (onboard.length) return onboard;
  }

  const delimited = parseDelimited(text, flightDutyId);
  if (delimited) return delimited;

  const out: Passenger[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line || line.length < 4) continue;
    let seat = "";
    let nameRaw = "";
    const a = line.match(SEAT_NAME);
    const b = !a ? line.match(NAME_SEAT) : null;
    if (a) {
      seat = a[1].toUpperCase();
      nameRaw = a[2];
    } else if (b) {
      nameRaw = b[1];
      seat = b[2].toUpperCase();
    } else if (line.includes("/")) {
      const m = line.match(/([A-Z' -]+\/[A-Z' -]+)/i);
      if (m) nameRaw = m[1];
      const s = line.match(/\b([0-9]{1,2}[A-F])\b/i);
      if (s) seat = s[1].toUpperCase();
    }
    if (!nameRaw) continue;
    const names = splitName(nameRaw);
    const key = `${seat}-${names.lastName}-${names.firstName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ssrs = codesIn(line);
    out.push({
      id: idFor(flightDutyId, seat, names.lastName + names.firstName),
      flightDutyId,
      seat: seat || undefined,
      lastName: names.lastName,
      firstName: names.firstName,
      title: names.title,
      loyaltyLevel: loyaltyIn(line),
      loyaltyNumber: line.match(/\b(?:LY|BT|FF)[A-Z]?\d{5,12}\b/i)?.[0],
      ssrs,
      meal: mealIn(ssrs),
      checkedIn: /\b(CKIN|CHECKED[\s-]?IN|HK)\b/i.test(line),
      vip: /\bvip\b/i.test(line),
      ticketNumber: line.match(/\b\d{13}\b/)?.[0],
      inwardConnection: line.match(/\binw[:\s]+([A-Z0-9]{2,6}\s*[A-Z]{3}[-–][A-Z]{3})/i)?.[1],
      onwardConnection: line.match(/\bonw[:\s]+([A-Z0-9]{2,6}\s*[A-Z]{3}[-–][A-Z]{3})/i)?.[1],
      notes: line,
    });
  }
  return out;
}

export function passengerConflicts(pax: Passenger) {
  const meat = /\b(meat|beef|chicken|lamb|cnml|hnml)\b/i.test(
    `${pax.notes ?? ""} ${pax.meal ?? ""}`,
  );
  const veg = Boolean(
    pax.meal && ["VGML", "VLML", "AVML", "VJML", "VOML", "RVML"].includes(pax.meal),
  );
  if (meat && veg) {
    return "Meal order looks non-vegetarian, but this passenger has a vegetarian meal code.";
  }
  return null;
}
