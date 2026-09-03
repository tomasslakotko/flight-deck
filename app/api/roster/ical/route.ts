import { NextRequest } from "next/server";

const MAX_BYTES = 1_500_000;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!["http:", "https:", "webcal:"].includes(parsed.protocol)) {
    return Response.json({ error: "Unsupported protocol" }, { status: 400 });
  }
  if (parsed.protocol === "webcal:") parsed.protocol = "https:";

  try {
    const res = await fetch(parsed.toString(), {
      headers: { Accept: "text/calendar, text/plain, */*" },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json(
        { error: `Calendar host returned ${res.status}` },
        { status: 502 },
      );
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return Response.json({ error: "Calendar file is too large" }, { status: 413 });
    }
    const text = new TextDecoder("utf-8").decode(buf);
    if (!/BEGIN:VCALENDAR/i.test(text) && !/BEGIN:VEVENT/i.test(text)) {
      return Response.json(
        { error: "Response is not an iCalendar file" },
        { status: 422 },
      );
    }
    return new Response(text, {
      headers: { "Content-Type": "text/calendar; charset=utf-8" },
    });
  } catch {
    return Response.json(
      { error: "Could not reach the calendar URL" },
      { status: 504 },
    );
  }
}
