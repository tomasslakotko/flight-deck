import type { Passenger } from "@/lib/types";

const MEAL_CODES = [
  "AVML","BBML","BLML","CHML","DBML","FPML","FSML","GFML","HNML","KSML",
  "LCML","LFML","LSML","MOML","NLML","RVML","SFML","SPML","VGML","VJML",
  "VLML","VOML",
];

const SSR_CODES = [
  ...MEAL_CODES,
  "WCHR","WCHS","WCHC","WCMP","UMNR","BLND","DEAF","PETC","EXST","CBBG",
  "STCR","INFT","MAAS","VIP","CIP","SEMN","DEPA","DEPU",
];

const LOYALTY = ["GOLD","SILVER","BRONZE","PLATINUM","DIAMOND","BASE","PLUS"];

function idFor(flightDutyId: string, seat: string, name: string) {
  return `${flightDutyId}-${seat}-${name}`.replace(/\s+/g, "").slice(0, 80);
}

function splitName(raw: string) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const titled = cleaned.match(/^(.+?)\/(.+?)(?:\s+(MR|MRS|MS|MISS|MSTR|DR|CAPT))?$/i);
  if (titled) {
    return {
      lastName: titled[1].trim().toUpperCase(),
      firstName: titled[2].trim().replace(/\b\w/g, (c) => c.toUpperCase()),
      title: titled[3]?.toUpperCase(),
    };
  }
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { lastName: parts[0].toUpperCase(), firstName: "" };
  return {
    lastName: parts[0].toUpperCase(),
    firstName: parts.slice(1).join(" "),
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

export function parsePassengerPaste(text: string, flightDutyId: string): Passenger[] {
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
