"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, StickyNote, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { useRoster } from "@/components/roster-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { airportCity, airportTz, flightRouteLabel } from "@/lib/airports";
import { clocksDiffer, durationLabel, formatClock, formatLongDate } from "@/lib/dates";
import { useLiveFlight } from "@/hooks/use-live-flight";
import { parseDutyCrew, withYouHighlight } from "@/lib/parse-crew";
import { phaseForFlight, phaseSchedule, resolvedFlightStatus } from "@/lib/shift";
import { cn } from "@/lib/utils";

export function FlightScreen() {
  const params = useParams<{ id: string }>();
  const { duties, profile, upsertDuty } = useRoster();
  const duty = duties.find((d) => d.id === params.id);
  const { data: live, loading } = useLiveFlight(duty?.flightNumber);
  const phase = duty ? phaseForFlight(duty) : "pre";
  const phases = duty ? phaseSchedule(duty) : [];
  const depTz = airportTz(duty?.depIata);
  const arrTz = airportTz(duty?.arrIata);
  const [privateNotes, setPrivateNotes] = useState(duty?.privateNotes ?? "");
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    setPrivateNotes(duty?.privateNotes ?? "");
  }, [duty?.id, duty?.privateNotes]);

  useEffect(() => {
    if (!duty) return;
    const next = privateNotes.trim();
    const prev = (duty.privateNotes ?? "").trim();
    if (next === prev) return;
    const id = window.setTimeout(() => {
      void upsertDuty({
        ...duty,
        privateNotes: next || undefined,
      }).then(() => {
        setNoteSaved(true);
        window.setTimeout(() => setNoteSaved(false), 1500);
      });
    }, 500);
    return () => window.clearTimeout(id);
  }, [privateNotes, duty, upsertDuty]);

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
              {flightRouteLabel(duty)}
            </h1>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{formatLongDate(duty.date)}</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard label="Flight" value={duty.flightNumber ?? "—"} hint={durationLabel(duty.std, duty.sta)} />
          <InfoCard
            label="STD / ETD"
            value={formatClock(live?.etd || duty.std, depTz)}
            hint={
              clocksDiffer(live?.etd, duty.std, depTz)
                ? `Roster ${formatClock(duty.std, depTz)}`
                : airportCity(duty.depIata)
            }
          />
          <InfoCard
            label="STA / ETA"
            value={formatClock(live?.eta || duty.sta, arrTz)}
            hint={airportCity(duty.arrIata)}
          />
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-2">
              {loading ? (
                <span className="text-sm text-muted-foreground">Looking up…</span>
              ) : (
                <StatusBadge status={resolvedFlightStatus(duty, live)} delayMin={live?.delayMin} />
              )}
            </div>
            {live?.unavailable ? (
              <div className="mt-2 text-xs text-muted-foreground">{live.message}</div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <InfoCard
            label="Aircraft"
            value={live?.registration ?? "—"}
            hint={live?.aircraftType ?? duty.aircraftType ?? "—"}
          />
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

        <CrewAndNotes
          notes={duty.notes}
          title={duty.title}
          position={duty.position ?? profile.position}
          name={profile.name}
        />

        <article className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <StickyNote className="size-3.5" />
              Private notes
            </div>
            <span className="text-[11px] text-muted-foreground">
              {noteSaved ? "Saved" : "Only on this device"}
            </span>
          </div>
          <Textarea
            value={privateNotes}
            onChange={(e) => setPrivateNotes(e.target.value)}
            placeholder="Galley, VIP, deadhead, personal reminders…"
            className="min-h-24 resize-y"
          />
        </article>

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

function CrewAndNotes({
  notes,
  title,
  name,
  position,
}: {
  notes?: string;
  title?: string;
  name?: string;
  position?: string;
}) {
  const parsed = parseDutyCrew({ notes, title });
  const crew = withYouHighlight(parsed.crew, { name, position });
  const leftover = parsed.leftover;

  if (!crew.length && !leftover) return null;

  return (
    <>
      {crew.length ? (
        <article className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Crew
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {crew.map((member, index) => (
              <li
                key={`${member.role}-${member.code}-${index}`}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl px-3 py-2 ring-1 ring-black/5",
                  member.you ? "bg-emerald-50 ring-emerald-200/80" : "bg-slate-50/80",
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-wide tabular-nums">{member.code}</div>
                  <div className="text-xs text-muted-foreground">{member.label}</div>
                </div>
                {member.you ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    You
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      ) : null}
      {leftover ? (
        <article className="rounded-2xl bg-white p-4 text-sm ring-1 ring-black/5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Roster notes
          </div>
          <p className="whitespace-pre-line text-pretty">{leftover}</p>
        </article>
      ) : null}
    </>
  );
}
