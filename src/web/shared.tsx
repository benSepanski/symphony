export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-500/10 text-emerald-300"
      : status === "running"
        ? "bg-cyan-500/10 text-cyan-300"
        : status === "max_turns"
          ? "bg-amber-500/10 text-amber-300"
          : status === "failed"
            ? "bg-rose-500/10 text-rose-300"
            : status === "rate_limited"
              ? "bg-fuchsia-500/10 text-fuchsia-300"
              : status === "cancelled"
                ? "bg-slate-500/10 text-slate-300"
                : "bg-slate-500/10 text-slate-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {status === "running" && (
        <span className="inline-block size-1.5 rounded-full bg-cyan-300 animate-pulse" />
      )}
      {status}
    </span>
  );
}

export function formatPct(utilization: number): string {
  const pct = utilization <= 1 ? utilization * 100 : utilization;
  return `${pct.toFixed(0)}%`;
}

export function formatRunTs(ts: string, now: Date = new Date()): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const time = formatTimeOfDay(d);
  const dayDiff = calendarDayDiff(now, d);
  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff < 7) {
    const weekday = d.toLocaleDateString([], { weekday: "short" });
    return `${weekday} ${time}`;
  }
  return `${formatIsoDate(d)} ${time}`;
}

export function formatRunTsTitle(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString();
}

export function formatTimezoneLabel(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(now);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

function formatTimeOfDay(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function calendarDayDiff(now: Date, d: Date): number {
  const a = startOfLocalDay(now).getTime();
  const b = startOfLocalDay(d).getTime();
  return Math.round((a - b) / 86_400_000);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
