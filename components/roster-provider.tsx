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
import { parseSession, sessionIsFresh, type SessionStamp } from "@/lib/session";
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
  importDuties: (incoming: Duty[], mode: "merge" | "replace") => Promise<Duty[]>;
  upsertDuty: (duty: Duty) => Promise<void>;
  deleteDuty: (id: string) => Promise<void>;
  replacePassengers: (flightDutyId: string, rows: Passenger[]) => Promise<void>;
  savePassenger: (row: Passenger) => Promise<void>;
  updateProfile: (patch: Partial<CrewProfile>) => Promise<void>;
  resetDemo: () => Promise<void>;
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
  return enrichDutyRoutes(sortDuties(duties));
}

function mergeDutyLists(prev: Duty[], incoming: Duty[], mode: "merge" | "replace") {
  const incomingIcal = incoming.some((d) => d.source === "ical");
  const base =
    mode === "replace"
      ? []
      : incomingIcal
        ? prev.filter((d) => d.source === "manual" || d.source === "pdf")
        : [...prev];
  const byUid = new Map(base.map((d) => [d.uid, d]));
  const next = [...base];
  const seen = new Set(next.map((d) => d.id));
  for (const duty of incoming) {
    const existing = byUid.get(duty.uid);
    if (existing) {
      const idx = next.findIndex((d) => d.id === existing.id);
      if (idx >= 0) next[idx] = { ...duty, id: existing.id };
    } else if (!seen.has(duty.id)) {
      next.push(duty);
      seen.add(duty.id);
    }
  }
  return sortDuties(next);
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
  const bootstrapping = useRef(false);
  const [ready] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [duties, setDuties] = useState<Duty[]>(demo.duties);
  const [passengers, setPassengers] = useState<Passenger[]>(demo.passengers);
  const [profile, setProfile] = useState<CrewProfile>(demo.profile);
  const [liveByIata, setLiveByIata] = useState<Record<string, LiveFlight>>({});
  const [session, setSession] = useState<SessionStamp | null>(null);

  dutiesRef.current = duties;
  profileRef.current = profile;
  sessionRef.current = session;

  const apply = useCallback((next: Snapshot) => {
    setDuties(normalizeDuties(next.duties));
    setPassengers(next.passengers);
    setProfile(next.profile);
  }, []);

  const markDirty = useCallback(() => {
    dirty.current = true;
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
          apply(stored);
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
      if (!force && sessionIsFresh(sessionRef.current)) {
        setSessionLoading(false);
        return;
      }
      bootstrapping.current = true;
      setSessionLoading(true);
      try {
        let nextDuties = dutiesRef.current;
        const icalUrl = profileRef.current.icalUrl?.trim();
        if (icalUrl) {
          try {
            const text = await downloadIcs(icalUrl);
            const { parseIcs } = await import("@/lib/parse-roster");
            const parsed = parseIcs(text, "ical");
            if (parsed.duties.length) {
              nextDuties = await importDuties(parsed.duties, "merge");
            }
          } catch (err) {
            if (force && !silent) {
              toast.error(err instanceof Error ? err.message : "Roster update failed");
            }
          }
        }

        const codes = todayFlightCodes(nextDuties);
        if (codes.length) {
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
          const byIata = Object.fromEntries(rows.map((row) => [row.flightIata, row]));
          setLiveByIata(byIata);
          await persistLive(rows);
        }

        const stamp: SessionStamp = { at: Date.now(), date: todayKey() };
        sessionRef.current = stamp;
        setSession(stamp);
        await persistSession(stamp);
        await markSynced();
        if (force && !silent) toast.success("Roster and today’s flights updated");
      } catch (err) {
        if (force && !silent) {
          toast.error(err instanceof Error ? err.message : "Refresh failed");
        }
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

  const resetDemo = useCallback(async () => {
    markDirty();
    const fresh = memoryDemo();
    apply(fresh);
    dutiesRef.current = fresh.duties;
    profileRef.current = fresh.profile;
    setLiveByIata({});
    setSession(null);
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

  const value = useMemo(
    () => ({
      ready,
      duties,
      passengers,
      profile,
      liveByIata,
      sessionLoading,
      importDuties,
      upsertDuty,
      deleteDuty,
      replacePassengers,
      savePassenger,
      updateProfile,
      resetDemo,
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
      importDuties,
      upsertDuty,
      deleteDuty,
      replacePassengers,
      savePassenger,
      updateProfile,
      resetDemo,
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
