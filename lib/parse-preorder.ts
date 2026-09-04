import type { Passenger } from "@/lib/types";
import { MEAL_CODES, normalizeSeat } from "@/lib/parse-passengers";

const TITLE_RE = /^(?:MR|MRS|MS|MISS|MSTR|DR|CAPT|M)$/i;
const MAIN_LINE =
  /^(\d{1,3}[A-F])\s*\/\s*([A-Z]{4})\s*\/\s*(.+)$/i;
const COMPOSITION_RE = /^([A-Z]{2,4}\d+(?:-[A-Z]{2,4}\d+)+)$/i;
const DRINK_RE = /^([A-Z]{2}\d+)\s+(.+)$/i;
const HEADER_RE = /estimated\s+pax\s+with\s+meal/i;

function shortHash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function preorderId(flightDutyId: string, seat: string, lastName: string) {
  const seatKey = seat.replace(/\s+/g, "").toUpperCase() || "NA";
  const nameKey = lastName.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "PAX";
  return `pre-${seatKey}-${nameKey}-${shortHash(`${flightDutyId}-${seatKey}-${nameKey}`)}`;
}

export type PreorderMeal = {
  seat: string;
  meal: string;
  lastName: string;
  firstName: string;
  title?: string;
  codes: string[];
  drinks: string[];
};

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function isInfant(pax: Passenger) {
  return pax.ssrs.includes("INF") || pax.ssrs.includes("INFT");
}

function parsePreorderName(raw: string): {
  lastName: string;
  firstName: string;
  title?: string;
} {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return { lastName: "", firstName: "" };

  if (cleaned.includes("/")) {
    const [last, rest = ""] = cleaned.split("/", 2);
    const tokens = rest.trim().split(/\s+/).filter(Boolean);
    let title: string | undefined;
    const firstTokens: string[] = [];
    for (const token of tokens) {
      if (TITLE_RE.test(token)) {
        title = token.toUpperCase();
        break;
      }
      firstTokens.push(token);
    }
    return {
      lastName: last.trim().toUpperCase(),
      firstName: titleCase(firstTokens.join(" ")),
      title,
    };
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let title: string | undefined;
  if (tokens.length && TITLE_RE.test(tokens[tokens.length - 1])) {
    title = tokens.pop()!.toUpperCase();
  }
  if (tokens.length === 0) return { lastName: "", firstName: "", title };
  if (tokens.length === 1) {
    return { lastName: tokens[0].toUpperCase(), firstName: "", title };
  }
  return {
    lastName: tokens[tokens.length - 1].toUpperCase(),
    firstName: titleCase(tokens.slice(0, -1).join(" ")),
    title,
  };
}

function pushUnique(list: string[], value: string) {
  const bit = value.replace(/\s+/g, " ").trim();
  if (!bit) return;
  if (!list.some((item) => item.toUpperCase() === bit.toUpperCase())) {
    list.push(bit);
  }
}

function noteParts(row: PreorderMeal): string[] {
  return [...row.codes, ...row.drinks];
}

export function looksLikePreorder(text: string): boolean {
  if (/ONBOARD LIST/i.test(text)) return false;
  if (HEADER_RE.test(text)) return true;
  const mains = text.split(/\r?\n/).filter((line) => MAIN_LINE.test(line.trim())).length;
  return mains >= 1;
}

export function parsePreorderPaste(text: string): PreorderMeal[] {
  const rows: PreorderMeal[] = [];
  let current: PreorderMeal | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\u00a0/g, " ").trim();
    if (!line) continue;
    if (HEADER_RE.test(line) || /^[.\-=]+$/.test(line)) continue;

    const main = line.match(MAIN_LINE);
    if (main) {
      const meal = main[2].toUpperCase();
      if (!MEAL_CODES.includes(meal)) {
        current = null;
        continue;
      }
      const names = parsePreorderName(main[3]);
      current = {
        seat: normalizeSeat(main[1]),
        meal,
        lastName: names.lastName,
        firstName: names.firstName,
        title: names.title,
        codes: [],
        drinks: [],
      };
      rows.push(current);
      continue;
    }

    if (!current) continue;

    const body = line.replace(/^\/\s*/, "").trim();
    if (COMPOSITION_RE.test(body)) {
      pushUnique(current.codes, body.toUpperCase());
      continue;
    }
    const drink = body.match(DRINK_RE);
    if (drink) {
      pushUnique(current.drinks, `${drink[1].toUpperCase()} ${drink[2].trim()}`);
      continue;
    }
    if (line.startsWith("/") && body) {
      pushUnique(current.codes, body.toUpperCase());
    }
  }

  return rows.filter((row) => row.seat && row.meal);
}

export function mergePreorderMeals(
  existing: Passenger[],
  meals: PreorderMeal[],
  flightDutyId: string,
): Passenger[] {
  const next = existing.map((pax) => ({ ...pax, ssrs: [...pax.ssrs] }));

  for (const row of meals) {
    const atSeat = next.filter((pax) => pax.seat?.toUpperCase() === row.seat);
    const target = atSeat.find((pax) => !isInfant(pax)) ?? atSeat[0];
    const extras = noteParts(row);

    if (target) {
      target.meal = row.meal;
      if (!target.ssrs.includes(row.meal)) target.ssrs.push(row.meal);
      if (!target.title && row.title) target.title = row.title;
      for (const extra of extras) {
        if (!target.notes) {
          target.notes = extra;
        } else if (!target.notes.split(" · ").some((part) => part.toUpperCase() === extra.toUpperCase())) {
          target.notes = `${target.notes} · ${extra}`;
        }
      }
      continue;
    }

    const created: Passenger = {
      id: preorderId(flightDutyId, row.seat, row.lastName),
      flightDutyId,
      seat: row.seat,
      lastName: row.lastName || "UNKNOWN",
      firstName: row.firstName,
      title: row.title,
      ssrs: [row.meal],
      meal: row.meal,
      notes: extras.join(" · ") || undefined,
    };
    next.push(created);
  }

  return next;
}
