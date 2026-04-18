import { existsSync, readFileSync } from "node:fs";
import type { EventEmitter } from "node:events";
import { join, relative, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SymphonyLogger } from "../persistence/logger.js";

export interface ServerOptions {
  events: EventEmitter;
  logger: SymphonyLogger;
  webRoot?: string;
}

const PLACEHOLDER_HTML = `<!doctype html>
<meta charset="utf-8">
<title>Symphony</title>
<h1>Symphony</h1>
<p>Web UI bundle not found. Run <code>pnpm build:web</code> or visit <code>/api/runs</code>.</p>
`;

export function createServer({ events, logger, webRoot }: ServerOptions): Hono {
  const app = new Hono();

  const resolvedWebRoot = webRoot ?? resolve("dist/web");
  const indexPath = join(resolvedWebRoot, "index.html");
  const hasWebBundle = existsSync(indexPath);

  if (hasWebBundle) {
    const root = relative(process.cwd(), resolvedWebRoot) || ".";
    app.use("/assets/*", serveStatic({ root }));
    app.get("/", (c) => {
      const html = readFileSync(indexPath, "utf8");
      return c.html(html);
    });
  } else {
    app.get("/", (c) => c.html(PLACEHOLDER_HTML));
  }

  app.get("/api/runs", (c) => c.json(logger.listRuns()));

  app.get("/api/runs/:id", (c) => {
    const id = c.req.param("id");
    const run = logger.listRuns().find((r) => r.id === id);
    if (!run) return c.json({ error: "not found" }, 404);
    return c.json({
      run,
      turns: logger.listTurns(id),
      events: logger.listEvents(id),
    });
  });

  app.get("/api/search", (c) => {
    const q = c.req.query("q") ?? "";
    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : 100;
    return c.json({ query: q, matches: logger.search(q, limit) });
  });

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const queue: Array<{ event: string; data: unknown }> = [];
      const push = (event: string, data: unknown) => {
        queue.push({ event, data });
      };
      const onRunStarted = (e: unknown) => push("runStarted", e);
      const onTurn = (e: unknown) => push("turn", e);
      const onRunFinished = (e: unknown) => push("runFinished", e);
      events.on("runStarted", onRunStarted);
      events.on("turn", onTurn);
      events.on("runFinished", onRunFinished);
      stream.onAbort(() => {
        events.off("runStarted", onRunStarted);
        events.off("turn", onTurn);
        events.off("runFinished", onRunFinished);
      });
      while (!stream.aborted) {
        while (queue.length > 0) {
          const evt = queue.shift()!;
          await stream.writeSSE({
            event: evt.event,
            data: JSON.stringify(evt.data),
          });
        }
        await stream.sleep(250);
      }
    }),
  );

  return app;
}
