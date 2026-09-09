import { db } from "@/lib/db";
import { tryStorage } from "@/lib/idb";
import { minutesUntil, parseFlightInstant, todayKey } from "@/lib/dates";
import { isDepartureAlreadyCrewed, type BaseDeparture } from "@/lib/base-departures";

/** Auto-check a departure this many minutes before STD/ETD. */
export const SBY_AUTO_DONE_BEFORE_MIN = 30;

export type SbyCheckMark = {
  done: boolean;
  /** Set automatically at STD−30m or when already en-route */
  auto?: boolean;
  at: number;
};

export type SbyCheckMap = Record<string, SbyCheckMark>;

export function departureCheckKey(row: BaseDeparture) {
  const when = row.std ?? row.etd ?? "";
  return `${row.flightIata}|${when}|${row.depIata}`;
}

export function sbyChecksFlagKey(date: string, depIata: string) {
  return `sbyCheck:${date}:${depIata.toUpperCase()}`;
}

/** True when we are inside the last 30 minutes before departure (or past it), or already airborne. */
export function shouldAutoCompleteDeparture(row: BaseDeparture, now = new Date()) {
  if (isDepartureAlreadyCrewed(row)) return true;
  const mins = minutesUntil(row.etd ?? row.std, now);
  if (mins == null) return false;
  return mins <= SBY_AUTO_DONE_BEFORE_MIN;
}

export function departureMoment(row: BaseDeparture) {
  return parseFlightInstant(row.etd ?? row.std);
}

export async function loadSbyChecks(date: string, depIata: string): Promise<SbyCheckMap> {
  const key = sbyChecksFlagKey(date, depIata);
  const row = await tryStorage(() => db.flags.get(key));
  if (!row || typeof row.value !== "string") return {};
  try {
    const parsed = JSON.parse(row.value) as SbyCheckMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveSbyChecks(date: string, depIata: string, map: SbyCheckMap) {
  const key = sbyChecksFlagKey(date, depIata);
  // Drop empty / undone noise
  const cleaned: SbyCheckMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (v?.done) cleaned[k] = v;
  }
  await tryStorage(async () => {
    if (!Object.keys(cleaned).length) {
      await db.flags.delete(key);
      return;
    }
    await db.flags.put({ key, value: JSON.stringify(cleaned) });
  }, 8_000);
}

/** Merge stored marks with auto-complete at STD−30m. Returns next map + whether it changed. */
export function applyAutoSbyChecks(
  rows: BaseDeparture[],
  prev: SbyCheckMap,
  now = new Date(),
): { map: SbyCheckMap; changed: boolean } {
  const next: SbyCheckMap = { ...prev };
  let changed = false;
  for (const row of rows) {
    const id = departureCheckKey(row);
    if (next[id]?.done) continue;
    if (!shouldAutoCompleteDeparture(row, now)) continue;
    next[id] = { done: true, auto: true, at: now.getTime() };
    changed = true;
  }
  return { map: next, changed };
}

export function isDepartureChecked(row: BaseDeparture, map: SbyCheckMap) {
  return Boolean(map[departureCheckKey(row)]?.done);
}

export function partitionSbyChecklist(rows: BaseDeparture[], map: SbyCheckMap) {
  const open: BaseDeparture[] = [];
  const done: BaseDeparture[] = [];
  for (const row of rows) {
    if (isDepartureChecked(row, map)) done.push(row);
    else open.push(row);
  }
  return { open, done };
}

/** Prune checklist flags older than a few days (best-effort). */
export async function pruneOldSbyChecks(keepDate = todayKey()) {
  await tryStorage(async () => {
    const all = await db.flags.toArray();
    for (const flag of all) {
      const m = /^sbyCheck:(\d{4}-\d{2}-\d{2}):/.exec(flag.key);
      if (!m) continue;
      if (m[1] < keepDate) await db.flags.delete(flag.key);
    }
  });
}
