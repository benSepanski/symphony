import { useEffect, useState } from "react";
import { Dashboard } from "./Dashboard.js";
import { RunDetail } from "./RunDetail.js";
import { Search } from "./Search.js";

type Route =
  | { view: "dashboard" }
  | { view: "run"; runId: string }
  | { view: "search"; query: string };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("runs/")) {
    return { view: "run", runId: h.slice("runs/".length) };
  }
  if (h === "search" || h.startsWith("search?")) {
    const query =
      h === "search" ? "" : (new URLSearchParams(h.slice("search?".length)).get("q") ?? "");
    return { view: "search", query };
  }
  return { view: "dashboard" };
}

export function App() {
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <a
          href="#/"
          className="text-lg font-semibold tracking-tight hover:text-cyan-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          Symphony
        </a>
        <nav className="flex items-center gap-3 text-sm text-slate-400">
          <a
            href="#/"
            className={`rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              route.view === "dashboard" ? "text-slate-100" : "hover:text-slate-200"
            }`}
          >
            runs
          </a>
          <a
            href="#/search"
            className={`rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              route.view === "search" ? "text-slate-100" : "hover:text-slate-200"
            }`}
          >
            search
          </a>
        </nav>
        {route.view === "run" && (
          <span className="text-sm text-slate-500">run {route.runId.slice(0, 8)}…</span>
        )}
      </header>
      <main className="px-6 py-6">
        {route.view === "dashboard" && <Dashboard />}
        {route.view === "run" && <RunDetail runId={route.runId} />}
        {route.view === "search" && <Search query={route.query} />}
      </main>
    </div>
  );
}
