import type { ApiEvent, ApiRun } from "./api.js";
import { formatRunTs, formatRunTsTitle } from "./shared.js";

interface Props {
  events: ApiEvent[];
  runs: ApiRun[];
}

const LABEL: Record<string, { text: string; cls: string }> = {
  error: { text: "error", cls: "bg-rose-500/10 text-rose-300" },
  rate_limited: { text: "rate limit", cls: "bg-fuchsia-500/10 text-fuchsia-300" },
  session_stop_error: { text: "session stop", cls: "bg-amber-500/10 text-amber-300" },
  state_transition_error: { text: "state transition", cls: "bg-amber-500/10 text-amber-300" },
  workspace_destroy_error: { text: "workspace", cls: "bg-amber-500/10 text-amber-300" },
};

export function ErrorFeed({ events, runs }: Props) {
  if (events.length === 0) return null;

  const idByRun = new Map<string, ApiRun>();
  for (const r of runs) idByRun.set(r.id, r);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm font-medium text-slate-200 mb-3">Recent errors</h2>
      <ul className="divide-y divide-slate-800/60">
        {events.slice(0, 10).map((e) => {
          const run = idByRun.get(e.runId);
          const label = LABEL[e.eventType] ?? {
            text: e.eventType,
            cls: "bg-slate-500/10 text-slate-300",
          };
          return (
            <li key={e.id}>
              <a
                href={`#/runs/${e.runId}`}
                className="flex items-center gap-3 py-2 text-xs hover:bg-slate-900/60 -mx-2 px-2 rounded"
              >
                <span
                  className="text-slate-500 font-mono tabular-nums w-28 shrink-0"
                  title={formatRunTsTitle(e.ts)}
                >
                  {formatRunTs(e.ts)}
                </span>
                <span className="font-mono text-slate-300 w-24 shrink-0 truncate">
                  {run?.issueIdentifier ?? "—"}
                </span>
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium shrink-0 ${label.cls}`}
                >
                  {label.text}
                </span>
                <span className="text-slate-400 truncate">{summarize(e)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function summarize(e: ApiEvent): string {
  if (!e.payload) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(e.payload);
  } catch {
    return e.payload.slice(0, 120);
  }
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.window === "string") {
      const win = o.window === "fiveHour" ? "5-hour" : o.window === "sevenDay" ? "7-day" : o.window;
      return `${win} window${o.resetsAt ? ` · resets ${new Date(String(o.resetsAt)).toLocaleString()}` : ""}`;
    }
  }
  return JSON.stringify(parsed).slice(0, 120);
}
