export type DutyType =
  | "flight"
  | "off"
  | "standby"
  | "reserve"
  | "hotel"
  | "sim"
  | "ground"
  | "checkin"
  | "travel"
  | "other";

export type DutySource = "demo" | "ical" | "pdf" | "manual";

export interface Duty {
  id: string;
  uid: string;
  date: string;
  type: DutyType;
  title: string;
  flightNumber?: string;
  depIata?: string;
  arrIata?: string;
  std?: string;
  sta?: string;
  checkIn?: string;
  notes?: string;
  /** Device-only crew notes; preserved across roster re-imports. */
  privateNotes?: string;
  hotelName?: string;
  position?: string;
  aircraftType?: string;
  source: DutySource;
}

export interface Passenger {
  id: string;
  flightDutyId: string;
  seat?: string;
  lastName: string;
  firstName: string;
  title?: string;
  loyaltyLevel?: string;
  loyaltyNumber?: string;
  languages?: string[];
  ssrs: string[];
  meal?: string;
  checkedIn?: boolean;
  vip?: boolean;
  ticketNumber?: string;
  inwardConnection?: string;
  onwardConnection?: string;
  notes?: string;
}

export interface CrewProfile {
  id: "me";
  name: string;
  position: string;
  icalUrl?: string;
  lastSyncedAt?: number;
  /** Auto-pull roster iCal while the app is open (default true when URL set). */
  autoRefreshIcal?: boolean;
  /** Local check-in / boarding / delay notifications. */
  notificationsEnabled?: boolean;
}

export interface LiveFlight {
  flightIata: string;
  callsign?: string;
  status?: string;
  registration?: string;
  aircraftType?: string;
  etd?: string | null;
  eta?: string | null;
  std?: string | null;
  sta?: string | null;
  depGate?: string | null;
  arrGate?: string | null;
  terminal?: string | null;
  delayMin?: number | null;
  lat?: number | null;
  lng?: number | null;
  alt?: number | null;
  heading?: number | null;
  hex?: string;
  sources: string[];
  updatedAt: number;
  unavailable?: boolean;
  message?: string;
}

export type ImportPreview = {
  duties: Duty[];
  unmatched: string[];
};
