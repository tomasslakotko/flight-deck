"use client";

import Link from "next/link";
import { Map, Plane, StickyNote } from "lucide-react";
import { airportCity, airportTz } from "@/lib/airports";
import { resolvedFlightStatus } from "@/lib/shift";
import { clocksDiffer, durationLabel, formatClock } from "@/lib/dates";
import type { Duty, LiveFlight } from "@/lib/types";
import { parseCrewNotes } from "@/lib/parse-crew";
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
  const depTz = airportTz(duty.depIata);
  const arrTz = airportTz(duty.arrIata);
  const liveDep = live?.etd;
  const showStd = clocksDiffer(liveDep, duty.std, depTz);
  const status = resolvedFlightStatus(duty, live);
  const parsedCrew = parseCrewNotes(duty.notes).crew;
  const avatars = parsedCrew.length
    ? parsedCrew.map((member) => member.code.slice(0, 2))
    : Array.from({ length: crewCount }, (_, i) => ["A", "K", "M", "J"][i] ?? "C");
  const flightLabel = duty.flightNumber ?? duty.title;
  return (
    <article
      className={cn(
        "relative rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5",
        delayed && "border-l-4 border-l-amber-400",
      )}
    >
      <Link
        href={`/flight/${duty.id}`}
        className="absolute inset-0 z-10 rounded-2xl"
        aria-label={`${flightLabel} flight details`}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold tracking-wide">
            {flightLabel}
            {duty.privateNotes?.trim() ? (
              <StickyNote className="size-3.5 text-amber-600" aria-label="Has private note" />
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {durationLabel(duty.std, duty.sta) || duty.aircraftType || "Flight"}
          </div>
        </div>
        <StatusBadge status={status} delayMin={live?.delayMin} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">{duty.depIata || "—"}</div>
          <div className="text-xs text-muted-foreground">{airportCity(duty.depIata)}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center px-2">
          <Plane className="size-4 text-slate-400" />
          <div className="mt-1 h-px w-full border-t border-dashed border-slate-300" />
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tracking-tight">{duty.arrIata || "—"}</div>
          <div className="text-xs text-muted-foreground">{airportCity(duty.arrIata)}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <div>
          <span className="font-medium">{formatClock(liveDep || duty.std, depTz)}</span>
          {showStd ? (
            <span className="ml-2 text-xs text-slate-400 line-through">
              {formatClock(duty.std, depTz)}
            </span>
          ) : null}
        </div>
        <div className="font-medium">{formatClock(live?.eta || duty.sta, arrTz)}</div>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center">
          {avatars.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="-ml-1 flex size-7 items-center justify-center rounded-full bg-sky-100 text-[10px] font-semibold text-sky-800 ring-2 ring-white first:ml-0"
            >
              {label}
            </span>
          ))}
          <span className="ml-2 text-[11px] text-muted-foreground">Crew</span>
          {duty.position ? (
            <span className="ml-2 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              You {duty.position}
            </span>
          ) : null}
        </div>
        <Link
          href={`/flight/${duty.id}/passengers?view=map`}
          className="relative z-20 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-sky-50 px-3.5 text-sm font-semibold text-sky-800 ring-1 ring-sky-200/80 transition-transform active:scale-[0.96]"
          aria-label={`Seat map for ${flightLabel}`}
        >
          <Map className="size-4" />
          Seats
        </Link>
      </div>
    </article>
  );
}
