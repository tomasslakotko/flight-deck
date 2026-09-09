"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchBaseDepartures,
  filterDeparturesForStandby,
  type BaseDeparture,
} from "@/lib/base-departures";
import type { Duty } from "@/lib/types";

const POLL_MS = 3 * 60 * 1000;

export function useBaseDepartures(base: string | undefined, sby?: Duty | null) {
  const [flights, setFlights] = useState<BaseDeparture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const refreshRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    const code = base?.trim().toUpperCase();
    if (!code || !/^[A-Z]{3}$/.test(code)) {
      setFlights([]);
      setError(null);
      setUpdatedAt(null);
      refreshRef.current = async () => {};
      return;
    }

    let cancelled = false;
    let intervalId: number | undefined;

    const stopPolling = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = undefined;
    };

    const startPolling = () => {
      stopPolling();
      intervalId = window.setInterval(() => void load(false), POLL_MS);
    };

    const load = async (force = false) => {
      setLoading(true);
      try {
        const rows = await fetchBaseDepartures(code, { force });
        if (cancelled) return;
        setFlights(filterDeparturesForStandby(rows, sby ?? undefined));
        setUpdatedAt(Date.now());
        setError(null);
        // Empty board for this base — no point re-hitting the API until a manual refresh
        if (!rows.length) stopPolling();
        else if (intervalId == null) startPolling();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Departures unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    refreshRef.current = async (force = true) => {
      startPolling();
      await load(force);
    };

    void load(false);
    startPolling();

    const onRefresh = () => void refreshRef.current(true);
    window.addEventListener("flightdeck-refresh", onRefresh);
    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener("flightdeck-refresh", onRefresh);
    };
  }, [base, sby?.std, sby?.sta, sby?.id]);

  const refresh = useCallback(() => refreshRef.current(true), []);

  return { flights, loading, error, updatedAt, refresh };
}
