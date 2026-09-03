"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useRoster } from "@/components/roster-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { extractPdfText } from "@/lib/parse-pdf";
import { todayKey } from "@/lib/dates";
import type { Duty, DutyType } from "@/lib/types";

export function ImportScreen() {
  const { importDuties, upsertDuty, updateProfile, profile, resetDemo, markSynced } = useRoster();
  const [url, setUrl] = useState(profile.icalUrl ?? "");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  async function applyDuties(duties: Duty[], leftover: string[]) {
    if (!duties.length) {
      toast.error("No duties found in that file.");
      setUnmatched(leftover);
      return;
    }
    await importDuties(duties, replace ? "replace" : "merge");
    await markSynced();
    setUnmatched(leftover);
    toast.success(`Imported ${duties.length} duties`);
  }

  async function fetchIcal() {
    if (!url.trim()) {
      toast.error("Paste an iCal / webcal link first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/roster/ical?url=${encodeURIComponent(url.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not download calendar");
      }
      const text = await res.text();
      const { parseIcs } = await import("@/lib/parse-roster");
      const parsed = parseIcs(text, "ical");
      await updateProfile({ icalUrl: url.trim() });
      await applyDuties(parsed.duties, parsed.unmatched);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        const text = await extractPdfText(file);
        const { parseRosterText } = await import("@/lib/parse-roster");
        const parsed = parseRosterText(text, "pdf");
        await applyDuties(parsed.duties, parsed.unmatched);
      } else {
        const text = await file.text();
        const { parseIcs } = await import("@/lib/parse-roster");
        const parsed = parseIcs(text, "ical");
        await applyDuties(parsed.duties, parsed.unmatched);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import roster</h1>
          <p className="text-sm text-muted-foreground">
            iCal link, PDF, or a single duty. Parsing stays on this device except the calendar URL fetch.
          </p>
        </div>

        <label className="flex h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
            className="size-4"
          />
          Replace existing roster instead of merging
        </label>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-semibold">iCal link</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the CrewLink / webcal URL airBaltic publishes. We never store your airline password.
          </p>
          <Input
            className="mt-3 h-11"
            placeholder="https://… or webcal://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button className="mt-3 h-11 w-full rounded-full" disabled={busy} onClick={() => void fetchIcal()}>
            {busy ? "Importing…" : "Subscribe & import"}
          </Button>
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-semibold">PDF or .ics file</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop a roster PDF or an exported calendar file. PDFs are read in the browser.
          </p>
          <Input
            className="mt-3 h-11"
            type="file"
            accept=".ics,.ical,.ifb,text/calendar,application/pdf,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </section>

        <ManualForm
          onSave={async (duty) => {
            await upsertDuty(duty);
            toast.success("Duty saved");
          }}
        />

        {unmatched.length ? (
          <section className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
            <h2 className="font-semibold">Unmatched lines</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {unmatched.slice(0, 12).map((line) => (
                <li key={line} className="font-mono text-xs">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Button variant="outline" className="h-11 rounded-full" onClick={() => void resetDemo()}>
          Restore demo week
        </Button>
      </div>
    </AppShell>
  );
}

function ManualForm({ onSave }: { onSave: (duty: Duty) => Promise<void> }) {
  const [type, setType] = useState<DutyType>("flight");
  const [date, setDate] = useState(todayKey());
  const [flight, setFlight] = useState("BT");
  const [dep, setDep] = useState("RIX");
  const [arr, setArr] = useState("CPH");
  const [std, setStd] = useState("11:15");
  const [sta, setSta] = useState("12:45");
  const [notes, setNotes] = useState("");

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <h2 className="font-semibold">Manual entry</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as DutyType)}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["flight","off","standby","reserve","hotel","sim","ground","travel","other"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input className="h-11" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {type === "flight" ? (
          <>
            <div className="space-y-1.5">
              <Label>Flight</Label>
              <Input className="h-11" value={flight} onChange={(e) => setFlight(e.target.value.toUpperCase())} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input className="h-11" value={dep} onChange={(e) => setDep(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input className="h-11" value={arr} onChange={(e) => setArr(e.target.value.toUpperCase())} />
              </div>
            </div>
          </>
        ) : null}
        <div className="space-y-1.5">
          <Label>Start</Label>
          <Input className="h-11" type="time" value={std} onChange={(e) => setStd(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>End</Label>
          <Input className="h-11" type="time" value={sta} onChange={(e) => setSta(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <Button
        className="mt-4 h-11 w-full rounded-full"
        onClick={() => {
          const start = new Date(`${date}T${std}:00`);
          const end = new Date(`${date}T${sta}:00`);
          const title =
            type === "flight" ? `${flight} ${dep}–${arr}` : type === "off" ? "Day off" : type;
          const id = `manual-${date}-${title}-${std}`;
          void onSave({
            id,
            uid: id,
            date,
            type,
            title,
            flightNumber: type === "flight" ? flight.replace(/\s+/g, "") : undefined,
            depIata: type === "flight" ? dep : undefined,
            arrIata: type === "flight" ? arr : undefined,
            std: start.toISOString(),
            sta: end.toISOString(),
            notes: notes || undefined,
            source: "manual",
          });
        }}
      >
        Save duty
      </Button>
    </section>
  );
}
