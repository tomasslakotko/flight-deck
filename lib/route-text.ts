const IATA_NOISE = new Set([
  "AND", "THE", "FOR", "OFF", "SBY", "POS", "STD", "STA", "UTC", "GMT", "PAD", "TTL", "PAX",
  "INF", "CHD", "VIP", "FLT", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "JAN", "FEB",
  "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "CRE", "ROW",
  "REP", "ORT", "CEN", "TER", "AIR", "POR", "WIT", "HIN", "MIN",
]);

export const ROUTE_SEP_RE = /\b([A-Z]{3})\s*(?:[-–—to/]|→|✈)+\s*([A-Z]{3})\b/g;
export const ROUTE_SPACE_RE = /\b([A-Z]{3})\s+([A-Z]{3})\b/g;

export function looksLikeIata(code?: string) {
  if (!code || !/^[A-Z]{3}$/.test(code)) return false;
  return !IATA_NOISE.has(code);
}

export function validRoute(dep?: string, arr?: string) {
  if (!dep || !arr || dep === arr) return {};
  if (!looksLikeIata(dep) || !looksLikeIata(arr)) return {};
  return { depIata: dep, arrIata: arr };
}

export function pickAirportCode(text: string) {
  const upper = text.trim().toUpperCase();
  if (looksLikeIata(upper)) return upper;
  const m = upper.match(/\b([A-Z]{3})\b/);
  return m && looksLikeIata(m[1]) ? m[1] : undefined;
}

export function pickRoute(text: string) {
  const upper = text.toUpperCase();
  const sep = new RegExp(ROUTE_SEP_RE.source);
  const m = upper.match(sep);
  if (m) return validRoute(m[1], m[2]);
  const glued = upper.match(/\b([A-Z]{3})([A-Z]{3})\b/);
  if (glued) return validRoute(glued[1], glued[2]);
  const spaced = upper.match(ROUTE_SPACE_RE);
  if (spaced) return validRoute(spaced[1], spaced[2]);
  return {};
}

export function pickAllRoutes(text: string) {
  const upper = text.toUpperCase();
  const routes: { depIata: string; arrIata: string }[] = [];
  const push = (dep?: string, arr?: string) => {
    const hit = validRoute(dep, arr);
    if (hit.depIata && hit.arrIata && !routes.some((r) => r.depIata === hit.depIata && r.arrIata === hit.arrIata)) {
      routes.push({ depIata: hit.depIata, arrIata: hit.arrIata });
    }
  };
  for (const m of upper.matchAll(ROUTE_SEP_RE)) push(m[1], m[2]);
  if (!routes.length) {
    for (const m of upper.matchAll(/\b([A-Z]{3})([A-Z]{3})\b/g)) push(m[1], m[2]);
  }
  if (!routes.length) {
    for (const m of upper.matchAll(ROUTE_SPACE_RE)) push(m[1], m[2]);
  }
  return routes;
}
