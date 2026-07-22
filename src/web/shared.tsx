import { useEffect, useState, type ReactNode } from "react";

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

export function formatPct(utilization: number | null): string {
  if (utilization === null || !Number.isFinite(utilization)) return "—";
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

// Neutral card wrapper used by empty states, "not found" screens, and error
// surfaces on the dashboard. Keep the class string in one place so a visual
// tweak (border, radius, padding, background) applies to every callsite.
// `role` is passed through for the a11y-role-carrying variants
// ("alert" for DashboardErrorCard, "status" for SkeletonLoadingCard).
export function MessageCard({
  heading,
  role,
  children,
}: {
  heading: string;
  role?: "alert" | "status";
  children: ReactNode;
}) {
  return (
    <div role={role} className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-lg font-medium mb-2">{heading}</h2>
      {children}
    </div>
  );
}

// Delay before a loading skeleton fades in. Short enough that slow loads still
// get visible feedback; long enough that fast loads (SSR-warmed cache, replay)
// don't flash a skeleton the user never had time to read.
export const LOADING_CARD_DELAY_MS = 200;

export function SkeletonLoadingCard({ heading, srText }: { heading: string; srText: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), LOADING_CARD_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return <div aria-hidden="true" />;
  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6"
    >
      <h2 className="text-lg font-medium mb-2">{heading}</h2>
      <p className="sr-only">{srText}</p>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-800" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-800" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-800" />
      </div>
    </div>
  );
}
