import { useEffect, useMemo, useState, type ReactNode } from "react";
import { searchRuns, type ApiSearchMatch } from "./api.js";
import { StatusBadge } from "./shared.js";
import {
  EMPTY_FILTERS,
  type MatchKind,
  type SearchFilters,
  availableStatuses,
  filterMatches,
  summarizeMatches,
  toggleSetMember,
} from "./searchUtils.js";

const DEBOUNCE_MS = 250;

type SearchState =
  | { tag: "idle" }
  | { tag: "loading" }
  | { tag: "ready"; matches: ApiSearchMatch[] }
  | { tag: "error"; message: string };

export function Search({ query: initialQuery }: { query: string }) {
  const [input, setInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [state, setState] = useState<SearchState>(
    initialQuery ? { tag: "loading" } : { tag: "idle" },
  );

  useEffect(() => {
    setInput(initialQuery);
    setActiveQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed === activeQuery) return;
    const t = setTimeout(() => {
      setActiveQuery(trimmed);
      const newHash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, "", newHash);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, activeQuery]);

  useEffect(() => {
    if (!activeQuery) {
      setState({ tag: "idle" });
      return;
    }
    let cancelled = false;
    setState({ tag: "loading" });
    (async () => {
      try {
        const res = await searchRuns(activeQuery);
        if (!cancelled) setState({ tag: "ready", matches: res.matches });
      } catch (err) {
        if (!cancelled) setState({ tag: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeQuery]);

  const submit = () => {
    const trimmed = input.trim();
    setActiveQuery(trimmed);
    window.location.hash = trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : "#/search";
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search turn content and event payloads…"
          className="flex-1 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-500"
          autoFocus
        />
        <button
          type="submit"
          className="rounded bg-cyan-600 hover:bg-cyan-500 px-3 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Search
        </button>
      </form>

      {state.tag === "idle" && (
        <p className="text-sm text-slate-400">
          Type a phrase that might appear in a turn's content or an event payload. Results update as
          you type — searches are case-insensitive substring matches.
        </p>
      )}
      {state.tag === "loading" && <p className="text-slate-400 text-sm">searching…</p>}
      {state.tag === "error" && <p className="text-rose-400 text-sm">{state.message}</p>}
      {state.tag === "ready" && (
        <SearchResults
          query={activeQuery}
          matches={state.matches}
          filters={filters}
          setFilters={setFilters}
        />
      )}
    </div>
  );
}

function SearchResults({
  query,
  matches,
  filters,
  setFilters,
}: {
  query: string;
  matches: ApiSearchMatch[];
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
}) {
  const summary = useMemo(() => summarizeMatches(matches), [matches]);
  const statuses = useMemo(() => availableStatuses(matches), [matches]);
  const filtered = useMemo(() => filterMatches(matches, filters), [matches, filters]);

  if (matches.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-slate-300">No matches for "{query}".</p>
        <p className="text-xs text-slate-500">
          Tip: searches are case-insensitive substring matches over turn content and event payloads.
          Try broader terms or check that the phrase appears verbatim.
        </p>
      </div>
    );
  }

  const toggleKind = (kind: MatchKind) =>
    setFilters({ ...filters, kinds: toggleSetMember(filters.kinds, kind) });

  const toggleStatus = (status: string) =>
    setFilters({ ...filters, statuses: toggleSetMember(filters.statuses, status) });

  const filteredOut = matches.length - filtered.length;

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-300">
        <span className="font-medium">{summary.total}</span>{" "}
        {summary.total === 1 ? "match" : "matches"} across{" "}
        <span className="font-medium">{summary.runs}</span> {summary.runs === 1 ? "run" : "runs"} ·{" "}
        {summary.turns} {summary.turns === 1 ? "turn" : "turns"} · {summary.events}{" "}
        {summary.events === 1 ? "event" : "events"}
        {filteredOut > 0 && <span className="text-slate-500"> · showing {filtered.length}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">kind:</span>
        <Chip active={filters.kinds.has("turn")} onClick={() => toggleKind("turn")}>
          turns ({summary.turns})
        </Chip>
        <Chip active={filters.kinds.has("event")} onClick={() => toggleKind("event")}>
          events ({summary.events})
        </Chip>
        {statuses.length > 1 && (
          <>
            <span className="text-slate-500 ml-2">status:</span>
            {statuses.map((s) => (
              <Chip key={s} active={filters.statuses.has(s)} onClick={() => toggleStatus(s)}>
                {s}
              </Chip>
            ))}
          </>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">
          No matches under the current filters. Toggle a chip to widen.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((m, i) => (
            <li
              key={`${m.runId}:${m.matchKind}:${m.turnNumber ?? m.eventType ?? i}`}
              className="rounded border border-slate-800 bg-slate-900/60 p-3"
            >
              <a
                href={`#/runs/${m.runId}`}
                className="flex flex-wrap items-baseline gap-2 text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                <span className="font-mono text-cyan-400">{m.issueIdentifier}</span>
                {m.issueTitle && (
                  <span className="text-slate-300 truncate" title={m.issueTitle}>
                    {m.issueTitle}
                  </span>
                )}
                <StatusBadge status={m.status} />
                <span className="text-xs text-slate-500">
                  {m.matchKind === "turn" ? `turn #${m.turnNumber}` : `event ${m.eventType}`}
                </span>
              </a>
              <Highlighted text={m.snippet} query={query} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2 py-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
        active
          ? "border-cyan-500 bg-cyan-500/10 text-cyan-200"
          : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
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
