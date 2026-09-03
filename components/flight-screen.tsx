"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { useRoster } from "@/components/roster-provider";
import { Button } from "@/components/ui/button";
import { airportCity } from "@/lib/airports";
import { durationLabel, formatClock, formatLongDate } from "@/lib/dates";
import { useLiveFlight } from "@/hooks/use-live-flight";
import { phaseForFlight, phaseSchedule } from "@/lib/shift";
import { cn } from "@/lib/utils";

export function FlightScreen() {
  const params = useParams<{ id: string }>();
  const { duties } = useRoster();
  const duty = duties.find((d) => d.id === params.id);
  const { data: live, loading } = useLiveFlight(duty?.flightNumber);
  const phase = duty ? phaseForFlight(duty) : "pre";
  const phases = duty ? phaseSchedule(duty) : [];

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
            <Link href="/" aria-label="Back">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">{duty.flightNumber}</div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {duty.depIata} → {duty.arrIata}
            </h1>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{formatLongDate(duty.date)}</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard label="Flight" value={duty.flightNumber ?? "—"} hint={durationLabel(duty.std, duty.sta)} />
          <InfoCard
            label="STD / ETD"
            value={formatClock(live?.etd || duty.std)}
            hint={live?.etd ? `Roster ${formatClock(duty.std)}` : airportCity(duty.depIata)}
          />
          <InfoCard
            label="STA / ETA"
            value={formatClock(live?.eta || duty.sta)}
            hint={airportCity(duty.arrIata)}
          />
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-2">
              {loading ? (
                <span className="text-sm text-muted-foreground">Looking up…</span>
              ) : (
                <StatusBadge status={live?.status} delayMin={live?.delayMin} />
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {live?.unavailable
                ? live.message
                : live?.sources.length
                  ? live.sources.join(" · ")
                  : "Using roster times"}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <InfoCard label="Aircraft" value={live?.registration ?? "—"} hint={live?.aircraftType ?? duty.aircraftType ?? "A220-300"} />
          <InfoCard
            label="Gate"
            value={live?.depGate ?? "—"}
            hint={live?.terminal ? `Terminal ${live.terminal}` : "Live when published"}
          />
          <InfoCard label="Your position" value={duty.position ?? "—"} hint="Cabin" />
        </div>

        {phases.length ? (
          <ol className="flex gap-2 overflow-x-auto">
            {phases.map((p) => (
              <li
                key={p.key}
                className={cn(
                  "min-w-[5.5rem] rounded-2xl bg-white px-3 py-2 text-center ring-1 ring-black/5",
                  p.key === phase && "bg-sky-50 ring-primary/30",
                )}
              >
                <div className="text-[11px] text-slate-500">{p.label}</div>
                <div className="text-sm font-semibold">{p.time}</div>
              </li>
            ))}
          </ol>
        ) : null}

        {duty.notes ? (
          <article className="rounded-2xl bg-white p-4 text-sm ring-1 ring-black/5">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Cabin notes
            </div>
            {duty.notes}
          </article>
        ) : null}

        <Button asChild className="h-12 rounded-full">
          <Link href={`/flight/${duty.id}/passengers`}>
            <Users />
            Passenger list & seat map
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

function InfoCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
