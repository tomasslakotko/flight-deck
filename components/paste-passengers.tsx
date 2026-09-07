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
import {
  looksLikePreorder,
  mergePreorderMeals,
  parsePreorderPaste,
} from "@/lib/parse-preorder";
import {
  SAMPLE_ONBOARD_LIST,
  SAMPLE_PASSENGER_PASTE,
  SAMPLE_PREORDER,
} from "@/lib/demo-data";
import type { Passenger } from "@/lib/types";

export function PastePassengers({
  open,
  onOpenChange,
  flightDutyId,
  existing = [],
  intent = "list",
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightDutyId: string;
  existing?: Passenger[];
  intent?: "list" | "preorder";
  onSave: (rows: Passenger[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const preorderMode = intent === "preorder";
  const preorderGuess = looksLikePreorder(text);
  const passengers = useMemo(
    () => (!preorderMode && text.trim() ? parsePassengerPaste(text, flightDutyId) : []),
    [text, flightDutyId, preorderMode],
  );
  const meals = useMemo(
    () => (preorderMode && text.trim() ? parsePreorderPaste(text) : []),
    [text, preorderMode],
  );
  const mergedCount = preorderMode
    ? meals.filter((row) =>
        existing.some((pax) => pax.seat?.toUpperCase() === row.seat),
      ).length
    : 0;
  const canImport = preorderMode ? meals.length > 0 : passengers.length > 0;

  if (!open) return null;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) setText("");
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:max-w-none">
        <SheetHeader className="text-left">
          <SheetTitle>
            {preorderMode ? "Paste meal preorder" : "Paste passenger list"}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {preorderMode
              ? "Paste the special-meal preorder. Meals merge onto existing seats and do not replace the passenger list."
              : "Paste an ONBOARD LIST, seat/name lines, or CSV. Nothing is uploaded to a server."}
          </p>
        </SheetHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            preorderMode
              ? "007D / SPML / TOMLAK TOMLAK MS\n         / HM10-DS2-BR8\n               BR8 Apple juice"
              : "001D/RIX         SURNAME/FIRST MRS\n                 HAND\n12A  SMITH/JOHN MR  VGML"
          }
          className="mt-4 min-h-40 font-mono text-xs"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {preorderMode ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setText(SAMPLE_PREORDER)}
            >
              Load sample preorder
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setText(SAMPLE_ONBOARD_LIST)}
              >
                Load onboard list
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setText(SAMPLE_PASSENGER_PASTE)}
              >
                Load sample
              </Button>
            </>
          )}
          <Button
            type="button"
            className="h-11"
            disabled={!canImport}
            onClick={async () => {
              const rows = preorderMode
                ? mergePreorderMeals(existing, meals, flightDutyId)
                : passengers;
              await onSave(rows);
              setText("");
              onOpenChange(false);
            }}
          >
            {preorderMode
              ? meals.length
                ? `Merge ${meals.length} meal${meals.length === 1 ? "" : "s"}`
                : "Merge meals"
              : `Import ${passengers.length ? `${passengers.length} passengers` : ""}`}
          </Button>
        </div>
        {!preorderMode && text && preorderGuess ? (
          <p className="mt-3 text-sm text-amber-800">
            This looks like a meal preorder. Use Paste preorder so meals merge onto seats
            instead of replacing the list.
          </p>
        ) : null}
        {text && !canImport && (preorderMode || !preorderGuess) ? (
          <p className="mt-3 text-sm text-amber-800">
            {preorderMode
              ? "No preorder meals recognised. Paste lines like `007D / SPML / TOMLAK TOMLAK MS`."
              : "No passengers recognised. Paste an ONBOARD LIST or a line like `12A  SURNAME/FIRST MR  VGML`."}
          </p>
        ) : null}
        {preorderMode && meals.length ? (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              {mergedCount
                ? `${mergedCount} will update existing seats · ${meals.length - mergedCount} new`
                : `${meals.length} meals will be added as new seats`}
            </p>
            <ul className="mt-2 divide-y rounded-xl bg-slate-50">
              {meals.slice(0, 24).map((row) => (
                <li key={`${row.seat}-${row.meal}-${row.lastName}`} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {row.seat} {row.lastName}
                      {row.title ? ` ${row.title}` : ""}
                    </span>
                    <span className="text-xs font-semibold text-emerald-800">{row.meal}</span>
                  </div>
                  {row.codes.length || row.drinks.length ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[...row.codes, ...row.drinks].join(" · ")}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {!preorderMode && passengers.length ? (
          <ul className="mt-4 divide-y rounded-xl bg-slate-50">
            {passengers.slice(0, 24).map((p) => (
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
