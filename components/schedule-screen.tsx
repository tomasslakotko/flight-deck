"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addMonths, addWeeks, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { WeekGrid } from "@/components/week-grid";
import { MonthGrid } from "@/components/month-grid";
import { useRoster } from "@/components/roster-provider";
import { Button } from "@/components/ui/button";
import { monthGridDays, todayKey, weekDays } from "@/lib/dates";
import { airportTz, flightRouteLabel } from "@/lib/airports";
import { formatClock } from "@/lib/dates";
import { continuationsByDate, dutiesByScheduleDate, isFlightDuty } from "@/lib/shift";
import { cn } from "@/lib/utils";

type ViewMode = "week" | "month";

export function ScheduleScreen() {
  const { duties } = useRoster();
  const [view, setView] = useState<ViewMode>("week");
  const [offset, setOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const today = todayKey();
  const anchor = view === "week" ? addWeeks(new Date(), offset) : addMonths(new Date(), offset);
  const days = view === "week" ? weekDays(anchor) : monthGridDays(anchor);
  const byDate = useMemo(() => dutiesByScheduleDate(duties), [duties]);
  const continuations = useMemo(() => continuationsByDate(duties), [duties]);
  const detailKey = selectedDay ?? (view === "month" ? today : null);
  const detailItems = detailKey ? (byDate.get(detailKey) ?? []) : [];
  const detailFlights = detailItems.filter((d) => isFlightDuty(d) && d.type !== "checkin");
  const detailStandbys = detailItems.filter((d) => d.type === "standby" || d.type === "reserve");
  const detailOffOnly =
    !detailFlights.length && !detailStandbys.length && detailItems.some((d) => d.type === "off");

  return (
    <AppShell wide={view === "month"}>
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
            <p className="text-sm text-muted-foreground">{format(anchor, "MMMM yyyy")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-white p-1 ring-1 ring-black/5">
              <button
                type="button"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  view === "week" ? "bg-primary text-primary-foreground" : "text-slate-600",
                )}
                onClick={() => {
                  setView("week");
                  setOffset(0);
                }}
              >
                Week
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  view === "month" ? "bg-primary text-primary-foreground" : "text-slate-600",
                )}
                onClick={() => {
                  setView("month");
                  setOffset(0);
                  setSelectedDay(today);
                }}
              >
                Month
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-11" onClick={() => setOffset((v) => v - 1)}>
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setOffset(0);
                  if (view === "month") setSelectedDay(today);
                }}
              >
                Today
              </Button>
              <Button variant="outline" size="icon" className="size-11" onClick={() => setOffset((v) => v + 1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>

        {view === "week" ? (
          <WeekGrid days={days} dutiesByDate={byDate} continuationsByDate={continuations} today={today} />
        ) : (
          <>
            <MonthGrid
              days={days}
              monthAnchor={anchor}
              dutiesByDate={byDate}
              continuationsByDate={continuations}
              today={today}
              selected={detailKey}
              onSelect={setSelectedDay}
            />
            {detailKey ? (
              <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                <h2 className="text-sm font-semibold">
                  {format(parseISO(`${detailKey}T12:00:00`), "EEEE, d MMMM")}
                </h2>
                {!detailFlights.length && !detailStandbys.length && !detailOffOnly ? (
                  <p className="mt-2 text-sm text-muted-foreground">No flights this day</p>
                ) : detailOffOnly ? (
                  <p className="mt-2 text-sm text-muted-foreground">Day off</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {detailStandbys.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
                      >
                        <div className="font-semibold">
                          {d.type === "reserve" ? "Reserve" : "Standby"}
                          {d.depIata ? ` · ${d.depIata}` : ""}
                        </div>
                        <div className="mt-0.5 text-xs text-amber-900/80">
                          {d.title}
                          {d.std || d.sta
                            ? ` · ${formatClock(d.std, airportTz(d.depIata))}–${formatClock(d.sta, airportTz(d.depIata))}`
                            : ""}
                        </div>
                      </div>
                    ))}
                    {detailFlights.length ? (
                      <ul className="divide-y rounded-xl ring-1 ring-slate-100">
                        {detailFlights.map((f) => (
                          <li key={f.id}>
                            <Link
                              href={`/flight/${f.id}`}
                              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-slate-50"
                            >
                              <div>
                                <div className="font-semibold">{flightRouteLabel(f)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {f.flightNumber} · {formatClock(f.std, airportTz(f.depIata))}–
                                  {formatClock(f.sta, airportTz(f.arrIata))}
                                  {f.privateNotes?.trim() ? " · note" : ""}
                                </div>
                              </div>
                              <span className="text-xs text-primary">Open</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
