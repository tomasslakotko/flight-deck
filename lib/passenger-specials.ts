import { MEAL_CODES } from "@/lib/parse-passengers";
import type { Passenger } from "@/lib/types";

export type SpecialKind =
  | "mobility"
  | "um"
  | "infant"
  | "child"
  | "vip"
  | "unpaid"
  | "medical"
  | "meal"
  | "allergy";

export type SpecialChip = {
  code: string;
  kind: SpecialKind;
  label: string;
  count: number;
  passengers: Passenger[];
};

const KIND_ORDER: SpecialKind[] = [
  "mobility",
  "um",
  "infant",
  "child",
  "vip",
  "unpaid",
  "medical",
  "allergy",
  "meal",
];

const CODE_KIND: Record<string, SpecialKind> = {
  WCHR: "mobility",
  WCHS: "mobility",
  WCHC: "mobility",
  WCMP: "mobility",
  UMNR: "um",
  INF: "infant",
  INFT: "infant",
  CHD: "child",
  VIP: "vip",
  CIP: "vip",
  UNPAID: "unpaid",
  BLND: "medical",
  DEAF: "medical",
  STCR: "medical",
  PETC: "medical",
  MAAS: "medical",
};

const KIND_RING: Record<SpecialKind, string> = {
  mobility: "ring-amber-400 bg-amber-50",
  um: "ring-rose-400 bg-rose-50",
  infant: "ring-violet-400 bg-violet-50",
  child: "ring-sky-400 bg-sky-50",
  vip: "ring-yellow-400 bg-yellow-50",
  unpaid: "ring-orange-400 bg-orange-50",
  medical: "ring-fuchsia-400 bg-fuchsia-50",
  allergy: "ring-red-400 bg-red-50",
  meal: "ring-emerald-400 bg-emerald-50",
};

export function specialRingClass(kind: SpecialKind) {
  return KIND_RING[kind];
}

export function passengerSpecialCodes(pax: Passenger): string[] {
  const codes = new Set<string>();
  for (const raw of pax.ssrs) {
    const code = raw.toUpperCase();
    if (code === "HAND" || code === "BASE") continue;
    if (CODE_KIND[code] || MEAL_CODES.includes(code)) codes.add(code);
  }
  if (pax.meal) codes.add(pax.meal.toUpperCase());
  if (pax.vip) codes.add("VIP");
  if (pax.notes && /allerg/i.test(pax.notes)) codes.add("ALRG");
  return [...codes];
}

export function kindForCode(code: string): SpecialKind | null {
  const upper = code.toUpperCase();
  if (upper === "ALRG") return "allergy";
  if (CODE_KIND[upper]) return CODE_KIND[upper];
  if (MEAL_CODES.includes(upper)) return "meal";
  return null;
}

export function primarySpecialKind(pax: Passenger): SpecialKind | null {
  const codes = passengerSpecialCodes(pax);
  let best: SpecialKind | null = null;
  let bestRank = KIND_ORDER.length;
  for (const code of codes) {
    const kind = kindForCode(code);
    if (!kind) continue;
    const rank = KIND_ORDER.indexOf(kind);
    if (rank >= 0 && rank < bestRank) {
      best = kind;
      bestRank = rank;
    }
  }
  return best;
}

export function isSpecialPassenger(pax: Passenger) {
  return primarySpecialKind(pax) != null;
}

export function specialsStrip(passengers: Passenger[]): SpecialChip[] {
  const byCode = new Map<string, Passenger[]>();
  for (const pax of passengers) {
    for (const code of passengerSpecialCodes(pax)) {
      const list = byCode.get(code) ?? [];
      list.push(pax);
      byCode.set(code, list);
    }
  }
  const chips: SpecialChip[] = [];
  for (const [code, rows] of byCode) {
    const kind = kindForCode(code);
    if (!kind) continue;
    chips.push({
      code,
      kind,
      label: code === "ALRG" ? "Allergy" : code === "UMNR" ? "UM" : code,
      count: rows.length,
      passengers: rows,
    });
  }
  return chips.sort((a, b) => {
    const kindDelta = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (kindDelta !== 0) return kindDelta;
    return a.code.localeCompare(b.code);
  });
}

export function sortPassengersForList(passengers: Passenger[]) {
  return passengers.slice().sort((a, b) => {
    const aKind = primarySpecialKind(a);
    const bKind = primarySpecialKind(b);
    const aRank = aKind ? KIND_ORDER.indexOf(aKind) : KIND_ORDER.length;
    const bRank = bKind ? KIND_ORDER.indexOf(bKind) : KIND_ORDER.length;
    if (aRank !== bRank) return aRank - bRank;
    return (a.seat ?? "zzz").localeCompare(b.seat ?? "zzz", undefined, { numeric: true });
  });
}
