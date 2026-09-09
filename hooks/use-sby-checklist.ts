"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseDeparture } from "@/lib/base-departures";
import {
  applyAutoSbyChecks,
  departureCheckKey,
  isDepartureChecked,
  loadSbyChecks,
  partitionSbyChecklist,
  pruneOldSbyChecks,
  saveSbyChecks,
  type SbyCheckMap,
} from "@/lib/sby-checklist";

export function useSbyChecklist(date: string, depIata: string | undefined, rows: BaseDeparture[]) {
  const [map, setMap] = useState<SbyCheckMap>({});
  const [ready, setReady] = useState(false);
  const mapRef = useRef(map);
  mapRef.current = map;
  const base = depIata?.trim().toUpperCase();

  useEffect(() => {
    if (!base) {
      setMap({});
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void (async () => {
      const stored = await loadSbyChecks(date, base);
      if (cancelled) return;
      setMap(stored);
      setReady(true);
      void pruneOldSbyChecks(date);
    })();
    return () => {
      cancelled = true;
    };
  }, [date, base]);

  // Auto-mark done at STD−30m; re-check every 30s
  useEffect(() => {
    if (!base || !ready || !rows.length) return;

    const tick = () => {
      const { map: next, changed } = applyAutoSbyChecks(rows, mapRef.current);
      if (!changed) return;
      mapRef.current = next;
      setMap(next);
      void saveSbyChecks(date, base, next);
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [base, date, ready, rows]);

  const toggle = useCallback(
    async (row: BaseDeparture) => {
      if (!base) return;
      const id = departureCheckKey(row);
      const prev = mapRef.current;
      const currently = Boolean(prev[id]?.done);
      const next: SbyCheckMap = { ...prev };
      if (currently) {
        delete next[id];
      } else {
        next[id] = { done: true, auto: false, at: Date.now() };
      }
      mapRef.current = next;
      setMap(next);
      await saveSbyChecks(date, base, next);
    },
    [base, date],
  );

  const markDone = useCallback(
    async (row: BaseDeparture) => {
      if (!base) return;
      const id = departureCheckKey(row);
      if (mapRef.current[id]?.done) return;
      const next: SbyCheckMap = {
        ...mapRef.current,
        [id]: { done: true, auto: false, at: Date.now() },
      };
      mapRef.current = next;
      setMap(next);
      await saveSbyChecks(date, base, next);
    },
    [base, date],
  );

  const { open, done } = partitionSbyChecklist(rows, map);

  return {
    ready,
    map,
    open,
    done,
    isChecked: (row: BaseDeparture) => isDepartureChecked(row, map),
    toggle,
    markDone,
  };
}
