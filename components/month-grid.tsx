"use client";

import { format } from "date-fns";
import { StickyNote } from "lucide-react";
import { dateKey, sameMonth } from "@/lib/dates";
import { isFlightDuty, type ShiftContinuation } from "@/lib/shift";
import type { Duty } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MonthGrid({
  days,
  monthAnchor,
  dutiesByDate,
  continuationsByDate,
  today,
  selected,
  onSelect,
}: {
  days: Date[];
  monthAnchor: Date;
  dutiesByDate: Map<string, Duty[]>;
  continuationsByDate?: Map<string, ShiftContinuation[]>;
  today: string;
  selected?: string | null;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-medium text-slate-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = dateKey(day);
          const inMonth = sameMonth(day, monthAnchor);
          const items = dutiesByDate.get(key) ?? [];
          const flights = items.filter((d) => isFlightDuty(d) && d.type !== "checkin");
          const off = items.some((d) => d.type === "off") && !flights.length;
          const sby = items.some((d) => d.type === "standby" || d.type === "reserve");
          const hotel = items.some((d) => d.type === "hotel");
          const cont = continuationsByDate?.get(key)?.length ?? 0;
          const hasNotes = items.some((d) => d.privateNotes?.trim());
          const isToday = key === today;
          const isSelected = key === selected;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect?.(key)}
              className={cn(
                "min-h-[4.5rem] border-b border-r border-slate-100 p-1.5 text-left transition-colors last:border-r-0",
                !inMonth && "bg-slate-50/60 text-slate-400",
                inMonth && "hover:bg-sky-50/60",
                isSelected && "bg-sky-50 ring-inset ring-2 ring-primary/30",
                isToday && !isSelected && "bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                {hasNotes ? <StickyNote className="size-3 text-amber-600" /> : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {off ? (
                  <span className="rounded bg-slate-200/80 px-1 text-[9px] font-medium text-slate-600">
                    Off
                  </span>
                ) : null}
                {sby ? (
                  <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-900">
                    SBY
                  </span>
                ) : null}
                {hotel ? (
                  <span className="rounded bg-emerald-100 px-1 text-[9px] font-medium text-emerald-900">
                    HTL
                  </span>
                ) : null}
                {flights.slice(0, 3).map((f) => (
                  <span
                    key={f.id}
                    className="max-w-full truncate rounded bg-sky-100 px-1 text-[9px] font-medium text-sky-900"
                  >
                    {f.flightNumber ?? f.depIata ?? "FLT"}
                  </span>
                ))}
                {flights.length > 3 ? (
                  <span className="text-[9px] text-slate-400">+{flights.length - 3}</span>
                ) : null}
                {!flights.length && cont > 0 ? (
                  <span className="rounded bg-slate-100 px-1 text-[9px] text-slate-500">cont.</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
