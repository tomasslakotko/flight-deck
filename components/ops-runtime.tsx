"use client";

import { useEffect, useRef, useState } from "react";
import { useRoster } from "@/components/roster-provider";
import {
  armNoticeTimers,
  buildDutyNotices,
  delayNotice,
  showLocalNotification,
  syncNativeNotifications,
} from "@/lib/notifications";
import { hasNativeBridge, pushWidgetSnapshot, startWidgetSync } from "@/lib/widget-bridge";
import { flightsOnDate, isFlightDuty } from "@/lib/shift";
import { todayKey } from "@/lib/dates";
import { toFlightIata } from "@/lib/airports";
import {
  fetchBaseDepartures,
  filterDeparturesForStandby,
  resolveSbyBase,
  todayStandby,
  type BaseDeparture,
} from "@/lib/base-departures";
import {
  applyAutoSbyChecks,
  loadSbyChecks,
  partitionSbyChecklist,
  saveSbyChecks,
} from "@/lib/sby-checklist";
import type { LiveFlight } from "@/lib/types";

/** Local check-in / boarding / delay notifications + iOS WidgetKit sync. */
export function OpsRuntime() {
  const { duties, profile, liveByIata } = useRoster();
  const delayPrev = useRef<Record<string, number | null>>({});
  const dutiesRef = useRef(duties);
  const liveRef = useRef(liveByIata);
  const positionRef = useRef(profile.position);
  const boardRef = useRef<BaseDeparture[]>([]);
  const [baseDepartures, setBaseDepartures] = useState<BaseDeparture[]>([]);
  dutiesRef.current = duties;
  liveRef.current = liveByIata;
  positionRef.current = profile.position;
  boardRef.current = baseDepartures;

  // Schedule check-in / boarding (native iOS survives background; web uses timers while open)
  useEffect(() => {
    if (!profile.notificationsEnabled) {
      syncNativeNotifications([], false);
      return;
    }
    const notices = buildDutyNotices(duties);
    if (hasNativeBridge()) {
      syncNativeNotifications(notices, true);
      return;
    }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    return armNoticeTimers(notices, (n) => {
      void showLocalNotification(n);
    });
  }, [duties, profile.notificationsEnabled, profile.lastSyncedAt]);

  // Live delay bumps (need app open / live fetch)
  useEffect(() => {
    if (!profile.notificationsEnabled) return;
    const native = hasNativeBridge();
    if (!native && (typeof Notification === "undefined" || Notification.permission !== "granted")) {
      return;
    }
    const today = flightsOnDate(duties, todayKey()).filter(isFlightDuty);
    for (const duty of today) {
      const code = toFlightIata(duty.flightNumber) ?? duty.flightNumber;
      if (!code) continue;
      const live: LiveFlight | undefined = liveByIata[code];
      const prev = delayPrev.current[code];
      const notice = delayNotice(duty, live, prev);
      delayPrev.current[code] = live?.delayMin ?? null;
      if (notice) void showLocalNotification(notice);
    }
  }, [duties, liveByIata, profile.notificationsEnabled]);

  // SBY / reserve — airBaltic board even on flying days; widgets show unchecked only
  useEffect(() => {
    const today = todayKey();
    const flying = flightsOnDate(duties, today).filter(isFlightDuty);
    const sby = todayStandby(duties, today);
    const base = resolveSbyBase(sby, flying);
    if (!sby || !base) {
      setBaseDepartures([]);
      return;
    }
    const sbyForWindow = sby.depIata === base ? sby : { ...sby, depIata: base };
    let cancelled = false;
    let intervalId: number | undefined;

    const stopPolling = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = undefined;
    };

    const load = async () => {
      const raw = await fetchBaseDepartures(base);
      if (cancelled) return;
      const rows = filterDeparturesForStandby(raw, sbyForWindow);
      const stored = await loadSbyChecks(today, base);
      const { map, changed } = applyAutoSbyChecks(rows, stored);
      if (changed) await saveSbyChecks(today, base, map);
      const { open } = partitionSbyChecklist(rows, map);
      if (!cancelled) setBaseDepartures(open);
      // No BT-operated departures from this base — stop refetching
      if (!raw.length) stopPolling();
    };
    void load();
    intervalId = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [duties]);

  // Push roster + live status to iOS WidgetKit (no-op in Safari / desktop)
  useEffect(() => {
    const opts = () => ({
      position: positionRef.current,
      liveByIata: liveRef.current,
      baseDepartures: boardRef.current,
    });
    pushWidgetSnapshot(duties, opts());
    return startWidgetSync(() => dutiesRef.current, opts);
  }, [duties, liveByIata, baseDepartures, profile.lastSyncedAt, profile.position]);

  return null;
}
