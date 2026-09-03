import type { Duty } from "@/lib/types";
import { formatClock, minutesUntil } from "@/lib/dates";

export function flightsOnDate(duties: Duty[], date: string) {
  return duties
    .filter((d) => d.date === date && d.type === "flight")
    .sort((a, b) => (a.std ?? "").localeCompare(b.std ?? ""));
}

export function dutiesOnDate(duties: Duty[], date: string) {
  return duties
    .filter((d) => d.date === date)
    .sort((a, b) => (a.std ?? "").localeCompare(b.std ?? ""));
}

export function shiftBounds(duties: Duty[], date: string) {
  const day = dutiesOnDate(duties, date).filter((d) => d.type !== "off");
  if (!day.length) return null;
  const start = day[0].checkIn || day[0].std;
  const end = day[day.length - 1].sta || day[day.length - 1].std;
  return { start, end, duties: day };
}

export type FlightPhase =
  | "pre"
  | "preparation"
  | "boarding"
  | "service"
  | "landing"
  | "transfer"
  | "done";

export function phaseForFlight(duty: Duty, now = new Date()): FlightPhase {
  if (!duty.std) return "pre";
  const toStd = minutesUntil(duty.std, now) ?? 0;
  const toSta = minutesUntil(duty.sta, now) ?? toStd - 90;
  if (toStd > 30) return "pre";
  if (toStd > 15) return "preparation";
  if (toStd > 0) return "boarding";
  if (toSta > 20) return "service";
  if (toSta > 0) return "landing";
  if (toSta > -20) return "transfer";
  return "done";
}

export const PHASE_LABEL: Record<FlightPhase, string> = {
  pre: "Before report",
  preparation: "Preparation",
  boarding: "Boarding",
  service: "Service",
  landing: "Landing prep",
  transfer: "Transfer",
  done: "Completed",
};

export function phaseSchedule(duty: Duty) {
  if (!duty.std) return [];
  const std = new Date(duty.std);
  const sta = duty.sta ? new Date(duty.sta) : new Date(std.getTime() + 90 * 60_000);
  const mk = (label: string, date: Date, key: FlightPhase) => ({
    label,
    time: formatClock(date.toISOString()),
    key,
  });
  const at = (base: Date, min: number) => new Date(base.getTime() + min * 60_000);
  return [
    mk("Preparation", at(std, -15), "preparation"),
    mk("Boarding", std, "boarding"),
    mk("Service", at(std, 20), "service"),
    mk("Landing prep", at(sta, -15), "landing"),
    mk("Transfer", sta, "transfer"),
  ];
}

export function nextDuty(duties: Duty[], now = new Date()) {
  const upcoming = duties
    .filter((d) => d.type === "flight" && d.std && new Date(d.sta || d.std) > now)
    .sort((a, b) => (a.std ?? "").localeCompare(b.std ?? ""));
  return upcoming[0];
}
