import { useEffect, useMemo, useState } from "react";
import { searchRuns, type ApiSearchMatch } from "./api.js";
import { StatusBadge } from "./Dashboard.js";

export function Search({ query }: { query: string }) {
  const [input, setInput] = useState(query);
  const [state, setState] = useState<
    | { tag: "idle" }
    | { tag: "loading" }
    | { tag: "ready"; matches: ApiSearchMatch[] }
    | { tag: "error"; message: string }
  >(query ? { tag: "loading" } : { tag: "idle" });

  useEffect(() => {
    setInput(query);
    if (!query) {
      setState({ tag: "idle" });
      return;
    }
    let cancelled = false;
    setState({ tag: "loading" });
    (async () => {
      try {
        const res = await searchRuns(query);
        if (!cancelled) setState({ tag: "ready", matches: res.matches });
      } catch (err) {
        if (!cancelled) setState({ tag: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search turn content and event payloads…"
          className="flex-1 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-600"
          autoFocus
        />
        <button
          type="submit"
          className="rounded bg-cyan-600 hover:bg-cyan-500 px-3 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
      </form>

      {state.tag === "idle" && (
        <p className="text-sm text-slate-400">
          Type a phrase that might appear in a turn's content or an event payload.
        </p>
      )}
      {state.tag === "loading" && <p className="text-slate-400 text-sm">searching…</p>}
      {state.tag === "error" && <p className="text-rose-400 text-sm">{state.message}</p>}
      {state.tag === "ready" && <SearchResults query={query} matches={state.matches} />}
    </div>
  );
}

function SearchResults({ query, matches }: { query: string; matches: ApiSearchMatch[] }) {
  if (matches.length === 0) {
    return <p className="text-sm text-slate-400">No matches for {JSON.stringify(query)}.</p>;
  }
  return (
    <ul className="space-y-2">
      {matches.map((m, i) => (
        <li
          key={`${m.runId}:${m.matchKind}:${m.turnNumber ?? m.eventType ?? i}`}
          className="rounded border border-slate-800 bg-slate-900/60 p-3"
        >
          <a href={`#/runs/${m.runId}`} className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="font-mono text-cyan-400">{m.issueIdentifier}</span>
            {m.issueTitle && <span className="text-slate-300 truncate">{m.issueTitle}</span>}
            <StatusBadge status={m.status} />
            <span className="text-xs text-slate-500">
              {m.matchKind === "turn" ? `turn #${m.turnNumber}` : `event ${m.eventType}`}
            </span>
          </a>
          <Highlighted text={m.snippet} query={query} />
        </li>
      ))}
    </ul>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => splitForHighlight(text, query), [text, query]);
  return (
    <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-400">
      {parts.map((p, i) => (
        <span key={i} className={p.match ? "bg-amber-500/20 text-amber-100" : ""}>
          {p.text}
        </span>
      ))}
    </pre>
  );
}

function splitForHighlight(text: string, query: string): Array<{ text: string; match: boolean }> {
  if (!query) return [{ text, match: false }];
  const parts: Array<{ text: string; match: boolean }> = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let cursor = 0;
  let idx = lower.indexOf(q, cursor);
  while (idx !== -1) {
    if (idx > cursor) parts.push({ text: text.slice(cursor, idx), match: false });
    parts.push({ text: text.slice(idx, idx + q.length), match: true });
    cursor = idx + q.length;
    idx = lower.indexOf(q, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}
