import { todayKey } from "@/lib/dates";

/** How long today's live-flight session stays "fresh" without a forced refresh. */
export const SESSION_MS = 12 * 60 * 60 * 1000;

/** Re-pull roster iCal while the app is open. */
export const ICAL_REFRESH_MS = 30 * 60 * 1000;

/** Re-check live flights more often on duty days when online. */
export const LIVE_REFRESH_MS = 5 * 60 * 1000;

export type SessionStamp = {
  at: number;
  date: string;
  /** Last successful live API pull (may be older than `at` if ical-only). */
  liveAt?: number;
  /** Last successful iCal pull. */
  icalAt?: number;
  offline?: boolean;
  error?: string;
};

export function parseSession(value: unknown): SessionStamp | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as SessionStamp;
    if (typeof parsed.at === "number" && typeof parsed.date === "string") return parsed;
  } catch {
    return null;
  }
  return null;
}

export function sessionIsFresh(session: SessionStamp | null, now = Date.now()) {
  if (!session) return false;
  if (session.date !== todayKey()) return false;
  return now - session.at < SESSION_MS;
}

export function icalIsStale(session: SessionStamp | null, now = Date.now()) {
  if (!session?.icalAt) return true;
  if (session.date !== todayKey()) return true;
  return now - session.icalAt >= ICAL_REFRESH_MS;
}

export function liveIsStale(session: SessionStamp | null, now = Date.now()) {
  if (!session?.liveAt) return true;
  if (session.date !== todayKey()) return true;
  return now - session.liveAt >= LIVE_REFRESH_MS;
}

export function formatSyncedAgo(ts?: number | null, now = Date.now()) {
  if (!ts) return null;
  const mins = Math.round((now - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
