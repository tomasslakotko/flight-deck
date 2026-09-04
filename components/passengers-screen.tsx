"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ClipboardPaste, List, Map, Utensils } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PassengerSheet } from "@/components/passenger-sheet";
import { PastePassengers } from "@/components/paste-passengers";
import { SeatMap } from "@/components/seat-map";
import { SpecialsStrip } from "@/components/specials-strip";
import { useRoster } from "@/components/roster-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { passengerSpecialCodes, sortPassengersForList } from "@/lib/passenger-specials";
import type { Passenger } from "@/lib/types";

export function PassengersScreen() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { duties, passengers, replacePassengers } = useRoster();
  const duty = duties.find((d) => d.id === params.id);
  const rows = passengers.filter((p) => p.flightDutyId === params.id);
  const [view, setView] = useState<"list" | "map">(
    searchParams.get("view") === "map" ? "map" : "list",
  );
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [pasteIntent, setPasteIntent] = useState<"list" | "preorder" | null>(null);
  const [specialCode, setSpecialCode] = useState<string | null>(null);
  const checked = rows.filter((p) => p.checkedIn).length;
  const booked = rows.length;

  if (!duty) {
    return (
      <AppShell>
        <div className="pt-8 text-sm text-muted-foreground">Flight not found.</div>
      </AppShell>
    );
  }

  return (
    <AppShell wide={view === "map"}>
      <div
        className={
          view === "map"
            ? "flex h-full min-h-0 flex-1 flex-col gap-3 pt-2"
            : "flex flex-col gap-4 pt-2"
        }
      >
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link href={`/flight/${duty.id}`} aria-label="Back">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">{duty.flightNumber}</div>
            <h1 className="text-xl font-semibold">Passengers</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 rounded-full"
            onClick={() => setPasteIntent("list")}
            aria-label="Paste passenger list"
          >
            <ClipboardPaste />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 rounded-full"
            onClick={() => setPasteIntent("preorder")}
            aria-label="Paste meal preorder"
          >
            <Utensils />
          </Button>
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

        {view === "list" ? (
          <>
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

            <SpecialsStrip
              passengers={rows}
              activeCode={specialCode}
              onSelect={(chip) => {
                setSpecialCode(chip?.code ?? null);
                if (chip?.passengers[0]) setSelected(chip.passengers[0]);
              }}
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="h-12 flex-1 rounded-full" variant="outline" onClick={() => setPasteIntent("list")}>
                <ClipboardPaste />
                Paste passenger list
              </Button>
              <Button className="h-12 flex-1 rounded-full" variant="outline" onClick={() => setPasteIntent("preorder")}>
                <Utensils />
                Paste preorder
              </Button>
            </div>

            <ul className="divide-y overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
              {rows.length ? (
                sortPassengersForList(rows)
                  .filter((p) => !specialCode || passengerSpecialCodes(p).includes(specialCode))
                  .map((p) => (
                    <li key={`${p.id}-${p.seat ?? ""}-${p.lastName}`}>
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
                            {[p.title, p.loyaltyLevel].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                        <span className="flex flex-wrap justify-end gap-1">
                          {p.checkedIn ? <Badge variant="secondary">CKIN</Badge> : null}
                          {badgeCodes(p).map((s) => (
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
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <SpecialsStrip
              passengers={rows}
              activeCode={specialCode}
              onSelect={(chip) => {
                setSpecialCode(chip?.code ?? null);
                if (chip?.passengers[0]) setSelected(chip.passengers[0]);
              }}
            />
            <SeatMap
              passengers={rows}
              selectedSeat={selected?.seat}
              highlightCode={specialCode}
              onSelect={(item) => {
                if ("lastName" in item) setSelected(item);
              }}
            />
          </div>
        )}
      </div>

      <PassengerSheet passenger={selected} onClose={() => setSelected(null)} />
      <PastePassengers
        key={pasteIntent ?? "closed"}
        open={pasteIntent !== null}
        onOpenChange={(open) => {
          if (!open) setPasteIntent(null);
        }}
        flightDutyId={duty.id}
        existing={rows}
        intent={pasteIntent ?? "list"}
        onSave={(incoming) => replacePassengers(duty.id, incoming)}
      />
    </AppShell>
  );
}

const BADGE_PRIORITY = ["INF", "INFT", "CHD", "UMNR", "WCHR", "WCHS", "WCHC"];

function badgeCodes(p: Passenger): string[] {
  const codes = passengerSpecialCodes(p);
  const ordered = [
    ...BADGE_PRIORITY.filter((code) => codes.includes(code)),
    ...codes.filter((code) => !BADGE_PRIORITY.includes(code)),
  ];
  return [...new Set(ordered)].slice(0, 3);
}
