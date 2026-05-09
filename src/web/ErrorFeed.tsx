import { useState } from "react";
import type { ApiEvent, ApiRun } from "./api.js";
import { fullPayload, shouldExpand, summarize } from "./errorFeedUtils.js";

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
          return <ErrorRow key={e.id} event={e} run={run} label={label} />;
        })}
      </ul>
    </section>
  );
}

interface RowProps {
  event: ApiEvent;
  run: ApiRun | undefined;
  label: { text: string; cls: string };
}

function ErrorRow({ event, run, label }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarize(event);
  const canExpand = shouldExpand(summary);
  const detail = canExpand ? fullPayload(event) : "";

  return (
    <li>
      <div className="flex items-center gap-3 py-2 text-xs hover:bg-slate-900/60 -mx-2 px-2 rounded">
        <a
          href={`#/runs/${event.runId}`}
          className="flex items-center gap-3 flex-1 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
        >
          <span className="text-slate-500 font-mono tabular-nums w-20 shrink-0">
            {formatTime(event.ts)}
          </span>
          <span className="font-mono text-slate-300 w-24 shrink-0 truncate">
            {run?.issueIdentifier ?? "—"}
          </span>
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium shrink-0 ${label.cls}`}
          >
            {label.text}
          </span>
          <span className="text-slate-400 truncate flex-1 min-w-0" title={summary || undefined}>
            {summary}
          </span>
        </a>
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse error payload" : "Expand error payload"}
            className="shrink-0 rounded px-1 text-slate-400 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          </button>
        )}
      </div>
      {canExpand && expanded && (
        <pre className="mt-1 mb-2 ml-2 whitespace-pre-wrap break-words border-l border-slate-800 pl-3 text-xs text-slate-400">
          {detail}
        </pre>
      )}
    </li>
  );
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}
