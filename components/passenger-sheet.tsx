"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { passengerConflicts } from "@/lib/parse-passengers";
import type { Passenger } from "@/lib/types";

export function PassengerSheet({
  passenger,
  onClose,
}: {
  passenger: Passenger | null;
  onClose: () => void;
}) {
  if (!passenger) return null;
  const conflict = passengerConflicts(passenger);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl p-0 sm:max-w-none">
        <div className="px-5 pb-8 pt-4">
            <SheetHeader className="mb-4 text-left">
              <SheetTitle>Passenger details</SheetTitle>
              <p className="text-xs text-muted-foreground">Stored on this device only</p>
            </SheetHeader>
            <Section title="Basic information">
              <Row label="Full name" value={`${passenger.lastName} / ${passenger.firstName}`} />
              <Row
                label="Loyalty level"
                value={
                  passenger.loyaltyLevel ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {passenger.loyaltyLevel}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <Row label="Loyalty number" value={passenger.loyaltyNumber ?? "—"} />
              <Row label="Languages" value={passenger.languages?.join(", ") ?? "—"} />
            </Section>
            {passenger.ssrs.length ? (
              <Section title="Known preferences">
                <div className="flex flex-wrap gap-2">
                  {passenger.ssrs.map((code) => (
                    <Badge key={code} variant="secondary" className="h-7 rounded-full px-3">
                      {labelFor(code)}
                    </Badge>
                  ))}
                </div>
              </Section>
            ) : null}
            <Section title="Current flight">
              <Row
                label="Seat"
                value={
                  <span className="rounded-md bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">
                    {passenger.seat ?? "—"}
                  </span>
                }
              />
              <Row label="Ticket number" value={passenger.ticketNumber ?? "—"} />
              <Row label="Inward connection" value={passenger.inwardConnection ?? "None"} />
              <Row label="Onward connection" value={passenger.onwardConnection ?? "None"} />
            </Section>
            {conflict ? (
              <div className="mt-3 rounded-2xl bg-sky-50 p-3 text-sm text-sky-950">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Check this
                </div>
                {conflict}
              </div>
            ) : null}
            {passenger.notes ? (
              <p className="mt-4 text-xs text-muted-foreground">{passenger.notes}</p>
            ) : null}
            <Button className="mt-6 h-11 w-full rounded-full" onClick={onClose}>
              Close
            </Button>
          </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b py-3 last:border-b-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function labelFor(code: string) {
  const map: Record<string, string> = {
    WCHR: "Wheelchair",
    VGML: "Vegetarian",
    VLML: "Vegetarian",
    GFML: "Gluten free",
    CHML: "Child meal",
    UMNR: "Unaccompanied minor",
    VIP: "VIP",
  };
  return map[code] ?? code;
}
