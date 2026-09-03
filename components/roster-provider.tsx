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
import { db } from "@/lib/db";
import { tryStorage } from "@/lib/idb";
import { buildDemoDuties, buildDemoPassengers, buildDemoProfile } from "@/lib/demo-data";
import type { CrewProfile, Duty, Passenger } from "@/lib/types";

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
  importDuties: (incoming: Duty[], mode: "merge" | "replace") => Promise<void>;
  upsertDuty: (duty: Duty) => Promise<void>;
  deleteDuty: (id: string) => Promise<void>;
  replacePassengers: (flightDutyId: string, rows: Passenger[]) => Promise<void>;
  savePassenger: (row: Passenger) => Promise<void>;
  updateProfile: (patch: Partial<CrewProfile>) => Promise<void>;
  checkInToday: (date: string) => Promise<void>;
  resetDemo: () => Promise<void>;
  markSynced: () => Promise<void>;
};

const RosterContext = createContext<RosterContextValue | null>(null);

function memoryDemo(): Snapshot {
  const duties = buildDemoDuties();
  return {
    duties,
    passengers: buildDemoPassengers(duties),
    profile: buildDemoProfile(),
  };
}

function sortDuties(duties: Duty[]) {
  return duties.sort((a, b) => (a.std ?? a.date).localeCompare(b.std ?? b.date));
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

export function RosterProvider({ children }: { children: React.ReactNode }) {
  const demo = useMemo(() => memoryDemo(), []);
  const dirty = useRef(false);
  const [ready] = useState(true);
  const [duties, setDuties] = useState<Duty[]>(demo.duties);
  const [passengers, setPassengers] = useState<Passenger[]>(demo.passengers);
  const [profile, setProfile] = useState<CrewProfile>(demo.profile);

  const apply = useCallback((next: Snapshot) => {
    setDuties(next.duties);
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
        return;
      }
      const stored = await tryStorage(() => readStore());
      if (!cancelled && stored && !dirty.current && stored.duties.length) {
        apply(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const persistDuties = useCallback((rows: Duty[]) => {
    void tryStorage(() => db.duties.bulkPut(rows));
  }, []);

  const importDuties = useCallback(
    async (incoming: Duty[], mode: "merge" | "replace") => {
      markDirty();
      setDuties((prev) => {
        const byUid = new Map(prev.map((d) => [d.uid, d]));
        const next = mode === "replace" ? [] : [...prev];
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
        persistDuties(next);
        return sortDuties(next);
      });
    },
    [markDirty, persistDuties],
  );

  const upsertDuty = useCallback(
    async (duty: Duty) => {
      markDirty();
      setDuties((prev) => {
        const idx = prev.findIndex((d) => d.id === duty.id);
        const next = idx < 0 ? [...prev, duty] : prev.map((d, i) => (i === idx ? duty : d));
        void tryStorage(() => db.duties.put(duty));
        return sortDuties(next);
      });
    },
    [markDirty],
  );

  const deleteDuty = useCallback(
    async (id: string) => {
      markDirty();
      setDuties((prev) => prev.filter((d) => d.id !== id));
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
        void tryStorage(() => db.profile.put(next));
        return next;
      });
    },
    [markDirty],
  );

  const checkInToday = useCallback(
    async (date: string) => {
      markDirty();
      setProfile((prev) => {
        const dates = prev.checkedInDates.includes(date)
          ? prev.checkedInDates
          : [...prev.checkedInDates, date];
        const next = { ...prev, checkedInDates: dates };
        void tryStorage(() => db.profile.put(next));
        return next;
      });
    },
    [markDirty],
  );

  const resetDemo = useCallback(async () => {
    markDirty();
    const fresh = memoryDemo();
    apply(fresh);
    void tryStorage(async () => {
      await db.duties.clear();
      await db.passengers.clear();
      await db.duties.bulkPut(fresh.duties);
      await db.passengers.bulkPut(fresh.passengers);
      await db.profile.put(fresh.profile);
    });
  }, [apply, markDirty]);

  const markSynced = useCallback(async () => {
    await updateProfile({ lastSyncedAt: Date.now() });
  }, [updateProfile]);

  const value = useMemo(
    () => ({
      ready,
      duties,
      passengers,
      profile,
      importDuties,
      upsertDuty,
      deleteDuty,
      replacePassengers,
      savePassenger,
      updateProfile,
      checkInToday,
      resetDemo,
      markSynced,
    }),
    [
      ready,
      duties,
      passengers,
      profile,
      importDuties,
      upsertDuty,
      deleteDuty,
      replacePassengers,
      savePassenger,
      updateProfile,
      checkInToday,
      resetDemo,
      markSynced,
    ],
  );

  return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>;
}

export function useRoster() {
  const ctx = useContext(RosterContext);
  if (!ctx) throw new Error("useRoster must be used within RosterProvider");
  return ctx;
}
