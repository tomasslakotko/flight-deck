"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ClipboardPaste, List, Map } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PassengerSheet } from "@/components/passenger-sheet";
import { PastePassengers } from "@/components/paste-passengers";
import { SeatMap } from "@/components/seat-map";
import { useRoster } from "@/components/roster-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Passenger } from "@/lib/types";

export function PassengersScreen() {
  const params = useParams<{ id: string }>();
  const { duties, passengers, replacePassengers } = useRoster();
  const duty = duties.find((d) => d.id === params.id);
  const rows = passengers.filter((p) => p.flightDutyId === params.id);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  const checked = rows.filter((p) => p.checkedIn).length;
  const booked = rows.length;

  const selectedOrEmpty = useMemo(() => selected, [selected]);

  if (!duty) {
    return (
      <AppShell>
        <div className="pt-8 text-sm text-muted-foreground">Flight not found.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link href={`/flight/${duty.id}`} aria-label="Back">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">{duty.flightNumber}</div>
            <h1 className="text-xl font-semibold">Passengers</h1>
          </div>
          <div className="flex rounded-full bg-white p-1 ring-1 ring-black/5">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`flex h-10 items-center gap-1 rounded-full px-3 text-xs font-medium ${view === "list" ? "bg-primary text-primary-foreground" : "text-slate-500"}`}
            >
              <List className="size-4" /> List
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              className={`flex h-10 items-center gap-1 rounded-full px-3 text-xs font-medium ${view === "map" ? "bg-primary text-primary-foreground" : "text-slate-500"}`}
            >
              <Map className="size-4" /> Seat map
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="text-xs text-muted-foreground">On list</div>
            <div className="text-2xl font-semibold">{booked}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="text-xs text-muted-foreground">Checked in</div>
            <div className="text-2xl font-semibold">
              {checked} / {booked || "—"}
            </div>
          </div>
        </div>

        <Button className="h-12 rounded-full" variant="outline" onClick={() => setPasteOpen(true)}>
          <ClipboardPaste />
          Paste passenger list
        </Button>

        {view === "list" ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
            {rows.length ? (
              rows
                .slice()
                .sort((a, b) => (a.seat ?? "zzz").localeCompare(b.seat ?? "zzz", undefined, { numeric: true }))
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="flex size-10 items-center justify-center rounded-lg bg-sky-50 text-sm font-semibold text-sky-800">
                        {p.seat ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {p.lastName}/{p.firstName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {p.loyaltyLevel ?? "—"}
                        </span>
                      </span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {p.checkedIn ? <Badge variant="secondary">CKIN</Badge> : null}
                        {p.ssrs.slice(0, 2).map((s) => (
                          <Badge key={s} variant="outline">
                            {s}
                          </Badge>
                        ))}
                      </span>
                    </button>
                  </li>
                ))
            ) : (
              <li className="p-6 text-sm text-muted-foreground">
                No passengers yet. Paste a list from your briefing pack.
              </li>
            )}
          </ul>
        ) : (
          <SeatMap
            passengers={rows}
            onSelect={(item) => {
              if ("lastName" in item) setSelected(item);
            }}
          />
        )}
      </div>

      <PassengerSheet passenger={selectedOrEmpty} onClose={() => setSelected(null)} />
      <PastePassengers
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        flightDutyId={duty.id}
        onSave={(incoming) => replacePassengers(duty.id, incoming)}
      />
    </AppShell>
  );
}
