"use client";

import Link from "next/link";
import { airportTz, flightRouteLabel } from "@/lib/airports";
import { formatClock } from "@/lib/dates";
import { isFlightDuty } from "@/lib/shift";
import type { Duty } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DutyTimeline({
  duties,
  shiftStart,
  shiftEnd,
}: {
  duties: Duty[];
  shiftStart?: string | null;
  shiftEnd?: string | null;
}) {
  const flights = duties.filter((d) => isFlightDuty(d));
  if (!flights.length && !shiftStart) return null;
  const startTz = airportTz(flights[0]?.depIata);
  const endTz = airportTz(flights[flights.length - 1]?.arrIata);

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center px-2">
      <div className="relative flex items-end gap-0 overflow-x-auto">
        <Tick label="Shift start" time={formatClock(shiftStart, startTz)} tone="green" />
        {flights.map((f) => (
          <Link
            key={`${f.id}-${f.flightNumber ?? f.title}`}
            href={`/flight/${f.id}`}
            className="min-w-[7.5rem] flex-1 px-1"
          >
            <div className="mb-1 text-center text-[11px] font-medium text-slate-600">
              {flightRouteLabel(f)}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="tabular-nums">{formatClock(f.std, airportTz(f.depIata))}</span>
              <span className="h-1.5 flex-1 rounded-full bg-sky-400/80" />
              <span className="tabular-nums">{formatClock(f.sta, airportTz(f.arrIata))}</span>
            </div>
          </Link>
        ))}
        <Tick label="Shift end" time={formatClock(shiftEnd, endTz)} tone="slate" />
      </div>
    </div>
  );
}

function Tick({
  label,
  time,
  tone,
}: {
  label: string;
  time: string;
  tone: "green" | "slate";
}) {
  return (
    <div className="flex min-w-[4.5rem] flex-col items-center px-1">
      <div className="text-[10px] font-medium text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1 h-1.5 w-full rounded-full",
          tone === "green" ? "bg-emerald-500" : "bg-slate-300",
        )}
      />
      <div className="mt-0.5 text-[10px] tabular-nums text-slate-400">{time}</div>
    </div>
  );
}
