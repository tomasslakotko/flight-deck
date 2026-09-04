"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Bed } from "lucide-react";
import { formatClock } from "@/lib/dates";
import { airportTz, flightRouteLabel } from "@/lib/airports";
import { isFlightDuty, type ShiftContinuation } from "@/lib/shift";
import type { Duty } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

export function WeekGrid({
  days,
  dutiesByDate,
  continuationsByDate,
  today,
}: {
  days: Date[];
  dutiesByDate: Map<string, Duty[]>;
  continuationsByDate?: Map<string, ShiftContinuation[]>;
  today: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const items = dutiesByDate.get(key) ?? [];
        const flights = items.filter((d) => isFlightDuty(d) && d.type !== "checkin");
        const continuations = continuationsByDate?.get(key) ?? [];
        const showContinuations = !flights.length && continuations.length > 0;
        const off = items.some((d) => d.type === "off") && !flights.length && !showContinuations;
        const hotel = items.find((d) => d.type === "hotel");
        const sby = items.find((d) => d.type === "standby" || d.type === "reserve");
        const isToday = key === today;
        const first = flights[0]?.std;
        const last = flights[flights.length - 1]?.sta;
        const continuation = continuations[0];
        return (
          <section
            key={key}
            className={cn(
              "min-h-56 rounded-2xl bg-white p-3 ring-1 ring-black/5",
              isToday && "ring-2 ring-primary/40",
            )}
          >
            <header
              className={cn(
                "-mx-3 -mt-3 mb-3 rounded-t-2xl px-3 py-2",
                isToday ? "bg-primary text-primary-foreground" : "bg-slate-50",
              )}
            >
              <div className="text-xs font-medium opacity-80">
                {format(day, "EEEE")}
              </div>
              <div className="text-lg font-semibold">{format(day, "d")}</div>
              {flights.length ? (
                <div className="text-[11px] opacity-80">
                  {formatClock(first, airportTz(flights[0]?.depIata))} – {formatClock(last, airportTz(flights[flights.length - 1]?.arrIata))} · {flights.length} {flights.length === 1 ? "flight" : "flights"}
                </div>
              ) : showContinuations && continuation ? (
                <div className="text-[11px] opacity-80">
                  from {format(parseISO(`${continuation.fromDate}T12:00:00`), "EEE")} · landing {formatClock(continuation.last.sta, airportTz(continuation.last.arrIata))}
                </div>
              ) : null}
            </header>
            <div className="flex flex-col gap-2">
              {off ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-[repeating-linear-gradient(-45deg,transparent,transparent_6px,#e8eef4_6px,#e8eef4_7px)] px-2 py-6 text-center text-xs font-medium text-slate-500">
                  Day off
                </div>
              ) : null}
              {flights.map((f) => (
                <Link
                  key={f.id}
                  href={`/flight/${f.id}`}
                  className="rounded-xl bg-sky-50 px-2.5 py-2 text-left"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold">
                      {flightRouteLabel(f)}
                    </span>
                    <StatusBadge />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {f.flightNumber} · {formatClock(f.std, airportTz(f.depIata))}–{formatClock(f.sta, airportTz(f.arrIata))}
                  </div>
                </Link>
              ))}
              {showContinuations
                ? continuations.map((row) => (
                    <Link
                      key={`${row.fromDate}-${row.last.id}`}
                      href={`/flight/${row.last.id}`}
                      className="rounded-xl bg-slate-50 px-2.5 py-2 text-left ring-1 ring-slate-200/80"
                    >
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Continues from {format(parseISO(`${row.fromDate}T12:00:00`), "EEEE")}
                      </div>
                      <div className="mt-1 text-xs font-semibold">{flightRouteLabel(row.last)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {row.last.flightNumber} · landing {formatClock(row.last.sta, airportTz(row.last.arrIata))}
                      </div>
                    </Link>
                  ))
                : null}
              {sby ? (
                <div className="rounded-xl bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-900">
                  Standby {formatClock(sby.std, airportTz(sby.depIata))}–{formatClock(sby.sta, airportTz(sby.depIata))}
                </div>
              ) : null}
              {hotel ? (
                <div className="rounded-xl bg-emerald-50 px-2.5 py-2 text-emerald-900">
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    <Bed className="size-3.5" />
                    {hotel.hotelName ?? hotel.title}
                  </div>
                  <div className="mt-1 text-[11px]">
                    Check-in {formatClock(hotel.std)}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
