import { readFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";

const MAX_BYTES = 1_500_000;

function isLoopback(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1";
}

async function icsResponse(text: string) {
  if (!/BEGIN:VCALENDAR/i.test(text) && !/BEGIN:VEVENT/i.test(text)) {
    return Response.json({ error: "Response is not an iCalendar file" }, { status: 422 });
  }
  return new Response(text, {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
}

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

  if (isLoopback(parsed.hostname) && parsed.pathname.startsWith("/samples/")) {
    try {
      const rel = parsed.pathname.replace(/^\/+/, "");
      const file = path.join(process.cwd(), "public", rel);
      const text = await readFile(file, "utf8");
      return icsResponse(text);
    } catch {
      return Response.json({ error: "Sample calendar not found" }, { status: 404 });
    }
  }

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
    return icsResponse(text);
  } catch {
    return Response.json(
      { error: "Could not reach the calendar URL" },
      { status: 504 },
    );
  }
}
