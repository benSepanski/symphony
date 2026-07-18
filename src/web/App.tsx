import { useEffect, useState } from "react";
import { documentTitleForRoute, runHeaderLabel, type RunHeader } from "./appHeader.js";
import { parseHash } from "./appRoute.js";
import { Dashboard } from "./Dashboard.js";
import { RunDetail } from "./RunDetail.js";
import { Search } from "./Search.js";

function currentRoute() {
  return parseHash(window.location.hash);
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  const [runHeader, setRunHeader] = useState<RunHeader | null>(null);

  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  useEffect(() => {
    document.title = documentTitleForRoute(route, runHeader);
  }, [route, runHeader]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href="#/"
          className="text-lg font-semibold tracking-tight hover:text-cyan-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          Symphony
        </a>
        <nav className="flex items-center gap-1 text-sm text-slate-400">
          <a
            href="#/"
            aria-current={route.view === "dashboard" ? "page" : undefined}
            className={`rounded px-2 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              route.view === "dashboard" ? "bg-slate-800/60 text-slate-100" : "hover:text-slate-200"
            }`}
          >
            runs
          </a>
          <a
            href="#/search"
            aria-current={route.view === "search" ? "page" : undefined}
            className={`rounded px-2 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              route.view === "search" ? "bg-slate-800/60 text-slate-100" : "hover:text-slate-200"
            }`}
          >
            search
          </a>
        </nav>
        {route.view === "run" && <RunBreadcrumb runId={route.runId} header={runHeader} />}
      </header>
      <main className="px-4 py-4 sm:px-6 sm:py-6">
        {route.view === "dashboard" && <Dashboard />}
        {route.view === "run" && (
          <RunDetail
            runId={route.runId}
            fragment={route.fragment}
            onHeaderResolved={setRunHeader}
          />
        )}
        {route.view === "search" && <Search query={route.query} />}
        {route.view === "notFound" && <NotFound hash={route.hash} />}
      </main>
    </div>
  );
}

function RunBreadcrumb({ runId, header }: { runId: string; header: RunHeader | null }) {
  const label = runHeaderLabel(runId, header);
  if (label.kind === "identifier") {
    return (
      <span className="min-w-0 max-w-full truncate text-sm text-slate-500">
        run <span className="font-mono text-slate-300">{label.identifier}</span>
      </span>
    );
  }
  return (
    <span className="min-w-0 max-w-full truncate text-sm text-slate-500">run {label.slice}…</span>
  );
}

function NotFound({ hash }: { hash: string }) {
  return (
    <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-lg font-medium mb-2">Page not found</h2>
      <p className="text-slate-400 text-sm">
        No route matches <code className="font-mono text-slate-300">{hash}</code>.
      </p>
      <a
        href="#/"
        className="mt-3 inline-block text-sm text-cyan-400 rounded hover:text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        ← Back to runs
      </a>
    </div>
  );
}
