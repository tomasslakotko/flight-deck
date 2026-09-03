export const AIRPORTS: Record<string, { city: string; name: string }> = {
  RIX: { city: "Riga", name: "Riga International" },
  CPH: { city: "Copenhagen", name: "Kastrup" },
  AMS: { city: "Amsterdam", name: "Schiphol" },
  ARN: { city: "Stockholm", name: "Arlanda" },
  OSL: { city: "Oslo", name: "Gardermoen" },
  HEL: { city: "Helsinki", name: "Vantaa" },
  TLL: { city: "Tallinn", name: "Lennart Meri" },
  VNO: { city: "Vilnius", name: "Vilnius International" },
  WAW: { city: "Warsaw", name: "Chopin" },
  BER: { city: "Berlin", name: "Brandenburg" },
  MUC: { city: "Munich", name: "Franz Josef Strauss" },
  FRA: { city: "Frankfurt", name: "Main" },
  DUS: { city: "Düsseldorf", name: "Düsseldorf" },
  HAM: { city: "Hamburg", name: "Hamburg" },
  CDG: { city: "Paris", name: "Charles de Gaulle" },
  LGW: { city: "London", name: "Gatwick" },
  LHR: { city: "London", name: "Heathrow" },
  STN: { city: "London", name: "Stansted" },
  DUB: { city: "Dublin", name: "Dublin" },
  BCN: { city: "Barcelona", name: "El Prat" },
  MXP: { city: "Milan", name: "Malpensa" },
  FCO: { city: "Rome", name: "Fiumicino" },
  PMI: { city: "Palma", name: "Son Sant Joan" },
  AYT: { city: "Antalya", name: "Antalya" },
  TFS: { city: "Tenerife", name: "South" },
  DXB: { city: "Dubai", name: "International" },
  TLV: { city: "Tel Aviv", name: "Ben Gurion" },
  IST: { city: "Istanbul", name: "Istanbul" },
  VIE: { city: "Vienna", name: "Schwechat" },
  PRG: { city: "Prague", name: "Václav Havel" },
  BUD: { city: "Budapest", name: "Ferenc Liszt" },
  GVA: { city: "Geneva", name: "Cointrin" },
  ZRH: { city: "Zurich", name: "Kloten" },
  BRU: { city: "Brussels", name: "Zaventem" },
  NCE: { city: "Nice", name: "Côte d'Azur" },
  AGP: { city: "Malaga", name: "Costa del Sol" },
  ALC: { city: "Alicante", name: "Elche" },
  SKG: { city: "Thessaloniki", name: "Makedonia" },
  ATH: { city: "Athens", name: "Eleftherios Venizelos" },
  KEF: { city: "Reykjavik", name: "Keflavík" },
  TMP: { city: "Tampere", name: "Pirkkala" },
  TKU: { city: "Turku", name: "Turku" },
  OUL: { city: "Oulu", name: "Oulu" },
};

export function airportCity(iata?: string) {
  if (!iata) return "";
  return AIRPORTS[iata.toUpperCase()]?.city ?? iata.toUpperCase();
}

export function airportLabel(iata?: string) {
  if (!iata) return "";
  const hit = AIRPORTS[iata.toUpperCase()];
  return hit ? `${hit.city}` : iata.toUpperCase();
}

export const AIRPORT_NOTES: Record<string, string> = {
  CPH: "Check in at the crew center, Level 1, Terminal 3. Allow extra time at security.",
  RIX: "Crew briefing in room A, airside. Airport Wi-Fi: BT-Crew. Local SIMs at arrivals.",
  AMS: "Crew report at D-pier crew center. Schiphol staff lane is marked “CREW”.",
  ARN: "Report at Terminal 5 crew security. Hotel shuttle bay is outside arrivals 2.",
};

export function toCallsign(flightIata?: string) {
  if (!flightIata) return undefined;
  const m = flightIata.toUpperCase().match(/^(BTI?|BT)\s*-?\s*(\d{1,4})$/);
  if (!m) return flightIata.replace(/\s+/g, "");
  return `BTI${m[2]}`;
}

export function toFlightIata(raw?: string) {
  if (!raw) return undefined;
  const m = raw.toUpperCase().match(/^(BTI?|BT)\s*-?\s*(\d{1,4})$/);
  if (!m) return raw.toUpperCase().replace(/\s+/g, "");
  return `BT${m[2]}`;
}
