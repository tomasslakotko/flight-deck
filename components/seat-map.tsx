"use client";

import { cn } from "@/lib/utils";
import type { Passenger } from "@/lib/types";

const COLS = ["A", "C", "aisle", "D", "E", "F"] as const;
const EXIT_ROWS = new Set([1, 12, 13]);

export function SeatMap({
  rows = 28,
  passengers,
  onSelect,
}: {
  rows?: number;
  passengers: Passenger[];
  onSelect: (pax: Passenger | { seat: string }) => void;
}) {
  const bySeat = new Map(
    passengers.filter((p) => p.seat).map((p) => [p.seat!.toUpperCase(), p]),
  );

  return (
    <div className="overflow-x-auto rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <div className="mb-3 flex justify-center gap-8 text-[11px] font-medium text-slate-400">
        <span>A</span>
        <span>C</span>
        <span className="w-6" />
        <span>D</span>
        <span>E</span>
        <span>F</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: rows }, (_, i) => i + 1).map((row) => (
          <div key={row} className="flex items-center justify-center gap-1.5">
            <span className="w-6 text-right text-[11px] text-slate-400">{row}</span>
            {COLS.map((col) => {
              if (col === "aisle") {
                return <span key={`${row}-aisle`} className="w-4" />;
              }
              const seat = `${row}${col}`;
              const pax = bySeat.get(seat);
              return (
                <button
                  key={seat}
                  type="button"
                  aria-label={
                    pax
                      ? `${seat} ${pax.lastName}/${pax.firstName}`
                      : `Seat ${seat}`
                  }
                  onClick={() => onSelect(pax ?? { seat })}
                  className={cn(
                    "flex h-11 min-w-11 flex-col items-center justify-center rounded-lg text-[9px] leading-tight ring-1 ring-slate-200",
                    pax ? "bg-sky-50" : "bg-slate-50",
                    EXIT_ROWS.has(row) && col === "A" && "outline outline-sky-300",
                  )}
                >
                  {pax?.checkedIn ? (
                    <span className="rounded bg-amber-200 px-1 text-[8px] font-semibold text-amber-900">
                      CK
                    </span>
                  ) : null}
                  {pax?.vip ? (
                    <span className="rounded bg-slate-800 px-1 text-[8px] text-white">VIP</span>
                  ) : null}
                  {pax?.meal ? (
                    <span className="text-[8px] text-emerald-700">{pax.meal}</span>
                  ) : !pax ? (
                    <span className="text-slate-300">{col}</span>
                  ) : null}
                </button>
              );
            })}
            <span className="w-6 text-[11px] text-slate-400">{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
