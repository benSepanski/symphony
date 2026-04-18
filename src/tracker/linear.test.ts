import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinearApiError, LinearTracker } from "./linear.js";

interface FakeResponse {
  status?: number;
  body: unknown;
}

function makeFetch(
  respond: (body: { query: string; variables: Record<string, unknown> }) => FakeResponse,
) {
  return vi.fn(async (_url, init) => {
    const parsed = JSON.parse((init?.body as string) ?? "{}");
    const { status = 200, body } = respond(parsed);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("LinearTracker", () => {
  let fetchImpl: ReturnType<typeof makeFetch>;
  let tracker: LinearTracker;

  beforeEach(() => {
    fetchImpl = makeFetch((req) => {
      if (req.query.includes("query IssuesForProject")) {
        return {
          body: {
            data: {
              issues: {
                nodes: [
                  {
                    id: "issue-1",
                    identifier: "BEN-1",
                    title: "fix something",
                    description: "broke",
                    url: "https://linear.app/x/BEN-1",
                    labels: { nodes: [{ name: "bug" }] },
                    state: { id: "state-todo", name: "Todo" },
                    team: { id: "team-1" },
                  },
                ],
              },
            },
          },
        };
      }
      if (req.query.includes("query StatesForTeam")) {
        return {
          body: {
            data: {
              workflowStates: {
                nodes: [
                  { id: "state-todo", name: "Todo", team: { id: "team-1" } },
                  { id: "state-done", name: "Done", team: { id: "team-1" } },
                ],
              },
            },
          },
        };
      }
      if (req.query.includes("mutation UpdateIssueState")) {
        return { body: { data: { issueUpdate: { success: true } } } };
      }
      if (req.query.includes("mutation CreateComment")) {
        return { body: { data: { commentCreate: { success: true } } } };
      }
      return { status: 400, body: { errors: [{ message: "unknown op" }] } };
    });
    tracker = new LinearTracker({
      apiKey: "test-key",
      projectSlug: "symphony",
      activeStates: ["Todo"],
      fetchImpl,
    });
  });

  it("fetches candidate issues shaped to the Issue interface", async () => {
    const issues = await tracker.fetchCandidateIssues();
    expect(issues).toEqual([
      {
        id: "issue-1",
        identifier: "BEN-1",
        title: "fix something",
        description: "broke",
        state: "Todo",
        labels: ["bug"],
        url: "https://linear.app/x/BEN-1",
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ Authorization: "test-key" });
  });

  it("resolves state names to ids and issues issueUpdate", async () => {
    await tracker.fetchCandidateIssues();
    await tracker.updateIssueState("issue-1", "Done");
    const calls = fetchImpl.mock.calls.map((c) => JSON.parse(c[1]!.body as string));
    expect(calls.some((b) => b.query.includes("query StatesForTeam"))).toBe(true);
    const update = calls.find((b) => b.query.includes("mutation UpdateIssueState"));
    expect(update?.variables).toEqual({ id: "issue-1", stateId: "state-done" });
  });

  it("caches the workflow state map per team", async () => {
    await tracker.fetchCandidateIssues();
    await tracker.updateIssueState("issue-1", "Done");
    await tracker.updateIssueState("issue-1", "Todo");
    const stateCalls = fetchImpl.mock.calls.filter((c) =>
      (JSON.parse(c[1]!.body as string) as { query: string }).query.includes("query StatesForTeam"),
    );
    expect(stateCalls).toHaveLength(1);
  });

  it("addComment posts commentCreate", async () => {
    await tracker.fetchCandidateIssues();
    await tracker.addComment("issue-1", "hello world");
    const comment = fetchImpl.mock.calls
      .map((c) => JSON.parse(c[1]!.body as string))
      .find((b) => b.query.includes("mutation CreateComment"));
    expect(comment?.variables).toEqual({ issueId: "issue-1", body: "hello world" });
  });

  it("raises LinearApiError on a GraphQL errors payload", async () => {
    const erroring = makeFetch(() => ({
      body: { errors: [{ message: "bad slug" }] },
    }));
    const t = new LinearTracker({
      apiKey: "k",
      projectSlug: "x",
      activeStates: ["Todo"],
      fetchImpl: erroring,
    });
    await expect(t.fetchCandidateIssues()).rejects.toBeInstanceOf(LinearApiError);
  });

  it("refuses to update state before fetch has populated the team cache", async () => {
    await expect(tracker.updateIssueState("unknown", "Done")).rejects.toThrow(/no team cached/);
  });

  it("refuses to construct without an apiKey", () => {
    expect(
      () =>
        new LinearTracker({
          apiKey: "",
          projectSlug: "x",
          activeStates: ["Todo"],
        }),
    ).toThrow(/LINEAR_API_KEY/);
  });
});
