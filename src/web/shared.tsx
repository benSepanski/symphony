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

export function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}
