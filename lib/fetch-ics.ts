function isLoopbackCalendar(url: string) {
  try {
    const parsed = new URL(url, "http://127.0.0.1");
    return parsed.pathname.startsWith("/samples/");
  } catch {
    return url.startsWith("/samples/");
  }
}

export async function downloadIcs(url: string) {
  if (url.startsWith("/samples/") || isLoopbackCalendar(url)) {
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not read the sample calendar");
    return res.text();
  }
  const res = await fetch(`/api/roster/ical?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || "Could not download calendar");
  }
  return res.text();
}
