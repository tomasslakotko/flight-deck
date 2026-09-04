"use client";

import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Passenger } from "@/lib/types";
import { passengerSpecialCodes, primarySpecialKind, specialRingClass } from "@/lib/passenger-specials";

const COLS = ["A", "C", "aisle", "D", "E", "F"] as const;
const EXIT_ROWS = new Set([1, 12, 13]);

const MEAL_LABEL: Record<string, string> = {
  VGML: "Vegetarian",
  VLML: "Vegan",
  GFML: "GF",
  CHML: "Child",
  SPML: "Special",
  PMML: "PMML",
};

const GRID =
  "grid w-full grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_0.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1.25rem] gap-x-1.5 gap-y-1.5 md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] md:gap-x-3 md:gap-y-3";

export function SeatMap({
  rows = 28,
  passengers,
  selectedSeat,
  highlightCode,
  onSelect,
}: {
  rows?: number;
  passengers: Passenger[];
  selectedSeat?: string | null;
  highlightCode?: string | null;
  onSelect: (pax: Passenger | { seat: string }) => void;
}) {
  const bySeat = new Map<string, Passenger[]>();
  for (const pax of passengers) {
    if (!pax.seat) continue;
    const key = pax.seat.toUpperCase();
    const list = bySeat.get(key) ?? [];
    list.push(pax);
    bySeat.set(key, list);
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[1.75rem] bg-white p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_0_rgba(0,0,0,0.04)] md:p-4">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className={cn(GRID, "mb-2 md:mb-3")}>
          <span />
          {COLS.map((col) =>
            col === "aisle" ? (
              <span key="h-aisle" />
            ) : (
              <span
                key={`h-${col}`}
                className="text-center text-[11px] font-medium text-slate-400 md:text-sm"
              >
                {col}
              </span>
            ),
          )}
          <span />
        </div>

        <div className="flex flex-col gap-2 md:gap-3">
          {Array.from({ length: rows }, (_, i) => i + 1).map((row) => (
            <div key={row}>
              {EXIT_ROWS.has(row) ? (
                <div className={cn(GRID, "mb-1")}>
                  <span />
                  <span className="text-center text-[10px] font-medium tracking-wide text-slate-400 uppercase md:text-xs">
                    Exit
                  </span>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span className="text-center text-[10px] font-medium tracking-wide text-slate-400 uppercase md:text-xs">
                    Exit
                  </span>
                  <span />
                </div>
              ) : null}
              <div className={GRID}>
                <span className="self-center text-right text-[11px] text-slate-400 tabular-nums md:text-sm">
                  {row}
                </span>
                {COLS.map((col) => {
                  if (col === "aisle") {
                    return <span key={`${row}-aisle`} />;
                  }
                  const seat = `${row}${col}`;
                  const occupying = bySeat.get(seat) ?? [];
                  const pax = pickSeatPax(occupying);
                  const selected = selectedSeat?.toUpperCase() === seat;
                  const highlighted = Boolean(
                    highlightCode && occupying.some((item) => passengerSpecialCodes(item).includes(highlightCode)),
                  );
                  return (
                    <SeatCell
                      key={seat}
                      seat={seat}
                      col={col}
                      pax={pax}
                      hasInfant={occupying.some((item) => isInfant(item))}
                      selected={selected}
                      highlighted={highlighted}
                      dimmed={Boolean(highlightCode) && !highlighted}
                      onSelect={onSelect}
                    />
                  );
                })}
                <span className="self-center text-[11px] text-slate-400 tabular-nums md:text-sm">
                  {row}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isInfant(pax: Passenger) {
  return pax.ssrs.includes("INF") || pax.ssrs.includes("INFT");
}

function pickSeatPax(occupying: Passenger[]) {
  return occupying.find((pax) => !isInfant(pax)) ?? occupying[0];
}

function seatPersonLabel(pax: Passenger) {
  const name = pax.lastName.trim();
  const title = pax.title?.trim().toUpperCase();
  return title ? `${name} ${title}` : name;
}

function SeatCell({
  seat,
  col,
  pax,
  hasInfant,
  selected,
  highlighted,
  dimmed,
  onSelect,
}: {
  seat: string;
  col: string;
  pax?: Passenger;
  hasInfant: boolean;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  onSelect: (pax: Passenger | { seat: string }) => void;
}) {
  const label = pax ? seatPersonLabel(pax) : null;
  const mealCode = pax?.meal || null;
  const mealTitle = mealCode ? MEAL_LABEL[mealCode] ?? mealCode : null;
  const kind = pax ? primarySpecialKind(pax) : null;
  const specialMark = pax
    ? passengerSpecialCodes(pax).find((code) => !["INF", "INFT", "CHD"].includes(code) && code !== mealCode)
    : null;

  return (
    <button
      type="button"
      aria-label={
        pax
          ? `${seat} ${seatPersonLabel(pax)}${pax.firstName ? ` ${pax.firstName}` : ""}`
          : `Seat ${seat}`
      }
      aria-pressed={selected}
      onClick={() => onSelect(pax ?? { seat })}
      className={cn(
        "flex aspect-square w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl px-0.5 py-1 ring-1 transition-[transform,opacity] active:scale-[0.96] md:gap-1 md:rounded-2xl md:px-1.5 md:py-1.5",
        pax
          ? kind
            ? specialRingClass(kind)
            : "bg-sky-50 ring-sky-200/80"
          : "bg-slate-50 ring-black/5",
        highlighted && "ring-2",
        selected && "ring-2 ring-sky-400",
        dimmed && "opacity-35",
      )}
    >
      {pax && label ? (
        <span
          title={label}
          className="line-clamp-2 max-w-full px-0.5 text-center text-[8px] font-semibold leading-[1.15] text-slate-800 uppercase [overflow-wrap:normal] md:text-[11px]"
        >
          {label}
        </span>
      ) : (
        <span className="text-sm font-medium text-slate-300 md:text-base">{col}</span>
      )}
      {hasInfant ? (
        <span className="rounded-full bg-violet-100 px-1 py-px text-[7px] font-semibold text-violet-800 md:px-1.5 md:py-0.5 md:text-[10px]">
          INF
        </span>
      ) : specialMark ? (
        <span className="rounded-full bg-white/80 px-1 py-px text-[7px] font-semibold text-slate-700 md:px-1.5 md:py-0.5 md:text-[10px]">
          {specialMark === "UMNR" ? "UM" : specialMark}
        </span>
      ) : null}
      {mealCode ? (
        <span
          title={mealTitle ?? mealCode}
          className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1 py-px text-[7px] font-semibold text-emerald-800 md:px-1.5 md:py-0.5 md:text-[10px]"
        >
          {(mealCode === "VGML" || mealCode === "VLML") && (
            <Leaf className="hidden size-2.5 md:block" />
          )}
          {mealCode}
        </span>
      ) : null}
    </button>
  );
}
