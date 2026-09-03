import Dexie, { type EntityTable } from "dexie";
import type { CrewProfile, Duty, Passenger } from "@/lib/types";

export type Flag = { key: string; value: boolean | string | number };

export const db = new Dexie("bt-crew") as Dexie & {
  duties: EntityTable<Duty, "id">;
  passengers: EntityTable<Passenger, "id">;
  profile: EntityTable<CrewProfile, "id">;
  flags: EntityTable<Flag, "key">;
};

db.version(1).stores({
  duties: "id, uid, date, type, flightNumber, source",
  passengers: "id, flightDutyId, seat, lastName",
  profile: "id",
  flags: "key",
});
