"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { tryStorage } from "@/lib/idb";
import { downloadIcs } from "@/lib/fetch-ics";
import { buildDemoDuties, buildDemoPassengers, buildDemoProfile } from "@/lib/demo-data";
import { todayKey } from "@/lib/dates";
import { toFlightIata } from "@/lib/airports";
import { enrichDutyRoutes, flightsOnDate } from "@/lib/shift";
import { dedupeFlightDuties } from "@/lib/parse-netline-pdf";
import {
  ICAL_REFRESH_MS,
  LIVE_REFRESH_MS,
  icalIsStale,
  liveIsStale,
  parseSession,
  sessionIsFresh,
  type SessionStamp,
} from "@/lib/session";
import type { CrewProfile, Duty, LiveFlight, Passenger } from "@/lib/types";

type Snapshot = {
  duties: Duty[];
  passengers: Passenger[];
  profile: CrewProfile;
};

type RosterContextValue = {
  ready: boolean;
  duties: Duty[];
  passengers: Passenger[];
  profile: CrewProfile;
  liveByIata: Record<string, LiveFlight>;
  sessionLoading: boolean;
  online: boolean;
  session: SessionStamp | null;
  syncError: string | null;
  importDuties: (incoming: Duty[], mode: "merge" | "replace") => Promise<Duty[]>;
  upsertDuty: (duty: Duty) => Promise<void>;
  deleteDuty: (id: string) => Promise<void>;
  replacePassengers: (flightDutyId: string, rows: Passenger[]) => Promise<void>;
  savePassenger: (row: Passenger) => Promise<void>;
  updateProfile: (patch: Partial<CrewProfile>) => Promise<void>;
  resetDemo: () => Promise<void>;
  clearPastDuties: () => Promise<number>;
  clearRoster: () => Promise<void>;
  markSynced: () => Promise<void>;
  refreshSession: (force?: boolean, silent?: boolean) => Promise<void>;
};

const RosterContext = createContext<RosterContextValue | null>(null);

function memoryDemo(): Snapshot {
  const duties = enrichDutyRoutes(buildDemoDuties());
  return {
    duties,
    passengers: buildDemoPassengers(duties),
    profile: buildDemoProfile(),
  };
}

function sortDuties(duties: Duty[]) {
  return [...duties].sort((a, b) => (a.std ?? a.date).localeCompare(b.std ?? b.date));
}

function normalizeDuties(duties: Duty[]) {
  return enrichDutyRoutes(dedupeFlightDuties(sortDuties(duties)));
}

function mergeDutyLists(prev: Duty[], incoming: Duty[], mode: "merge" | "replace") {
  const incomingIcal = incoming.some((d) => d.source === "ical");
  const incomingPdf = incoming.some((d) => d.source === "pdf");
  const base =
    mode === "replace"
      ? []
      : incomingPdf || incomingIcal
        ? prev.filter((d) => d.source === "manual")
        : [...prev];
  const byUid = new Map(base.map((d) => [d.uid, d]));
  const next = [...base];
  const seen = new Set(next.map((d) => d.id));
  for (const duty of incoming) {
    const existing = byUid.get(duty.uid);
    if (existing) {
      const idx = next.findIndex((d) => d.id === existing.id);
      if (idx >= 0) {
        next[idx] = {
          ...duty,
          id: existing.id,
          privateNotes: duty.privateNotes ?? existing.privateNotes,
        };
      }
    } else if (!seen.has(duty.id)) {
      // Keep private notes if same sector was stored under another uid
      const twin = next.find(
        (d) =>
          d.date === duty.date &&
          (d.flightNumber ?? "") === (duty.flightNumber ?? "") &&
          (d.depIata ?? "") === (duty.depIata ?? "") &&
          (d.arrIata ?? "") === (duty.arrIata ?? "") &&
          d.privateNotes,
      );
      next.push(twin ? { ...duty, privateNotes: twin.privateNotes } : duty);
      seen.add(duty.id);
    }
  }
  return dedupeFlightDuties(sortDuties(next));
}

function todayFlightCodes(duties: Duty[]) {
  const codes = flightsOnDate(duties, todayKey())
    .map((d) => toFlightIata(d.flightNumber) ?? d.flightNumber)
    .filter((code): code is string => Boolean(code));
  return [...new Set(codes)];
}

