export type Route =
  | { view: "dashboard" }
  | { view: "run"; runId: string }
  | { view: "search"; query: string }
  | { view: "notFound"; hash: string };

export function parseHash(hash: string): Route {
  const rest = hash.replace(/^#\/?/, "");
  if (rest === "") {
    return { view: "dashboard" };
  }
  if (rest.startsWith("runs/")) {
    const runId = rest.slice("runs/".length);
    if (runId === "") {
      return { view: "notFound", hash };
    }
    return { view: "run", runId };
  }
  if (rest === "search" || rest.startsWith("search?")) {
    const query =
      rest === "search" ? "" : (new URLSearchParams(rest.slice("search?".length)).get("q") ?? "");
    return { view: "search", query };
  }
  return { view: "notFound", hash };
}
