"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  MoreHorizontal,
  Plane,
  RefreshCw,
  Upload,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoster } from "@/components/roster-provider";
import { DutyTimeline } from "@/components/duty-timeline";
import { dutiesOnDate, shiftBounds } from "@/lib/shift";
import { todayKey } from "@/lib/dates";
import { formatSyncedAgo } from "@/lib/session";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Shift", icon: Plane },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/import", label: "Import", icon: Upload },
];

export function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname();
  const {
    profile,
    duties,
    refreshSession,
    sessionLoading,
    online,
    syncError,
    session,
    liveByIata,
  } = useRoster();
  const date = todayKey();
  const bounds = shiftBounds(duties, date);
  const todayDuties = dutiesOnDate(duties, date);
  const [mounted, setMounted] = useState(false);
  const [syncedLabel, setSyncedLabel] = useState<string | null>(null);
  const [liveLabel, setLiveLabel] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const tick = () => {
      setSyncedLabel(formatSyncedAgo(profile.lastSyncedAt));
      setLiveLabel(formatSyncedAgo(session?.liveAt));
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [profile.lastSyncedAt, session?.liveAt]);

  const hasCachedLive = Object.keys(liveByIata).length > 0;
  const showOfflineBanner = !online || Boolean(syncError);

  function navActive(href: string) {
    if (!mounted) return href === "/";
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-white md:flex">
        <div className="px-5 pt-6 pb-4">
          <div className="text-lg font-semibold tracking-tight">
            Flight <span className="text-primary">Deck</span>
          </div>
          <div className="text-xs text-muted-foreground">Roster · live ops</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = navActive(item.href);
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
          online={online}
          onRefresh={() => void refreshSession(true)}
          refreshing={sessionLoading}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 md:hidden">
          <div>
            <div className="text-sm font-semibold">
              Flight <span className="text-primary">Deck</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {profile.position} · {profile.name}
              {syncedLabel ? ` · Synced ${syncedLabel}` : null}
            </div>
          </div>
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link href="/import">
              <ClipboardList className="size-5" />
            </Link>
          </Button>
        </header>

        {showOfflineBanner ? (
          <div
            className={cn(
              "mx-4 mb-1 flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
              !online
                ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200/80"
                : "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80",
            )}
            role="status"
          >
            <WifiOff className="mt-0.5 size-3.5 shrink-0 opacity-80" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {!online ? "Offline — cached roster" : "Using cached live data"}
              </div>
              <div className="opacity-80">
                {syncError ??
                  (hasCachedLive && liveLabel
                    ? `Live status from ${liveLabel}`
                    : "Roster stays on this device until you’re back online.")}
              </div>
            </div>
            {online ? (
              <button
                type="button"
                className="shrink-0 font-medium underline"
                onClick={() => void refreshSession(true)}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <main
          className={cn(
            "mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-4 pb-40 md:pb-28",
            wide ? "max-w-none" : "max-w-6xl",
          )}
        >
          {children}
        </main>

        <footer className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="hidden md:block">
              <MiniProfile
                name={profile.name}
                synced={syncedLabel}
                online={online}
                onRefresh={() => void refreshSession(true)}
                refreshing={sessionLoading}
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
                const active = navActive(item.href);
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
  online,
  onRefresh,
  refreshing,
}: {
  name: string;
  position: string;
  synced: string | null;
  online: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-t px-4 py-4">
      <Avatar name={name} online={online} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="text-[11px] text-muted-foreground">
          {position} · {online ? `Synced ${synced ?? "—"}` : "Offline"}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="flex size-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        aria-label="Refresh roster and flights"
      >
        <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
      </button>
    </div>
  );
}

function MiniProfile({
  name,
  synced,
  online,
  onRefresh,
  refreshing,
}: {
  name: string;
  synced: string | null;
  online: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pr-2">
      <Avatar name={name} online={online} />
      <div>
        <div className="text-xs font-semibold">{name}</div>
        <div className="text-[10px] text-muted-foreground">
          {online ? `Synced ${synced ?? "—"}` : "Offline · cached"}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="flex size-9 items-center justify-center rounded-full text-slate-400"
        aria-label="Refresh roster and flights"
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
      </button>
    </div>
  );
}

function Avatar({ name, online }: { name: string; online: boolean }) {
  return (
    <div className="relative flex size-9 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800">
      {name.slice(0, 1)}
      <span
        className={cn(
          "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-white",
          online ? "bg-emerald-500" : "bg-amber-400",
        )}
      />
    </div>
  );
}
