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
  LCA: { city: "Larnaca", name: "Larnaca International" },
  BEG: { city: "Belgrade", name: "Nikola Tesla" },
  EFL: { city: "Kefalonia", name: "Cephalonia" },
  BIO: { city: "Bilbao", name: "Bilbao" },
  CGN: { city: "Cologne", name: "Cologne Bonn" },
  BGO: { city: "Bergen", name: "Flesland" },
  TGD: { city: "Podgorica", name: "Podgorica" },
  TIV: { city: "Tivat", name: "Tivat" },
  INI: { city: "Nis", name: "Constantine the Great" },
  SKP: { city: "Skopje", name: "Skopje" },
  SJJ: { city: "Sarajevo", name: "Sarajevo" },
  ZAG: { city: "Zagreb", name: "Franjo Tuđman" },
  SOF: { city: "Sofia", name: "Sofia" },
  OTP: { city: "Bucharest", name: "Otopeni" },
  PRN: { city: "Pristina", name: "Pristina" },
  MAD: { city: "Madrid", name: "Barajas" },
  LIS: { city: "Lisbon", name: "Humberto Delgado" },
};

const AIRPORT_TZ: Record<string, string> = {
  RIX: "Europe/Riga",
  TLL: "Europe/Tallinn",
  VNO: "Europe/Vilnius",
  HEL: "Europe/Helsinki",
  TMP: "Europe/Helsinki",
  TKU: "Europe/Helsinki",
  OUL: "Europe/Helsinki",
  CPH: "Europe/Copenhagen",
  ARN: "Europe/Stockholm",
  GOT: "Europe/Stockholm",
  OSL: "Europe/Oslo",
  BGO: "Europe/Oslo",
  TRD: "Europe/Oslo",
  AMS: "Europe/Amsterdam",
  BRU: "Europe/Brussels",
  BER: "Europe/Berlin",
  MUC: "Europe/Berlin",
  FRA: "Europe/Berlin",
  DUS: "Europe/Berlin",
  HAM: "Europe/Berlin",
  WAW: "Europe/Warsaw",
  PRG: "Europe/Prague",
  BUD: "Europe/Budapest",
  VIE: "Europe/Vienna",
  ZRH: "Europe/Zurich",
  GVA: "Europe/Zurich",
  CDG: "Europe/Paris",
  NCE: "Europe/Paris",
  LGW: "Europe/London",
  LHR: "Europe/London",
  STN: "Europe/London",
  MAN: "Europe/London",
  EDI: "Europe/London",
  BHX: "Europe/London",
  NCL: "Europe/London",
  DUB: "Europe/Dublin",
  LIS: "Europe/Lisbon",
  MAD: "Europe/Madrid",
  BCN: "Europe/Madrid",
  PMI: "Europe/Madrid",
  AGP: "Europe/Madrid",
  ALC: "Europe/Madrid",
  MXP: "Europe/Rome",
  FCO: "Europe/Rome",
  ATH: "Europe/Athens",
  SKG: "Europe/Athens",
  IST: "Europe/Istanbul",
  AYT: "Europe/Istanbul",
  BEG: "Europe/Belgrade",
  INI: "Europe/Belgrade",
  PRN: "Europe/Belgrade",
  TGD: "Europe/Podgorica",
  EFL: "Europe/Athens",
  BIO: "Europe/Madrid",
  CGN: "Europe/Berlin",
  TIV: "Europe/Podgorica",
  SKP: "Europe/Skopje",
  SJJ: "Europe/Sarajevo",
  ZAG: "Europe/Zagreb",
  SOF: "Europe/Sofia",
  OTP: "Europe/Bucharest",
  LCA: "Asia/Nicosia",
  TLV: "Asia/Jerusalem",
  DXB: "Asia/Dubai",
  TFS: "Atlantic/Canary",
  KEF: "Atlantic/Reykjavik",
};

export function airportTz(iata?: string) {
  if (!iata) return undefined;
  return AIRPORT_TZ[iata.toUpperCase()];
}

export function airportCity(iata?: string) {
  if (!iata) return "";
  return AIRPORTS[iata.toUpperCase()]?.city ?? iata.toUpperCase();
}

export function airportLabel(iata?: string) {
  if (!iata) return "";
  const hit = AIRPORTS[iata.toUpperCase()];
  return hit ? `${hit.city}` : iata.toUpperCase();
}

export function flightRouteLabel(duty: {
  depIata?: string;
  arrIata?: string;
  flightNumber?: string;
}) {
  if (duty.depIata && duty.arrIata) return `${duty.depIata} → ${duty.arrIata}`;
  if (duty.depIata) return duty.depIata;
  if (duty.arrIata) return duty.arrIata;
  return duty.flightNumber ?? "Route TBA";
}

export const AIRPORT_NOTES: Record<string, string> = {
  CPH: "Check in at the crew center, Level 1, Terminal 3. Allow extra time at security.",
  RIX: "Crew briefing airside. Allow extra time at security.",
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
