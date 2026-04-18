import { useEffect, useState } from "react";
import { Dashboard } from "./Dashboard.js";
import { RunDetail } from "./RunDetail.js";

function parseHash(): { view: "dashboard" | "run"; runId?: string } {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("runs/")) {
    return { view: "run", runId: h.slice("runs/".length) };
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
        <a href="#/" className="text-lg font-semibold tracking-tight hover:text-cyan-400">
          Symphony
        </a>
        <span className="text-sm text-slate-500">
          {route.view === "dashboard" ? "runs" : `run ${route.runId?.slice(0, 8)}…`}
        </span>
      </header>
      <main className="px-6 py-6">
        {route.view === "dashboard" && <Dashboard />}
        {route.view === "run" && route.runId && <RunDetail runId={route.runId} />}
      </main>
    </div>
  );
}
