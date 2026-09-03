import type { CrewProfile, Duty, Passenger } from "@/lib/types";
import { addDays, getISODay } from "date-fns";
import { atLocal, dateKey, mondayOf, todayKey } from "@/lib/dates";

function duty(
  partial: Omit<Duty, "source" | "id" | "uid"> & { id?: string },
): Duty {
  const id = partial.id ?? `demo-${partial.date}-${partial.title}`;
  return { ...partial, id, uid: id, source: "demo" };
}

export function buildDemoProfile(): CrewProfile {
  return {
    id: "me",
    name: "Andrea",
    position: "L1",
    checkedInDates: [],
  };
}

export function buildDemoDuties(now = new Date()): Duty[] {
  const monday = mondayOf(now);
  const today = todayKey(now);
  const out: Duty[] = [];

  const day = (offset: number) => addDays(monday, offset);

  const pairing = (
    date: Date,
    a: { fn: string; dep: string; arr: string; std: [number, number]; sta: [number, number] },
    b: { fn: string; dep: string; arr: string; std: [number, number]; sta: [number, number] },
  ): Duty[] => {
    const key = dateKey(date);
    const report = new Date(date);
    report.setHours(a.std[0], a.std[1] - 30, 0, 0);
    const checkIn = report.toISOString();
    return [
      duty({
        id: `demo-${key}-ci`,
        date: key,
        type: "checkin",
        title: "Check-in",
        std: checkIn,
        sta: atLocal(date, a.std[0], a.std[1]),
        position: "L1",
      }),
      duty({
        id: `demo-${key}-${a.fn}`,
        date: key,
        type: "flight",
        title: `${a.fn} ${a.dep}–${a.arr}`,
        flightNumber: a.fn,
        depIata: a.dep,
        arrIata: a.arr,
        std: atLocal(date, a.std[0], a.std[1]),
        sta: atLocal(date, a.sta[0], a.sta[1]),
        checkIn,
        aircraftType: "A220-300",
        position: "L1",
        notes: "Cabin briefing at report. Expected short turn.",
      }),
      duty({
        id: `demo-${key}-${b.fn}`,
        date: key,
        type: "flight",
        title: `${b.fn} ${b.dep}–${b.arr}`,
        flightNumber: b.fn,
        depIata: b.dep,
        arrIata: b.arr,
        std: atLocal(date, b.std[0], b.std[1]),
        sta: atLocal(date, b.sta[0], b.sta[1]),
        aircraftType: "A220-300",
        position: "L1",
      }),
    ];
  };

  const template: Array<Duty[] | "skip"> = [
    pairing(day(0), {
      fn: "BT221",
      dep: "RIX",
      arr: "ARN",
      std: [6, 10],
      sta: [7, 5],
    }, {
      fn: "BT222",
      dep: "ARN",
      arr: "RIX",
      std: [7, 50],
      sta: [8, 45],
    }),
    [
      duty({
        date: dateKey(day(1)),
        type: "off",
        title: "Day off",
        std: atLocal(day(1), 0, 0),
        sta: atLocal(day(1), 23, 59),
      }),
    ],
    pairing(day(2), {
      fn: "BT621",
      dep: "RIX",
      arr: "AMS",
      std: [9, 15],
      sta: [10, 55],
    }, {
      fn: "BT622",
      dep: "AMS",
      arr: "RIX",
      std: [11, 40],
      sta: [13, 20],
    }),
    [
      duty({
        date: dateKey(day(3)),
        type: "off",
        title: "Day off",
        std: atLocal(day(3), 0, 0),
        sta: atLocal(day(3), 23, 59),
      }),
    ],
    [
      duty({
        date: dateKey(day(4)),
        type: "standby",
        title: "Airport standby",
        std: atLocal(day(4), 8, 0),
        sta: atLocal(day(4), 20, 0),
        notes: "Report RIX crew center within 45 minutes.",
        position: "L1",
      }),
    ],
    [
      duty({
        date: dateKey(day(5)),
        type: "hotel",
        title: "Scandic Spectrum",
        hotelName: "Scandic Spectrum",
        std: atLocal(day(5), 15, 0),
        sta: atLocal(day(5), 12, 0),
        notes: "Copenhagen layover. Check-in 15:00.",
        depIata: "CPH",
      }),
    ],
    [
      duty({
        date: dateKey(day(6)),
        type: "off",
        title: "Day off",
        std: atLocal(day(6), 0, 0),
        sta: atLocal(day(6), 23, 59),
      }),
    ],
  ];

  for (const block of template) {
    if (block === "skip") continue;
    out.push(...block);
  }

  const isoDay = getISODay(now);
  const todayDate = addDays(monday, isoDay - 1);
  const filtered = out.filter((d) => d.date !== today);
  filtered.push(
    ...pairing(todayDate, {
      fn: "BT139",
      dep: "CPH",
      arr: "RIX",
      std: [11, 15],
      sta: [12, 45],
    }, {
      fn: "BT140",
      dep: "RIX",
      arr: "CPH",
      std: [14, 45],
      sta: [16, 15],
    }),
  );

  return filtered.sort((a, b) => (a.std ?? "").localeCompare(b.std ?? ""));
}

