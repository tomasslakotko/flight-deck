"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { FlightCard } from "@/components/flight-card";
import { useRoster } from "@/components/roster-provider";
import { AIRPORT_NOTES, airportTz, flightRouteLabel } from "@/lib/airports";
import { formatClock, formatLongDate, formatShortDate, minutesUntil, todayKey } from "@/lib/dates";
import { useLiveFlight } from "@/hooks/use-live-flight";
import {
  checkInIso,
  flightsOnDate,
  nextDuty,
  nextPairingAfter,
  phaseForShift,
  phaseSchedule,
  resolvedFlightStatus,
  shiftBounds,
} from "@/lib/shift";
import { cn } from "@/lib/utils";
import type { Duty } from "@/lib/types";

export function ShiftScreen() {
  const { duties } = useRoster();
  const today = todayKey();
  const flights = flightsOnDate(duties, today);
  const bounds = shiftBounds(duties, today);
  const next = nextDuty(duties);
  const nextPair = nextPairingAfter(duties, bounds?.end) ?? null;
  const mins = minutesUntil(
    bounds?.start ?? (flights[0] ? checkInIso(flights[0]) : undefined) ?? next?.std,
  );
  const phase = flights.length ? phaseForShift(flights) : "pre";
  const phases = flights.length ? phaseSchedule(flights) : [];

  const heading =
    !flights.length && !next
      ? "No duty today"
      : flights.length && (phase === "done" || phase === "transfer")
        ? phase === "done"
          ? "Duty complete"
          : "Check out after the last landing"
        : mins != null && mins > 0
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
            {mins != null && mins > 0 && phase !== "done" ? (
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
                <div className="text-sm font-semibold tabular-nums">{p.time}</div>
              </li>
            ))}
          </ol>
        ) : null}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Flights</h2>
          {flights.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {flights.map((f) => (
                <FlightLiveCard key={`${f.id}-${f.flightNumber ?? f.title}`} duty={f} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-6 text-sm text-muted-foreground ring-1 ring-black/5">
              No flights on today&apos;s roster. Import an iCal link or add a duty manually.
            </div>
          )}
        </section>

        {nextPair?.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Next duty</h2>
            <NextDutyCard pairing={nextPair} today={today} />
          </section>
        ) : null}

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
      </div>
    </AppShell>
  );
}

function NextDutyCard({ pairing, today }: { pairing: Duty[]; today: string }) {
  const first = pairing[0];
  const last = pairing[pairing.length - 1];
  const report = checkInIso(first) || first.std;
  const otherDay = first.date !== today;
  const routes = pairing.map((f) => flightRouteLabel(f)).join(" · ");
  const numbers = pairing
    .map((f) => f.flightNumber)
    .filter(Boolean)
    .join(" / ");

  return (
    <Link
      href={`/flight/${first.id}`}
      className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-wide">
            {numbers || first.title}
          </div>
          <div className="mt-1 text-sm text-slate-700">{routes}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            {otherDay ? `${formatShortDate(first.date)} · ` : null}
            Report {formatClock(report, airportTz(first.depIata))}
            {last.sta
              ? ` – ${formatClock(last.sta, airportTz(last.arrIata))}`
              : null}
            {pairing.length > 1 ? ` · ${pairing.length} flights` : null}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200/80">
          Next
        </span>
      </div>
    </Link>
  );
}

function FlightLiveCard({ duty }: { duty: Duty }) {
  const { data } = useLiveFlight(duty.flightNumber);
  const status = resolvedFlightStatus(duty, data);
  return <FlightCard duty={duty} live={data ? { ...data, status } : data} />;
}