async function readStore(): Promise<Snapshot> {
  const [duties, passengers, profile] = await Promise.all([
    db.duties.toArray(),
    db.passengers.toArray(),
    db.profile.get("me"),
  ]);
  return {
    duties: sortDuties(duties),
    passengers,
    profile: profile ?? buildDemoProfile(),
  };
}

async function persistLive(rows: LiveFlight[]) {
  if (!rows.length) return;
  await tryStorage(async () => {
    await db.liveFlights.bulkPut(rows);
    const keep = new Set(rows.map((row) => row.flightIata));
    const stale = (await db.liveFlights.toArray())
      .map((row) => row.flightIata)
      .filter((code) => !keep.has(code));
    if (stale.length) await db.liveFlights.bulkDelete(stale);
  });
}

async function persistSession(stamp: SessionStamp) {
  await tryStorage(() =>
    db.flags.put({ key: "session", value: JSON.stringify(stamp) }),
  );
}

export function RosterProvider({ children }: { children: React.ReactNode }) {
  const demo = useMemo(() => memoryDemo(), []);
  const dirty = useRef(false);
  const dutiesRef = useRef<Duty[]>(demo.duties);
  const profileRef = useRef<CrewProfile>(demo.profile);
  const sessionRef = useRef<SessionStamp | null>(null);
  const liveRef = useRef<Record<string, LiveFlight>>({});
  const bootstrapping = useRef(false);
  const [ready] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [duties, setDuties] = useState<Duty[]>(demo.duties);
  const [passengers, setPassengers] = useState<Passenger[]>(demo.passengers);
  const [profile, setProfile] = useState<CrewProfile>(demo.profile);
  const [liveByIata, setLiveByIata] = useState<Record<string, LiveFlight>>({});
  const [session, setSession] = useState<SessionStamp | null>(null);

  dutiesRef.current = duties;
  profileRef.current = profile;
  sessionRef.current = session;
  liveRef.current = liveByIata;

  const apply = useCallback((next: Snapshot) => {
    setDuties(normalizeDuties(next.duties));
    setPassengers(next.passengers);
    setProfile(next.profile);
  }, []);

  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);

  useEffect(() => {
    const sync = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seeded = await tryStorage(() => db.flags.get("seeded"));
      if (cancelled) return;
      if (!seeded?.value) {
        const fresh = memoryDemo();
        await tryStorage(async () => {
          await db.duties.bulkPut(fresh.duties);
          await db.passengers.bulkPut(fresh.passengers);
          await db.profile.put(fresh.profile);
          await db.flags.put({ key: "seeded", value: true });
        });
      } else {
        const stored = await tryStorage(() => readStore());
        if (!cancelled && stored && !dirty.current && stored.duties.length) {
          const cleaned = normalizeDuties(stored.duties);
          apply({ ...stored, duties: cleaned });
          if (cleaned.length !== stored.duties.length) {
            await tryStorage(async () => {
              await db.transaction("rw", db.duties, async () => {
                await db.duties.clear();
                if (cleaned.length) await db.duties.bulkPut(cleaned);
              });
            });
          }
        }
      }
      const [liveRows, sessionFlag] = await Promise.all([
        tryStorage(() => db.liveFlights.toArray()),
        tryStorage(() => db.flags.get("session")),
      ]);
      if (cancelled) return;
      if (liveRows?.length) {
        setLiveByIata(
          Object.fromEntries(liveRows.map((row) => [row.flightIata, row])),
        );
      }
      const stamp = parseSession(sessionFlag?.value);
      sessionRef.current = stamp;
      setSession(stamp);
      setHydrated(true);
      if (sessionIsFresh(stamp)) setSessionLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const persistDuties = useCallback((rows: Duty[]) => {
    void tryStorage(async () => {
      await db.transaction("rw", db.duties, async () => {
        await db.duties.clear();
        if (rows.length) await db.duties.bulkPut(rows);
      });
    }, 12_000);
  }, []);

  const importDuties = useCallback(
    async (incoming: Duty[], mode: "merge" | "replace") => {
      markDirty();
      const next = normalizeDuties(mergeDutyLists(dutiesRef.current, incoming, mode));
      dutiesRef.current = next;
      setDuties(next);
      persistDuties(next);
      return next;
    },
    [markDirty, persistDuties],
  );

  const upsertDuty = useCallback(
    async (duty: Duty) => {
      markDirty();
      setDuties((prev) => {
        const idx = prev.findIndex((d) => d.id === duty.id);
        const next = idx < 0 ? [...prev, duty] : prev.map((d, i) => (i === idx ? duty : d));
        dutiesRef.current = normalizeDuties(next);
        void tryStorage(() => db.duties.put(duty));
        return dutiesRef.current;
      });
    },
    [markDirty],
  );

  const deleteDuty = useCallback(
    async (id: string) => {
      markDirty();
      setDuties((prev) => {
        const next = prev.filter((d) => d.id !== id);
        dutiesRef.current = next;
        return next;
      });
      setPassengers((prev) => prev.filter((p) => p.flightDutyId !== id));
      void tryStorage(async () => {
        await db.duties.delete(id);
        await db.passengers.where("flightDutyId").equals(id).delete();
      });
    },
    [markDirty],
  );

  const replacePassengers = useCallback(
    async (flightDutyId: string, rows: Passenger[]) => {
      markDirty();
      setPassengers((prev) => [
        ...prev.filter((p) => p.flightDutyId !== flightDutyId),
        ...rows,
      ]);
      void tryStorage(async () => {
        await db.passengers.where("flightDutyId").equals(flightDutyId).delete();
        if (rows.length) await db.passengers.bulkPut(rows);
      });
    },
    [markDirty],
  );

  const savePassenger = useCallback(
    async (row: Passenger) => {
      markDirty();
      setPassengers((prev) => {
        const idx = prev.findIndex((p) => p.id === row.id);
        if (idx < 0) return [...prev, row];
        const next = [...prev];
        next[idx] = row;
        return next;
      });
      void tryStorage(() => db.passengers.put(row));
    },
    [markDirty],
  );

  const updateProfile = useCallback(
    async (patch: Partial<CrewProfile>) => {
      markDirty();
      setProfile((prev) => {
        const next = { ...prev, ...patch, id: "me" as const };
        profileRef.current = next;
        void tryStorage(() => db.profile.put(next));
        return next;
      });
    },
    [markDirty],
  );

  const markSynced = useCallback(async () => {
    await updateProfile({ lastSyncedAt: Date.now() });
  }, [updateProfile]);

  const refreshSession = useCallback(
    async (force = false, silent = false) => {
      if (bootstrapping.current) return;
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (offline) {
        setOnline(false);
        setSyncError("Offline — showing cached roster and live status");
        setSessionLoading(false);
        const prev = sessionRef.current;
        if (prev) {
          const stamp = { ...prev, offline: true, error: "offline" };
          sessionRef.current = stamp;
          setSession(stamp);
        }
        return;
      }

      if (!force && sessionIsFresh(sessionRef.current) && !icalIsStale(sessionRef.current) && !liveIsStale(sessionRef.current)) {
        setSessionLoading(false);
        setSyncError(null);
        return;
      }

      bootstrapping.current = true;
      setSessionLoading(true);
      let icalAt = sessionRef.current?.icalAt;
      let liveAt = sessionRef.current?.liveAt;
      let error: string | undefined;

      try {
        let nextDuties = dutiesRef.current;
        const icalUrl = profileRef.current.icalUrl?.trim();
        const wantIcal =
          Boolean(icalUrl) &&
          profileRef.current.autoRefreshIcal !== false &&
          (force || icalIsStale(sessionRef.current));

        if (wantIcal && icalUrl) {
          try {
            const text = await downloadIcs(icalUrl);
            const { parseIcs } = await import("@/lib/parse-roster");
            const parsed = parseIcs(text, "ical");
            if (parsed.duties.length) {
              nextDuties = await importDuties(parsed.duties, "merge");
            }
            icalAt = Date.now();
          } catch (err) {
            error = err instanceof Error ? err.message : "Roster update failed";
            if (force && !silent) toast.error(error);
          }
        }

        const codes = todayFlightCodes(nextDuties);
        const wantLive = force || liveIsStale(sessionRef.current) || !sessionIsFresh(sessionRef.current);
        if (codes.length && wantLive) {
          try {
            const res = await fetch(
              `/api/flights/live?flights=${encodeURIComponent(codes.join(","))}`,
            );
            if (!res.ok) throw new Error("Live lookup failed");
            const json = (await res.json()) as { flights?: LiveFlight[] } | LiveFlight;
            const rows = Array.isArray((json as { flights?: LiveFlight[] }).flights)
              ? (json as { flights: LiveFlight[] }).flights
              : "flightIata" in json
                ? [json]
                : [];
            if (rows.length) {
              const byIata = Object.fromEntries(rows.map((row) => [row.flightIata, row]));
              setLiveByIata(byIata);
              await persistLive(rows);
              liveAt = Date.now();
            }
          } catch (err) {
            // Keep cached live flights — offline-first
            error = err instanceof Error ? err.message : "Live update failed";
            if (force && !silent && !icalAt) toast.error(error);
          }
        }

        const stamp: SessionStamp = {
          at: Date.now(),
          date: todayKey(),
          icalAt,
          liveAt,
          offline: false,
          error,
        };
        sessionRef.current = stamp;
        setSession(stamp);
        await persistSession(stamp);
        await markSynced();
        setSyncError(error ? `${error} · using cached data where needed` : null);
        setOnline(true);
        if (force && !silent && !error) toast.success("Roster and today’s flights updated");
        if (force && !silent && error && (icalAt || liveAt || Object.keys(liveRef.current).length)) {
          toast.message("Updated with cached fallback", { description: error });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Refresh failed";
        setSyncError(`${msg} · showing cached data`);
        if (force && !silent) toast.error(msg);
      } finally {
        bootstrapping.current = false;
        setSessionLoading(false);
      }
    },
    [importDuties, markSynced],
  );

  useEffect(() => {
    if (!hydrated) return;
    void refreshSession(false);
  }, [hydrated, refreshSession]);

  // Periodic auto-refresh + resume on focus / online
  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      void refreshSession(false, true);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onOnline = () => {
      setOnline(true);
      void refreshSession(true, true);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("online", onOnline);
    const id = window.setInterval(tick, Math.min(ICAL_REFRESH_MS, LIVE_REFRESH_MS));
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("online", onOnline);
      window.clearInterval(id);
    };
  }, [hydrated, refreshSession]);

  const resetDemo = useCallback(async () => {
    markDirty();
    const fresh = memoryDemo();
    apply(fresh);
    dutiesRef.current = fresh.duties;
    profileRef.current = fresh.profile;
    setLiveByIata({});
    setSession(null);
    setSyncError(null);
    void tryStorage(async () => {
      await db.duties.clear();
      await db.passengers.clear();
      await db.liveFlights.clear();
      await db.duties.bulkPut(fresh.duties);
      await db.passengers.bulkPut(fresh.passengers);
      await db.profile.put(fresh.profile);
      await db.flags.delete("session");
    });
  }, [apply, markDirty]);

  const clearPastDuties = useCallback(async () => {
    markDirty();
    const today = todayKey();
    const prev = dutiesRef.current;
    const keep = prev.filter((d) => d.date >= today);
    const removedIds = new Set(prev.filter((d) => d.date < today).map((d) => d.id));
    const removed = removedIds.size;
    dutiesRef.current = keep;
    setDuties(keep);
    setPassengers((rows) => rows.filter((p) => !removedIds.has(p.flightDutyId)));
    persistDuties(keep);
    void tryStorage(async () => {
      for (const id of removedIds) {
        await db.passengers.where("flightDutyId").equals(id).delete();
      }
    });
    return removed;
  }, [markDirty, persistDuties]);

  const clearRoster = useCallback(async () => {
    markDirty();
    dutiesRef.current = [];
    setDuties([]);
    setPassengers([]);
    setLiveByIata({});
    setSession(null);
    sessionRef.current = null;
    setSyncError(null);
    await tryStorage(async () => {
      await db.duties.clear();
      await db.passengers.clear();
      await db.liveFlights.clear();
      await db.flags.delete("session");
    });
  }, [markDirty]);

  const value = useMemo(
    () => ({
      ready,
      duties,
      passengers,
      profile,
      liveByIata,
      sessionLoading,
      online,
      session,
      syncError,
      importDuties,
      upsertDuty,
      deleteDuty,
      replacePassengers,
      savePassenger,
      updateProfile,
      resetDemo,
      clearPastDuties,
      clearRoster,
      markSynced,
      refreshSession,
    }),
    [
      ready,
      duties,
      passengers,
      profile,
      liveByIata,
      sessionLoading,
      online,
      session,
      syncError,
      importDuties,
      upsertDuty,
      deleteDuty,
      replacePassengers,
      savePassenger,
      updateProfile,
      resetDemo,
      clearPastDuties,
      clearRoster,
      markSynced,
      refreshSession,
    ],
  );

  return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>;
}

export function useRoster() {
  const ctx = useContext(RosterContext);
  if (!ctx) throw new Error("useRoster must be used within RosterProvider");
  return ctx;
}
