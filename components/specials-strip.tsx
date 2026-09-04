"use client";

import { cn } from "@/lib/utils";
import {
  specialsStrip,
  specialRingClass,
  type SpecialChip,
} from "@/lib/passenger-specials";
import type { Passenger } from "@/lib/types";

export function SpecialsStrip({
  passengers,
  activeCode,
  onSelect,
}: {
  passengers: Passenger[];
  activeCode?: string | null;
  onSelect: (chip: SpecialChip | null) => void;
}) {
  const chips = specialsStrip(passengers);
  if (!chips.length) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
        Specials
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => {
          const active = activeCode === chip.code;
          return (
            <button
              key={chip.code}
              type="button"
              onClick={() => onSelect(active ? null : chip)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-full px-3 text-left ring-1 transition-transform active:scale-[0.96]",
                active ? specialRingClass(chip.kind) : "bg-white ring-black/5",
              )}
            >
              <span className="text-xs font-semibold tabular-nums">{chip.label}</span>
              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold tabular-nums text-slate-600">
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
