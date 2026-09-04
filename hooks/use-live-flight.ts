"use client";

import { toFlightIata } from "@/lib/airports";
import { useRoster } from "@/components/roster-provider";

export function useLiveFlight(flightIata?: string) {
  const { liveByIata, sessionLoading } = useRoster();
  const key = flightIata ? (toFlightIata(flightIata) ?? flightIata.toUpperCase()) : undefined;
  const data = key ? (liveByIata[key] ?? null) : null;
  return {
    data,
    loading: Boolean(key) && sessionLoading && !data,
    error: null as string | null,
  };
}
