import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  delayMin,
  className,
}: {
  status?: string | null;
  delayMin?: number | null;
  className?: string;
}) {
  const delayed =
    (delayMin ?? 0) >= 10 ||
    (status ?? "").toLowerCase().includes("delay");
  const cancelled = (status ?? "").toLowerCase().includes("cancel");
  const landed = (status ?? "").toLowerCase().includes("land");
  const airborne =
    (status ?? "").toLowerCase().includes("en-route") ||
    (status ?? "").toLowerCase().includes("active");

  if (cancelled) {
    return (
      <span className={cn("rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700", className)}>
        Cancelled
      </span>
    );
  }
  if (delayed) {
    return (
      <span className={cn("rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800", className)}>
        Delayed{delayMin ? ` +${delayMin}m` : ""}
      </span>
    );
  }
  if (landed) {
    return (
      <span className={cn("rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600", className)}>
        Landed
      </span>
    );
  }
  if (airborne) {
    return (
      <span className={cn("rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800", className)}>
        En route
      </span>
    );
  }
  if (status) {
    return (
      <span className={cn("rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800", className)}>
        {status.replace(/-/g, " ")}
      </span>
    );
  }
  return (
    <span className={cn("rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800", className)}>
      On time
    </span>
  );
}
