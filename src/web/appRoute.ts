export type Route =
  | { view: "dashboard" }
  | { view: "run"; runId: string; fragment: string | null }
  | { view: "search"; query: string }
  | { view: "notFound"; hash: string };

export function parseHash(hash: string): Route {
  const rest = hash.replace(/^#\/?/, "");
  if (rest === "") {
    return { view: "dashboard" };
  }
  if (rest.startsWith("runs/")) {
    const tail = rest.slice("runs/".length);
    const fragIdx = tail.indexOf("#");
    const runId = fragIdx >= 0 ? tail.slice(0, fragIdx) : tail;
    const fragment = fragIdx >= 0 ? tail.slice(fragIdx + 1) || null : null;
    if (runId === "") {
      return { view: "notFound", hash };
    }
    return { view: "run", runId, fragment };
  }
  if (rest === "search" || rest.startsWith("search?")) {
    const query =
      rest === "search" ? "" : (new URLSearchParams(rest.slice("search?".length)).get("q") ?? "");
    return { view: "search", query };
  }
  return { view: "notFound", hash };
}
