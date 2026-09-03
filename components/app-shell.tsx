"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  MoreHorizontal,
  Plane,
  RefreshCw,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoster } from "@/components/roster-provider";
import { DutyTimeline } from "@/components/duty-timeline";
import { dutiesOnDate, shiftBounds } from "@/lib/shift";
import { todayKey } from "@/lib/dates";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Shift", icon: Plane },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/import", label: "Import", icon: Upload },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, duties, markSynced } = useRoster();
  const date = todayKey();
  const bounds = shiftBounds(duties, date);
  const todayDuties = dutiesOnDate(duties, date);

  const syncedLabel = profile.lastSyncedAt
    ? new Date(profile.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-white md:flex">
        <div className="px-5 pt-6 pb-4">
          <div className="text-lg font-semibold tracking-tight">
            airBaltic <span className="text-primary">Crew</span>
          </div>
          <div className="text-xs text-muted-foreground">Roster · live ops</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <ProfileBlock
          name={profile.name}
          position={profile.position}
          synced={syncedLabel}
          onRefresh={() => void markSynced()}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 md:hidden">
          <div>
            <div className="text-sm font-semibold">
              airBaltic <span className="text-primary">Crew</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {profile.position} · {profile.name}
            </div>
          </div>
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link href="/import">
              <ClipboardList className="size-5" />
            </Link>
          </Button>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-40 md:pb-28">
          {children}
        </main>

        <footer className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="hidden md:block">
              <MiniProfile
                name={profile.name}
                synced={syncedLabel}
                onRefresh={() => void markSynced()}
              />
            </div>
            <DutyTimeline
              duties={todayDuties}
              shiftStart={bounds?.start}
              shiftEnd={bounds?.end}
            />
          </div>
          <nav className="flex items-center justify-center gap-2 px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] md:hidden">
            <div className="flex h-14 items-center gap-1 rounded-full bg-white px-2 shadow-lg ring-1 ring-black/5">
              {NAV.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex h-11 min-w-16 flex-col items-center justify-center rounded-full px-4 text-[11px] font-medium",
                      active ? "text-primary" : "text-slate-500",
                    )}
                  >
                    <item.icon className={cn("size-5", active && "stroke-[2.4]")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <Link
              href="/import"
              className="flex size-11 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-black/5"
            >
              <MoreHorizontal className="size-5 text-slate-500" />
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}

function ProfileBlock({
  name,
  position,
  synced,
  onRefresh,
}: {
  name: string;
  position: string;
  synced: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t px-4 py-4">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="text-[11px] text-muted-foreground">
          {position} · Last synced {synced ?? "—"}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="flex size-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        aria-label="Refresh sync time"
      >
        <RefreshCw className="size-4" />
      </button>
    </div>
  );
}

function MiniProfile({
  name,
  synced,
  onRefresh,
}: {
  name: string;
  synced: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pr-2">
      <Avatar name={name} />
      <div>
        <div className="text-xs font-semibold">{name}</div>
        <div className="text-[10px] text-muted-foreground">
          Last synced {synced ?? "—"}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="flex size-9 items-center justify-center rounded-full text-slate-400"
        aria-label="Refresh"
      >
        <RefreshCw className="size-3.5" />
      </button>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="relative flex size-9 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800">
      {name.slice(0, 1)}
      <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
    </div>
  );
}
