"use client";

import { useEffect, useRef } from "react";
import { useRoster } from "@/components/roster-provider";
import {
  armNoticeTimers,
  buildDutyNotices,
  delayNotice,
  showLocalNotification,
} from "@/lib/notifications";
import { pushWidgetSnapshot, startWidgetSync } from "@/lib/widget-bridge";
import { flightsOnDate, isFlightDuty } from "@/lib/shift";
import { todayKey } from "@/lib/dates";
import { toFlightIata } from "@/lib/airports";
import type { LiveFlight } from "@/lib/types";

/** Local check-in / boarding / delay notifications while the app is open. */
export function OpsRuntime() {
  const { duties, profile, liveByIata } = useRoster();
  const delayPrev = useRef<Record<string, number | null>>({});
  const dutiesRef = useRef(duties);
  dutiesRef.current = duties;

  useEffect(() => {
    if (!profile.notificationsEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const notices = buildDutyNotices(duties);
    return armNoticeTimers(notices, (n) => {
      void showLocalNotification(n);
    });
  }, [duties, profile.notificationsEnabled, profile.lastSyncedAt]);

  useEffect(() => {
    if (!profile.notificationsEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
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

  // Push roster snapshot to iOS WidgetKit (no-op in Safari / desktop)
  useEffect(() => {
    pushWidgetSnapshot(duties);
    return startWidgetSync(() => dutiesRef.current);
  }, [duties, profile.lastSyncedAt]);

  return null;
}
