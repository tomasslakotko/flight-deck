"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { parsePassengerPaste } from "@/lib/parse-passengers";
import { SAMPLE_PASSENGER_PASTE } from "@/lib/demo-data";
import type { Passenger } from "@/lib/types";

export function PastePassengers({
  open,
  onOpenChange,
  flightDutyId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightDutyId: string;
  onSave: (rows: Passenger[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const parsed = useMemo(
    () => (text.trim() ? parsePassengerPaste(text, flightDutyId) : []),
    [text, flightDutyId],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:max-w-none">
        <SheetHeader className="text-left">
          <SheetTitle>Paste passenger list</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Paste a DCS dump, seat/name lines, or CSV. Nothing is uploaded to a server.
          </p>
        </SheetHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"12A  SMITH/JOHN MR  VGML  WCHR\n4A  DOE/JANE MS  Gold"}
          className="mt-4 min-h-40 font-mono text-xs"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setText(SAMPLE_PASSENGER_PASTE)}
          >
            Load sample
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={!parsed.length}
            onClick={async () => {
              await onSave(parsed);
              onOpenChange(false);
            }}
          >
            Import {parsed.length ? `${parsed.length} passengers` : ""}
          </Button>
        </div>
        {text && !parsed.length ? (
          <p className="mt-3 text-sm text-amber-800">
            No passengers recognised. Try `12A  SURNAME/FIRST MR  VGML` or send a real dump later so we can tune the parser.
          </p>
        ) : null}
        {parsed.length ? (
          <ul className="mt-4 divide-y rounded-xl bg-slate-50">
            {parsed.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">
                  {p.seat ?? "—"} {p.lastName}/{p.firstName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.ssrs.join(" ") || p.loyaltyLevel || ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