export function buildDemoPassengers(duties: Duty[]): Passenger[] {
  const first = duties.find((d) => d.flightNumber === "BT139");
  if (!first) return [];
  const id = first.id;
  const rows: Array<Omit<Passenger, "id" | "flightDutyId">> = [
    { seat: "1A", lastName: "BERZINS", firstName: "Janis", title: "MR", loyaltyLevel: "Gold", loyaltyNumber: "BT104829", languages: ["Latvian", "English"], ssrs: [], checkedIn: true, vip: true, meal: undefined },
    { seat: "1D", lastName: "NIELSEN", firstName: "Sofie", title: "MS", loyaltyLevel: "Gold", ssrs: ["VGML"], meal: "VGML", checkedIn: true, vip: true, languages: ["Danish", "English"] },
    { seat: "2C", lastName: "KALNINS", firstName: "Elza", title: "MRS", ssrs: ["WCHR"], checkedIn: true, languages: ["Latvian"] },
    { seat: "3F", lastName: "ANDERSSON", firstName: "Erik", title: "MR", ssrs: [], checkedIn: true },
    { seat: "4A", lastName: "DOE", firstName: "John", title: "MR", loyaltyLevel: "Gold", loyaltyNumber: "LY12345678", languages: ["English", "Danish"], ssrs: ["WCHR", "VGML"], meal: "VGML", checkedIn: true, ticketNumber: "2201756338774", inwardConnection: "BA715 ZRH–LHR", notes: "Maximize rest. Vegetarian. Wheelchair to gate." },
    { seat: "5D", lastName: "OZOLA", firstName: "Marta", title: "MS", ssrs: ["CHML"], meal: "CHML", checkedIn: false },
    { seat: "8C", lastName: "SCHMIDT", firstName: "Lukas", title: "MR", ssrs: [], checkedIn: true },
    { seat: "12A", lastName: "IVANOVA", firstName: "Anna", title: "MRS", ssrs: ["GFML"], meal: "GFML", checkedIn: true },
    { seat: "12F", lastName: "JOHNSON", firstName: "Peter", title: "MR", ssrs: ["UMNR"], checkedIn: true, notes: "Unaccompanied minor, meet at aircraft." },
    { seat: "16D", lastName: "LIEPA", firstName: "Karl", title: "MR", ssrs: [], checkedIn: false },
    { seat: "20A", lastName: "BERMUDEZ", firstName: "Lucia", title: "MS", ssrs: ["VLML"], meal: "VLML", checkedIn: true },
    { seat: "24C", lastName: "VAN DIJK", firstName: "Noah", title: "MR", ssrs: [], checkedIn: true },
  ];
  return rows.map((row) => ({
    ...row,
    id: `${id}-${row.seat}`,
    flightDutyId: id,
  }));
}

export const SAMPLE_PASSENGER_PASTE = `1A  BERZINS/JANIS MR  Gold  VIP  CKIN
1D  NIELSEN/SOFIE MS  Gold  VGML  CKIN
2C  KALNINS/ELZA MRS  WCHR  CKIN
4A  DOE/JOHN MR  Gold  LY12345678  WCHR VGML  CKIN  inw: BA715 ZRH-LHR
12A IVANOVA/ANNA MRS  GFML  CKIN
12F JOHNSON/PETER MR  UMNR  CKIN
20A BERMUDEZ/LUCIA MS  VLML  CKIN`;
