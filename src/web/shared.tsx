const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-300",
  running: "bg-cyan-500/10 text-cyan-300",
  max_turns: "bg-amber-500/10 text-amber-300",
  failed: "bg-rose-500/10 text-rose-300",
  rate_limited: "bg-fuchsia-500/10 text-fuchsia-300",
  cancelled: "bg-slate-500/10 text-slate-300",
};

const FALLBACK_STATUS_STYLE = "bg-slate-500/10 text-slate-300";

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_STYLES[status] ?? FALLBACK_STATUS_STYLE;
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

export function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

// Run-level timestamp: time-only for today, "MMM D · HH:MM AM/PM" for earlier
// calendar days. `now` is threaded in so callers can pass a stable clock for
// tests. Used on RunDetail and the Dashboard runs table where cross-day audits
// need the date visible at a glance; for in-run surfaces (events, tool calls)
// keep using `formatTs`.
export function formatRunTimestamp(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return time;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date} · ${time}`;
}

export function formatInterval(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}
