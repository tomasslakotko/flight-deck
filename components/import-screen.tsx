"use client";

import { useEffect, useState } from "react";
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
import { downloadIcs } from "@/lib/fetch-ics";
import { todayKey } from "@/lib/dates";
import type { Duty, DutyType } from "@/lib/types";

export function ImportScreen() {
  const { importDuties, upsertDuty, updateProfile, profile, resetDemo, clearPastDuties, clearRoster, markSynced, refreshSession, duties } = useRoster();
  const [url, setUrl] = useState(profile.icalUrl ?? "");
  const [replace, setReplace] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    if (profile.icalUrl) setUrl(profile.icalUrl);
  }, [profile.icalUrl]);
  const [busy, setBusy] = useState(false);
  const [fileStatus, setFileStatus] = useState<{
    kind: "idle" | "reading" | "ok" | "error";
    message: string;
  }>({ kind: "idle", message: "" });
  const [unmatched, setUnmatched] = useState<string[]>([]);

  async function toggleNotifications(on: boolean) {
    setNotifBusy(true);
    try {
      if (!on) {
        await updateProfile({ notificationsEnabled: false });
        toast.message("Notifications off");
        return;
      }
      const { requestNotificationPermission, notificationSupported } = await import(
        "@/lib/notifications"
      );
      if (!notificationSupported()) {
        toast.error("Notifications are not supported in this browser");
        return;
      }
      const perm = await requestNotificationPermission();
      if (perm !== "granted") {
        await updateProfile({ notificationsEnabled: false });
        toast.error("Notification permission denied");
        return;
      }
      await updateProfile({ notificationsEnabled: true });
      toast.success("Alerts on for check-in, boarding, and delays");
    } finally {
      setNotifBusy(false);
    }
  }

  async function applyDuties(duties: Duty[], leftover: string[], mode?: "merge" | "replace") {
    if (!duties.length) {
      const msg =
        leftover.length > 0
          ? `File read, but no duties recognised (${leftover.length} unmatched lines). Prefer an iCal export.`
          : "File read, but no duties found. Prefer an iCal / .ics roster export.";
      toast.error(msg);
      setUnmatched(leftover);
      setFileStatus({ kind: "error", message: msg });
      return false;
    }
    await importDuties(duties, mode ?? (replace ? "replace" : "merge"));
    await markSynced();
    setUnmatched(leftover);
    const msg = `Imported ${duties.length} duties${leftover.length ? ` · ${leftover.length} unmatched lines` : ""}`;
    toast.success(msg);
    setFileStatus({ kind: "ok", message: msg });
    void refreshSession(true, true);
    return true;
  }

  async function fetchIcal() {
    if (!url.trim()) {
      toast.error("Paste an iCal / webcal link first.");
      return;
    }
    setBusy(true);
    try {
      const text = await downloadIcs(url.trim());
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

  async function onFile(file: File, input?: HTMLInputElement | null) {
    setBusy(true);
    setFileStatus({ kind: "reading", message: `Reading ${file.name}…` });
    toast.message(`Reading ${file.name}…`);
    try {
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        const text = await extractPdfText(file);
        const { parseRosterText } = await import("@/lib/parse-roster");
        const parsed = parseRosterText(text, "pdf");
        const leftover =
          parsed.duties.length === 0 && parsed.unmatched.length === 0 && text.length > 0
            ? text.split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 20)
            : parsed.unmatched;
        // NetLine PDF clocks are UTC; parser stores instants and UI shows airport-local.
        await applyDuties(parsed.duties, leftover, "replace");
      } else {
        const text = await file.text();
        const { parseIcs } = await import("@/lib/parse-roster");
        const parsed = parseIcs(text, "ical");
        await applyDuties(parsed.duties, parsed.unmatched);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read file";
      const friendly =
        message.includes("readableStream") || message.includes("undefined is not a function")
          ? "PDF reader failed in this browser. Try again, or import an .ics instead."
          : message;
      toast.error(friendly);
      setFileStatus({ kind: "error", message: friendly });
    } finally {
      setBusy(false);
      if (input) input.value = "";
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
            Paste your roster iCal / webcal URL. We never store your airline password.
            With a link saved, the roster auto-refreshes about every 30 minutes while the app is open.
          </p>
          <Input
            className="mt-3 h-11"
            placeholder="https://… or webcal://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <label className="mt-3 flex h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={profile.autoRefreshIcal !== false}
              onChange={(e) => void updateProfile({ autoRefreshIcal: e.target.checked })}
            />
            Auto-refresh iCal in the background
          </label>
          <Button className="mt-3 h-11 w-full rounded-full" disabled={busy} onClick={() => void fetchIcal()}>
            {busy ? "Importing…" : "Subscribe & import"}
          </Button>
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-semibold">Local notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check-in (−15 min / at report), boarding (−30 min STD), and delay alerts while this device is
            awake. Works best as an installed PWA.
          </p>
          <Button
            className="mt-3 h-11 w-full rounded-full"
            variant={profile.notificationsEnabled ? "outline" : "default"}
            disabled={notifBusy}
            onClick={() => void toggleNotifications(!profile.notificationsEnabled)}
          >
            {notifBusy
              ? "Updating…"
              : profile.notificationsEnabled
                ? "Turn notifications off"
                : "Enable notifications"}
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
            disabled={busy}
            accept=".ics,.ical,.ifb,text/calendar,application/pdf,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file, e.target);
            }}
          />
          {fileStatus.kind !== "idle" ? (
            <p
              className={
                fileStatus.kind === "ok"
                  ? "mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                  : fileStatus.kind === "error"
                    ? "mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900"
                    : "mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-950"
              }
              role="status"
            >
              {fileStatus.kind === "reading" ? "Reading file…" : null} {fileStatus.message}
            </p>
          ) : null}
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

        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-semibold">Manage roster</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {duties.length} duties stored on this device. Profile and iCal link are kept.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-full"
              disabled={busy || !duties.some((d) => d.date < todayKey())}
              onClick={() => {
                void (async () => {
                  const n = await clearPastDuties();
                  toast.success(n ? `Deleted ${n} past duties` : "No past duties to delete");
                })();
              }}
            >
              Delete past duties
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-full text-red-700 hover:bg-red-50 hover:text-red-800"
              disabled={busy || !duties.length}
              onClick={() => {
                if (!window.confirm("Clear the entire roster on this device? Passengers and live cache go too.")) {
                  return;
                }
                void (async () => {
                  await clearRoster();
                  toast.success("Roster cleared");
                })();
              }}
            >
              Clear entire roster
            </Button>
          </div>
        </section>

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
