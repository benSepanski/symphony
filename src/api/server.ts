import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Orchestrator } from "../orchestrator.js";
import type { SymphonyLogger } from "../persistence/logger.js";

export interface ServerOptions {
  orchestrator: Orchestrator;
  logger: SymphonyLogger;
}

export function createServer({ orchestrator, logger }: ServerOptions): Hono {
  const app = new Hono();

  app.get("/", (c) =>
    c.html(`<!doctype html>
<meta charset="utf-8">
<title>Symphony</title>
<h1>Symphony</h1>
<p>Web UI is not built yet. See <code>/api/runs</code> and <code>/api/events</code>.</p>
`),
  );

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

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const events: Array<{ event: string; data: unknown }> = [];
      const push = (event: string, data: unknown) => {
        events.push({ event, data });
      };
      const onRunStarted = (e: unknown) => push("runStarted", e);
      const onTurn = (e: unknown) => push("turn", e);
      const onRunFinished = (e: unknown) => push("runFinished", e);
      orchestrator.on("runStarted", onRunStarted);
      orchestrator.on("turn", onTurn);
      orchestrator.on("runFinished", onRunFinished);
      stream.onAbort(() => {
        orchestrator.off("runStarted", onRunStarted);
        orchestrator.off("turn", onTurn);
        orchestrator.off("runFinished", onRunFinished);
      });
      while (!stream.aborted) {
        while (events.length > 0) {
          const evt = events.shift()!;
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
