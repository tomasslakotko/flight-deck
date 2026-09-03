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

async function seedIfNeeded() {
  const seeded = await db.flags.get("seeded");
  if (seeded?.value) return;
  const duties = buildDemoDuties();
  await db.duties.bulkPut(duties);
  await db.passengers.bulkPut(buildDemoPassengers(duties));
  await db.profile.put(buildDemoProfile());
  await db.flags.put({ key: "seeded", value: true });
}

export function RosterProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [profile, setProfile] = useState<CrewProfile>(buildDemoProfile());

  const reload = useCallback(async () => {
    const [d, p, me] = await Promise.all([
      db.duties.toArray(),
      db.passengers.toArray(),
      db.profile.get("me"),
    ]);
    setDuties(d.sort((a, b) => (a.std ?? a.date).localeCompare(b.std ?? b.date)));
    setPassengers(p);
    if (me) setProfile(me);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await seedIfNeeded();
      if (cancelled) return;
      await reload();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const importDuties = useCallback(
    async (incoming: Duty[], mode: "merge" | "replace") => {
      if (mode === "replace") {
        await db.duties.clear();
      }
      const existing = await db.duties.toArray();
      const byUid = new Map(existing.map((d) => [d.uid, d]));
      for (const duty of incoming) {
        const prev = byUid.get(duty.uid);
        await db.duties.put(prev ? { ...duty, id: prev.id } : duty);
      }
      await reload();
    },
    [reload],
  );

  const upsertDuty = useCallback(
    async (duty: Duty) => {
      await db.duties.put(duty);
      await reload();
    },
    [reload],
  );

  const deleteDuty = useCallback(
    async (id: string) => {
      await db.duties.delete(id);
      await db.passengers.where("flightDutyId").equals(id).delete();
      await reload();
    },
    [reload],
  );

  const replacePassengers = useCallback(
    async (flightDutyId: string, rows: Passenger[]) => {
      await db.passengers.where("flightDutyId").equals(flightDutyId).delete();
      if (rows.length) await db.passengers.bulkPut(rows);
      await reload();
    },
    [reload],
  );

  const savePassenger = useCallback(
    async (row: Passenger) => {
      await db.passengers.put(row);
      await reload();
    },
    [reload],
  );

  const updateProfile = useCallback(
    async (patch: Partial<CrewProfile>) => {
      const next = { ...profile, ...patch, id: "me" as const };
      await db.profile.put(next);
      setProfile(next);
    },
    [profile],
  );

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
    await db.duties.clear();
    await db.passengers.clear();
    const dutiesNext = buildDemoDuties();
    await db.duties.bulkPut(dutiesNext);
    await db.passengers.bulkPut(buildDemoPassengers(dutiesNext));
    await db.profile.put(buildDemoProfile());
    await reload();
  }, [reload]);

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
