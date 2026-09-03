"use client";

import { AppShell } from "@/components/app-shell";
import { FlightCard } from "@/components/flight-card";
import { useRoster } from "@/components/roster-provider";
import { Button } from "@/components/ui/button";
import { AIRPORT_NOTES } from "@/lib/airports";
import { formatLongDate, minutesUntil, todayKey } from "@/lib/dates";
import { useLiveFlight } from "@/hooks/use-live-flight";
import {
  flightsOnDate,
  nextDuty,
  phaseForFlight,
  phaseSchedule,
  PHASE_LABEL,
  shiftBounds,
} from "@/lib/shift";
import { cn } from "@/lib/utils";
import type { Duty } from "@/lib/types";

export function ShiftScreen() {
  const { duties, profile, checkInToday } = useRoster();
  const today = todayKey();
  const flights = flightsOnDate(duties, today);
  const bounds = shiftBounds(duties, today);
  const next = nextDuty(duties);
  const focus = flights[0] ?? next;
  const { data: live } = useLiveFlight(focus?.flightNumber);
  const checkedIn = profile.checkedInDates.includes(today);
  const mins = minutesUntil(bounds?.start ?? focus?.checkIn ?? focus?.std);
  const phase = focus ? phaseForFlight(focus) : "pre";
  const phases = focus ? phaseSchedule(focus) : [];

  const heading =
    !focus
      ? "No duty today"
      : mins != null && mins > 0 && !checkedIn
        ? "Your next shift starts in"
        : "Prepare the flight for boarding";

  const notes = Array.from(
    new Set(flights.flatMap((f) => [f.depIata, f.arrIata]).filter(Boolean) as string[]),
  )
    .map((code) => ({ code, text: AIRPORT_NOTES[code] }))
    .filter((n) => n.text);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex justify-center">
          <div className="rounded-full bg-white px-4 py-1.5 text-sm font-medium shadow-sm ring-1 ring-black/5">
            Your shift
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {heading}{" "}
            {mins != null && mins > 0 && !checkedIn ? (
              <span className="rounded-lg bg-red-100 px-2 py-0.5 text-red-700">
                {mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins}min`}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatLongDate(today)}</p>
        </div>

        {phases.length ? (
          <ol className="flex gap-2 overflow-x-auto pb-1">
            {phases.map((p) => (
              <li
                key={p.key}
                className={cn(
                  "min-w-[5.5rem] rounded-2xl bg-white px-3 py-2 text-center ring-1 ring-black/5",
                  p.key === phase && "bg-sky-50 ring-primary/30",
                )}
              >
                <div className="text-[11px] font-medium text-slate-500">{p.label}</div>
                <div className="text-sm font-semibold">{p.time}</div>
              </li>
            ))}
          </ol>
        ) : null}

        {!checkedIn && bounds ? (
          <Button
            className="h-14 rounded-full bg-emerald-500 text-base font-semibold text-white hover:bg-emerald-600"
            onClick={() => void checkInToday(today)}
          >
            <span className="flex flex-col leading-tight">
              Check in
              <span className="text-[11px] font-normal opacity-90">
                Tap to start your shift · {PHASE_LABEL[phase]}
              </span>
            </span>
          </Button>
        ) : null}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Flights</h2>
          {flights.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {flights.map((f) => (
                <FlightLiveCard key={f.id} duty={f} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-6 text-sm text-muted-foreground ring-1 ring-black/5">
              No flights on today&apos;s roster. Import an iCal link or add a duty manually.
            </div>
          )}
        </section>

        {notes.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Important notes</h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {notes.map((n) => (
                <article
                  key={n.code}
                  className="min-w-[16rem] flex-1 rounded-2xl bg-sky-50 p-4 text-sm text-sky-950"
                >
                  <div className="mb-1 text-xs font-bold tracking-wide text-sky-700">
                    {n.code}
                  </div>
                  {n.text}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {live?.registration || live?.depGate ? (
          <p className="text-[11px] text-muted-foreground">
            Live {live.sources.join(" · ") || "lookup"} · {live.registration ?? "reg pending"}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}

function FlightLiveCard({ duty }: { duty: Duty }) {
  const { data } = useLiveFlight(duty.flightNumber);
  return <FlightCard duty={duty} live={data} />;
}
