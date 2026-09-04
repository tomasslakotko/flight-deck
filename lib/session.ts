import { todayKey } from "@/lib/dates";

export const SESSION_MS = 12 * 60 * 60 * 1000;

export type SessionStamp = {
  at: number;
  date: string;
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
