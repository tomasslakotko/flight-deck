"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FlightCard } from "@/components/flight-card";
import { useRoster } from "@/components/roster-provider";
import { AIRPORT_NOTES, airportCity, airportTz, flightRouteLabel } from "@/lib/airports";
import { formatClock, formatLongDate, formatShortDate, minutesUntil, todayKey } from "@/lib/dates";
import { formatSyncedAgo } from "@/lib/session";
import { useLiveFlight } from "@/hooks/use-live-flight";
import { useBaseDepartures } from "@/hooks/use-base-departures";
import { useSbyChecklist } from "@/hooks/use-sby-checklist";
import {
  departureBoardLabel,
  departureOperatorHint,
  departureTimes,
  resolveSbyBase,
  todayStandby,
  type BaseDeparture,
} from "@/lib/base-departures";
import { SBY_AUTO_DONE_BEFORE_MIN } from "@/lib/sby-checklist";
import {
  checkInIso,
  flightsOnDate,
  nextDuty,
  nextPairingAfter,
  nextStandbyDuty,
  phaseForFlight,
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
  const activeFlights = flights.filter((f) => phaseForFlight(f) !== "done");
  const previousFlights = flights.filter((f) => phaseForFlight(f) === "done");
  const sby = todayStandby(duties, today);
  const sbyBase = resolveSbyBase(sby, flights);
  const sbyForBoard =
    sby && sbyBase && sby.depIata !== sbyBase ? { ...sby, depIata: sbyBase } : sby;
  const {
    flights: board,
    loading: boardLoading,
    error: boardError,
    updatedAt: boardUpdatedAt,
    refresh: refreshBoard,
  } = useBaseDepartures(sbyBase, sbyForBoard);
  const checklist = useSbyChecklist(today, sbyBase, board);
  const bounds = shiftBounds(duties, today);
  const next = nextDuty(duties);
  // When today is empty, still find the next pairing after now (tomorrow, etc.)
  const nextPair = nextPairingAfter(duties, bounds?.end) ?? null;
  const upcomingSby = !sby ? nextStandbyDuty(duties) : undefined;
  const nextReport =
    (activeFlights[0] ? checkInIso(activeFlights[0]) : undefined) ??
    sby?.std ??
    (nextPair?.[0] ? checkInIso(nextPair[0]) || nextPair[0].std : undefined) ??
    upcomingSby?.std ??
    next?.std;
  const mins = minutesUntil(bounds?.start ?? nextReport);
  const phase = flights.length ? phaseForShift(flights) : "pre";
  const phases = activeFlights.length ? phaseSchedule(activeFlights) : [];

  const heading = activeFlights.length
    ? phase === "transfer"
      ? "Check out after the last landing"
      : mins != null && mins > 0
        ? "Your next shift starts in"
        : "Prepare the flight for boarding"
    : previousFlights.length && sby
      ? sby.type === "reserve"
        ? `Reserve · ${sbyBase ?? "base"}`
        : `Standby · ${sbyBase ?? "base"}`
      : previousFlights.length
        ? "Duty complete"
        : sby
          ? sby.type === "reserve"
            ? `Reserve · ${sbyBase ?? "base"}`
            : `Standby · ${sbyBase ?? "base"}`
          : nextPair?.length || upcomingSby || next
            ? "Your next shift starts in"
            : "Day off";

  const showNextCountdown =
    heading.startsWith("Your next shift starts in") && mins != null && mins > 0;
  const pill =
    activeFlights.length && sby
      ? "Shift + Standby"
      : previousFlights.length && sby && !activeFlights.length
        ? "Standby"
        : sby && !flights.length
          ? sby.type === "reserve"
            ? "Reserve"
            : "Standby"
          : nextPair?.length || upcomingSby
            ? "Upcoming"
            : "Your shift";

  const notes = Array.from(
    new Set(
      [
        ...flights.flatMap((f) => [f.depIata, f.arrIata]),
        ...(nextPair ?? []).flatMap((f) => [f.depIata, f.arrIata]),
        sbyBase,
        upcomingSby?.depIata,
      ].filter(Boolean) as string[],
    ),
  )
    .map((code) => ({ code, text: AIRPORT_NOTES[code] }))
    .filter((n) => n.text);

  const focusDate =
    !flights.length && !sby && nextPair?.[0]?.date
      ? nextPair[0].date
      : !flights.length && !sby && upcomingSby?.date
        ? upcomingSby.date
        : today;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex justify-center">
          <div className="rounded-full bg-white px-4 py-1.5 text-sm font-medium shadow-sm ring-1 ring-black/5">
            {pill}
          </div>
        </div>

        <div>
          <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-semibold tracking-tight md:text-3xl">
            <span>{heading}</span>
            {showNextCountdown ? (
              <span className="inline-block whitespace-nowrap rounded-lg bg-red-100 px-2 py-0.5 text-red-700">
                {mins! >= 60
                  ? `${Math.floor(mins! / 60)}h ${mins! % 60}min`
                  : `${mins}min`}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatLongDate(focusDate)}</p>
          {sby ? (
            <p className="mt-1 text-sm text-amber-900/80">
              {sby.type === "reserve" ? "Reserve" : "Standby"}
              {sby.title && sby.title.toLowerCase() !== "standby" ? ` · ${sby.title}` : ""}
              {sby.std || sby.sta
                ? ` · ${formatClock(sby.std, airportTz(sbyBase))}–${formatClock(sby.sta, airportTz(sbyBase))}`
                : ""}
              {sbyBase ? ` · ${airportCity(sbyBase) ?? sbyBase}` : ""}
            </p>
          ) : null}
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

        {activeFlights.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Flights</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {activeFlights.map((f) => (
                <FlightLiveCard key={`${f.id}-${f.flightNumber ?? f.title}`} duty={f} />
              ))}
            </div>
          </section>
        ) : null}

        {previousFlights.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Previous duty</h2>
            <PreviousDutyCard pairing={previousFlights} today={today} />
          </section>
        ) : null}

        {sby ? (
          <SbyChecklistSection
            base={sbyBase}
            board={board}
            boardLoading={boardLoading}
            boardError={boardError}
            boardUpdatedAt={boardUpdatedAt}
            onRefresh={() => void refreshBoard()}
            checklist={checklist}
          />
        ) : null}

        {nextPair?.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Next duty</h2>
            <NextDutyCard pairing={nextPair} today={today} />
          </section>
        ) : null}

        {!nextPair?.length && upcomingSby ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Next duty</h2>
            <UpcomingStandbyCard duty={upcomingSby} today={today} />
          </section>
        ) : null}

        {!flights.length && !sby && !nextPair?.length && !upcomingSby ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Flights</h2>
            <div className="rounded-2xl bg-white p-6 text-sm text-muted-foreground ring-1 ring-black/5">
              No flights on today&apos;s roster. Import an iCal link or add a duty manually.
            </div>
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

function SbyChecklistSection({
  base,
  board,
  boardLoading,
  boardError,
  boardUpdatedAt,
  onRefresh,
  checklist,
}: {
  base?: string;
  board: BaseDeparture[];
  boardLoading: boolean;
  boardError: string | null;
  boardUpdatedAt: number | null;
  onRefresh: () => void;
  checklist: ReturnType<typeof useSbyChecklist>;
}) {
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setUpdatedLabel(formatSyncedAgo(boardUpdatedAt));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [boardUpdatedAt]);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-500">
            Standby checklist · BT-operated from {base ?? "base"}
          </h2>
          {updatedLabel ? (
            <p className="text-[11px] text-muted-foreground">Updated {updatedLabel}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={boardLoading}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-transform hover:bg-slate-100 active:scale-[0.96] disabled:opacity-50"
          aria-label="Refresh departures"
        >
          <RefreshCw className={cn("size-4", boardLoading && "animate-spin")} />
        </button>
      </div>
      {boardLoading && !board.length ? (
        <div className="rounded-2xl bg-white p-6 text-sm text-muted-foreground ring-1 ring-black/5">
          Loading departures…
        </div>
      ) : boardError && !board.length ? (
        <div className="rounded-2xl bg-white p-6 text-sm text-muted-foreground ring-1 ring-black/5">
          Could not load BT-operated departures ({boardError}).{" "}
          <button type="button" className="font-medium underline" onClick={onRefresh}>
            Retry
          </button>
        </div>
      ) : board.length ? (
        <div className="space-y-4">
          {checklist.open.length ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {checklist.open.map((row) => (
                <li key={`${row.flightIata}-${row.std ?? row.etd}`}>
                  <BaseDepartureCard
                    row={row}
                    checked={false}
                    onToggle={() => void checklist.toggle(row)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-100">
              All listed BT-operated departures are checked off.
            </div>
          )}
          {checklist.done.length ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Done · {checklist.done.length}
              </h3>
              <ul className="grid gap-2 md:grid-cols-2">
                {checklist.done.map((row) => (
                  <li key={`done-${row.flightIata}-${row.std ?? row.etd}`}>
                    <BaseDepartureCard
                      row={row}
                      checked
                      onToggle={() => void checklist.toggle(row)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl bg-amber-50 p-6 text-sm text-amber-950 ring-1 ring-amber-100">
          No BT-operated departures in your SBY window from {base ?? "base"} right now.
          <button
            type="button"
            className="mt-2 block font-medium underline"
            onClick={onRefresh}
          >
            Refresh board
          </button>
        </div>
      )}
    </section>
  );
}

function BaseDepartureCard({
  row,
  checked,
  onToggle,
}: {
  row: BaseDeparture;
  checked: boolean;
  onToggle: () => void;
}) {
  const times = departureTimes(row);
  const delayed = (row.delayMin ?? 0) > 0;
  const mins = minutesUntil(row.etd ?? row.std);
  const soon = !checked && mins != null && mins > 0 && mins <= SBY_AUTO_DONE_BEFORE_MIN;
  const opHint = departureOperatorHint(row);

  return (
    <article
      className={cn(
        "flex items-stretch gap-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5",
        checked && "opacity-70",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={checked ? `Unmark ${row.flightIata}` : `Mark ${row.flightIata} done`}
        className={cn(
          "flex w-12 shrink-0 items-center justify-center transition-colors",
          checked
            ? "bg-emerald-500 text-white"
            : "bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-800",
        )}
      >
        <Check className={cn("size-5", checked ? "opacity-100" : "opacity-40")} strokeWidth={2.5} />
      </button>
      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={cn(
                "text-sm font-semibold tracking-wide",
                checked && "text-slate-500 line-through",
              )}
            >
              {row.flightIata}
              {opHint ? (
                <span className="ml-2 text-[11px] font-medium text-amber-800/90">{opHint}</span>
              ) : null}
            </div>
            <div className={cn("mt-1 text-sm text-slate-700", checked && "text-slate-500")}>
              {departureBoardLabel(row)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {times.startTime ?? "—"}
              {times.endTime ? `–${times.endTime}` : ""}
              {row.gate ? ` · Gate ${row.gate}` : row.terminal ? ` · T${row.terminal}` : ""}
              {row.aircraftType ? ` · ${row.aircraftType}` : ""}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1",
              checked
                ? "bg-slate-100 text-slate-600 ring-slate-200/80"
                : soon
                  ? "bg-amber-50 text-amber-900 ring-amber-200/80"
                  : delayed
                    ? "bg-amber-50 text-amber-900 ring-amber-200/80"
                    : "bg-emerald-50 text-emerald-900 ring-emerald-200/80",
            )}
          >
            {checked
              ? "Done"
              : soon
                ? `Auto ${mins}m`
                : delayed
                  ? `+${Math.round(row.delayMin!)}m`
                  : row.status?.replace(/_/g, " ") || "On time"}
          </span>
        </div>
      </div>
    </article>
  );
}

function PreviousDutyCard({ pairing, today }: { pairing: Duty[]; today: string }) {
  const [open, setOpen] = useState(false);
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
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-wide text-slate-700">
            {numbers || first.title}
          </div>
          <div className="mt-1 text-sm text-slate-600">{routes}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            {otherDay ? `${formatShortDate(first.date)} · ` : null}
            {formatClock(report, airportTz(first.depIata))}
            {last.sta ? ` – ${formatClock(last.sta, airportTz(last.arrIata))}` : null}
            {pairing.length > 1 ? ` · ${pairing.length} flights` : null}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
          Done
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-3 md:grid-cols-2">
          {pairing.map((f) => (
            <FlightLiveCard key={`prev-${f.id}-${f.flightNumber ?? f.title}`} duty={f} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NextDutyCard({ pairing, today }: { pairing: Duty[]; today: string }) {
  const [open, setOpen] = useState(false);
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
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50"
        aria-expanded={open}
      >
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
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200/80">
          Next
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div
          className={cn(
            "grid gap-3 border-t border-slate-100 bg-slate-50/60 p-3",
            pairing.length >= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
          )}
        >
          {pairing.map((f) => (
            <FlightLiveCard key={`next-${f.id}-${f.flightNumber ?? f.title}`} duty={f} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UpcomingStandbyCard({ duty, today }: { duty: Duty; today: string }) {
  const otherDay = duty.date !== today;
  const base = duty.depIata;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-wide">
            {duty.type === "reserve" ? "Reserve" : "Standby"}
            {duty.title && duty.title.toLowerCase() !== "standby" ? ` · ${duty.title}` : ""}
          </div>
          <div className="mt-1 text-sm text-slate-700">
            {airportCity(base) ?? base ?? "Base"}
            {base ? ` · ${base}` : ""}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {otherDay ? `${formatShortDate(duty.date)} · ` : null}
            {duty.std || duty.sta
              ? `${formatClock(duty.std, airportTz(base))}–${formatClock(duty.sta, airportTz(base))}`
              : "Time TBC"}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200/80">
          Next
        </span>
      </div>
    </div>
  );
}

function FlightLiveCard({ duty }: { duty: Duty }) {
  const { data } = useLiveFlight(duty.flightNumber);
  const status = resolvedFlightStatus(duty, data);
  return <FlightCard duty={duty} live={data ? { ...data, status } : data} />;
}
