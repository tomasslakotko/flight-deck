"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { db } from "@/lib/db";
import { buildDemoDuties, buildDemoPassengers, buildDemoProfile } from "@/lib/demo-data";
import type { CrewProfile, Duty, Passenger } from "@/lib/types";

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

function memoryDemo() {
  const duties = buildDemoDuties();
  return {
    duties,
    passengers: buildDemoPassengers(duties),
    profile: buildDemoProfile(),
  };
}

async function readStore() {
  const [duties, passengers, profile] = await Promise.all([
    db.duties.toArray(),
    db.passengers.toArray(),
    db.profile.get("me"),
  ]);
  return {
    duties: duties.sort((a, b) => (a.std ?? a.date).localeCompare(b.std ?? b.date)),
    passengers,
    profile: profile ?? buildDemoProfile(),
  };
}

export function RosterProvider({ children }: { children: React.ReactNode }) {
  const demo = useMemo(() => memoryDemo(), []);
  const [ready, setReady] = useState(true);
  const [duties, setDuties] = useState<Duty[]>(demo.duties);
  const [passengers, setPassengers] = useState<Passenger[]>(demo.passengers);
  const [profile, setProfile] = useState<CrewProfile>(demo.profile);

  const apply = useCallback(
    (next: { duties: Duty[]; passengers: Passenger[]; profile: CrewProfile }) => {
      setDuties(next.duties);
      setPassengers(next.passengers);
      setProfile(next.profile);
    },
    [],
  );

  const reload = useCallback(async () => {
    try {
      apply(await readStore());
    } catch {
      apply(memoryDemo());
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const seeded = await db.flags.get("seeded");
        if (!seeded?.value) {
          const fresh = memoryDemo();
          await db.duties.bulkPut(fresh.duties);
          await db.passengers.bulkPut(fresh.passengers);
          await db.profile.put(fresh.profile);
          await db.flags.put({ key: "seeded", value: true });
        }
        if (cancelled) return;
        apply(await readStore());
      } catch {
        if (!cancelled) apply(memoryDemo());
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const importDuties = useCallback(
    async (incoming: Duty[], mode: "merge" | "replace") => {
      try {
        if (mode === "replace") await db.duties.clear();
        const existing = await db.duties.toArray();
        const byUid = new Map(existing.map((d) => [d.uid, d]));
        for (const duty of incoming) {
          const prev = byUid.get(duty.uid);
          await db.duties.put(prev ? { ...duty, id: prev.id } : duty);
        }
        await reload();
      } catch {
        setDuties((prev) => {
          const byUid = new Map(prev.map((d) => [d.uid, d]));
          const next = mode === "replace" ? [] : [...prev];
          for (const duty of incoming) {
            const existing = byUid.get(duty.uid);
            if (existing) {
              const idx = next.findIndex((d) => d.id === existing.id);
              if (idx >= 0) next[idx] = { ...duty, id: existing.id };
            } else next.push(duty);
          }
          return next;
        });
      }
    },
    [reload],
  );

  const upsertDuty = useCallback(
    async (duty: Duty) => {
      try {
        await db.duties.put(duty);
        await reload();
      } catch {
        setDuties((prev) => {
          const idx = prev.findIndex((d) => d.id === duty.id);
          if (idx < 0) return [...prev, duty];
          const next = [...prev];
          next[idx] = duty;
          return next;
        });
      }
    },
    [reload],
  );

  const deleteDuty = useCallback(
    async (id: string) => {
      try {
        await db.duties.delete(id);
        await db.passengers.where("flightDutyId").equals(id).delete();
        await reload();
      } catch {
        setDuties((prev) => prev.filter((d) => d.id !== id));
        setPassengers((prev) => prev.filter((p) => p.flightDutyId !== id));
      }
    },
    [reload],
  );

  const replacePassengers = useCallback(
    async (flightDutyId: string, rows: Passenger[]) => {
      try {
        await db.passengers.where("flightDutyId").equals(flightDutyId).delete();
        if (rows.length) await db.passengers.bulkPut(rows);
        await reload();
      } catch {
        setPassengers((prev) => [
          ...prev.filter((p) => p.flightDutyId !== flightDutyId),
          ...rows,
        ]);
      }
    },
    [reload],
  );

  const savePassenger = useCallback(
    async (row: Passenger) => {
      try {
        await db.passengers.put(row);
        await reload();
      } catch {
        setPassengers((prev) => {
          const idx = prev.findIndex((p) => p.id === row.id);
          if (idx < 0) return [...prev, row];
          const next = [...prev];
          next[idx] = row;
          return next;
        });
      }
    },
    [reload],
  );

  const updateProfile = useCallback(async (patch: Partial<CrewProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch, id: "me" as const };
      void db.profile.put(next).catch(() => undefined);
      return next;
    });
  }, []);

  const checkInToday = useCallback(
    async (date: string) => {
      const dates = profile.checkedInDates.includes(date)
        ? profile.checkedInDates
        : [...profile.checkedInDates, date];
      await updateProfile({ checkedInDates: dates });
    },
    [profile.checkedInDates, updateProfile],
  );

  const resetDemo = useCallback(async () => {
    const fresh = memoryDemo();
    apply(fresh);
    try {
      await db.duties.clear();
      await db.passengers.clear();
      await db.duties.bulkPut(fresh.duties);
      await db.passengers.bulkPut(fresh.passengers);
      await db.profile.put(fresh.profile);
    } catch {
      /* keep memory demo */
    }
  }, [apply]);

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
