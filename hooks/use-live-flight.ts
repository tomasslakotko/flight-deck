"use client";

import { useEffect, useState } from "react";
import type { LiveFlight } from "@/lib/types";

export function useLiveFlight(flightIata?: string) {
  const [data, setData] = useState<LiveFlight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!flightIata) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/flights/live?flightIata=${encodeURIComponent(flightIata)}`,
        );
        if (!res.ok) throw new Error("Live lookup failed");
        const json = (await res.json()) as LiveFlight;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Live lookup failed");
          setData({
            flightIata,
            sources: [],
            updatedAt: Date.now(),
            unavailable: true,
            message: "Live data unavailable",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    const t = setInterval(run, 3 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [flightIata]);

  return { data, loading, error };
}
