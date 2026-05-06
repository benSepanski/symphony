const STATUS_BADGE_COLORS: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-300",
  running: "bg-cyan-500/10 text-cyan-300",
  max_turns: "bg-amber-500/10 text-amber-300",
  failed: "bg-rose-500/10 text-rose-300",
  rate_limited: "bg-fuchsia-500/10 text-fuchsia-300",
  cancelled: "bg-slate-500/10 text-slate-300",
};

const STATUS_BADGE_DEFAULT_COLOR = "bg-slate-500/10 text-slate-300";

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_BADGE_COLORS[status] ?? STATUS_BADGE_DEFAULT_COLOR;
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
