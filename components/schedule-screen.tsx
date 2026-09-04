"use client";

import { useMemo, useState } from "react";
import { addWeeks, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { WeekGrid } from "@/components/week-grid";
import { useRoster } from "@/components/roster-provider";
import { Button } from "@/components/ui/button";
import { todayKey, weekDays } from "@/lib/dates";
import { continuationsByDate, dutiesByScheduleDate } from "@/lib/shift";

export function ScheduleScreen() {
  const { duties } = useRoster();
  const [offset, setOffset] = useState(0);
  const today = todayKey();
  const anchor = addWeeks(new Date(), offset);
  const days = weekDays(anchor);
  const byDate = useMemo(() => dutiesByScheduleDate(duties), [duties]);
  const continuations = useMemo(() => continuationsByDate(duties), [duties]);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
            <p className="text-sm text-muted-foreground">{format(anchor, "MMMM yyyy")}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-11" onClick={() => setOffset((v) => v - 1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setOffset(0)}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="size-11" onClick={() => setOffset((v) => v + 1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
        <WeekGrid days={days} dutiesByDate={byDate} continuationsByDate={continuations} today={today} />
      </div>
    </AppShell>
  );
}
