"use client";

import Link from "next/link";
import { Plane } from "lucide-react";
import { airportCity } from "@/lib/airports";
import { durationLabel, formatClock } from "@/lib/dates";
import type { Duty, LiveFlight } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export function FlightCard({
  duty,
  live,
  crewCount = 4,
}: {
  duty: Duty;
  live?: LiveFlight | null;
  crewCount?: number;
}) {
  const delayed = (live?.delayMin ?? 0) >= 10;
  return (
    <Link
      href={`/flight/${duty.id}`}
      className={cn(
        "block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5",
        delayed && "border-l-4 border-l-amber-400",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-wide">
            {duty.flightNumber ?? duty.title}
          </div>
          <div className="text-xs text-muted-foreground">
            {durationLabel(duty.std, duty.sta) || duty.aircraftType || "A220"}
          </div>
        </div>
        <StatusBadge status={live?.status} delayMin={live?.delayMin} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">{duty.depIata}</div>
          <div className="text-xs text-muted-foreground">{airportCity(duty.depIata)}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center px-2">
          <Plane className="size-4 text-slate-400" />
          <div className="mt-1 h-px w-full border-t border-dashed border-slate-300" />
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tracking-tight">{duty.arrIata}</div>
          <div className="text-xs text-muted-foreground">{airportCity(duty.arrIata)}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <div>
          <span className="font-medium">{formatClock(live?.etd || duty.std)}</span>
          {live?.etd && live.etd !== duty.std ? (
            <span className="ml-2 text-xs text-slate-400 line-through">
              {formatClock(duty.std)}
            </span>
          ) : null}
        </div>
        <div className="font-medium">{formatClock(live?.eta || duty.sta)}</div>
      </div>

      {(live?.registration || live?.depGate) && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
          {live.registration ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">
              {live.registration}
            </span>
          ) : null}
          {live.depGate ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5">
              Gate {live.depGate}
              {live.terminal ? ` · T${live.terminal}` : ""}
            </span>
          ) : null}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center">
          {Array.from({ length: crewCount }).map((_, i) => (
            <span
              key={i}
              className="-ml-1 flex size-7 items-center justify-center rounded-full bg-sky-100 text-[10px] font-semibold text-sky-800 ring-2 ring-white first:ml-0"
            >
              {["A", "K", "M", "J"][i]}
            </span>
          ))}
          <span className="ml-2 text-[11px] text-muted-foreground">Crew</span>
        </div>
        {duty.position ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            You {duty.position}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
