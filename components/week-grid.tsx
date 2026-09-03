"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Bed } from "lucide-react";
import { formatClock } from "@/lib/dates";
import type { Duty } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

export function WeekGrid({
  days,
  dutiesByDate,
  today,
}: {
  days: Date[];
  dutiesByDate: Map<string, Duty[]>;
  today: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const items = dutiesByDate.get(key) ?? [];
        const flights = items.filter((d) => d.type === "flight");
        const off = items.some((d) => d.type === "off") && !flights.length;
        const hotel = items.find((d) => d.type === "hotel");
        const sby = items.find((d) => d.type === "standby" || d.type === "reserve");
        const isToday = key === today;
        const first = flights[0]?.std;
        const last = flights[flights.length - 1]?.sta;
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
                  {formatClock(first)} – {formatClock(last)} · {flights.length} flights
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
                      {f.depIata} → {f.arrIata}
                    </span>
                    <StatusBadge />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {f.flightNumber} · {formatClock(f.std)}–{formatClock(f.sta)}
                  </div>
                </Link>
              ))}
              {sby ? (
                <div className="rounded-xl bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-900">
                  Standby {formatClock(sby.std)}–{formatClock(sby.sta)}
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
