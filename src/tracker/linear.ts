import type { Issue, Tracker } from "./types.js";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface LinearTrackerOptions {
  apiKey: string;
  projectSlug: string;
  activeStates: string[];
  endpoint?: string;
  fetchImpl?: FetchLike;
}

interface GqlIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  labels?: { nodes: Array<{ name: string }> };
  state: { id: string; name: string };
  team: { id: string };
}

interface GqlIssuesResponse {
  data?: { issues: { nodes: GqlIssueNode[] } };
  errors?: Array<{ message: string }>;
}

interface GqlWorkflowStatesResponse {
  data?: {
    workflowStates: {
      nodes: Array<{ id: string; name: string; team: { id: string } }>;
    };
  };
  errors?: Array<{ message: string }>;
}

interface GqlIssueUpdateResponse {
  data?: { issueUpdate: { success: boolean } };
  errors?: Array<{ message: string }>;
}

interface GqlCommentCreateResponse {
  data?: { commentCreate: { success: boolean } };
  errors?: Array<{ message: string }>;
}

const DEFAULT_ENDPOINT = "https://api.linear.app/graphql";

const ISSUES_QUERY = `
  query IssuesForProject($slug: String!, $states: [String!]!) {
    issues(
      filter: {
        project: { slugId: { eq: $slug } }
        state: { name: { in: $states } }
      }
      first: 100
    ) {
      nodes {
        id
        identifier
        title
        description
        url
        labels { nodes { name } }
        state { id name }
        team { id }
      }
    }
  }
`;

const STATES_QUERY = `
  query StatesForTeam($teamId: ID!) {
    workflowStates(filter: { team: { id: { eq: $teamId } } }, first: 200) {
      nodes { id name team { id } }
    }
  }
`;

const ISSUE_UPDATE_MUTATION = `
  mutation UpdateIssueState($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) { success }
  }
`;

const COMMENT_CREATE_MUTATION = `
  mutation CreateComment($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) { success }
  }
`;

export class LinearApiError extends Error {
  constructor(
    readonly operation: string,
    readonly errors: Array<{ message: string }>,
  ) {
    super(`Linear ${operation} failed: ${errors.map((e) => e.message).join("; ")}`);
    this.name = "LinearApiError";
  }
}

export class LinearTracker implements Tracker {
  private readonly endpoint: string;
  private readonly fetchImpl: FetchLike;
  private readonly headers: Record<string, string>;
  private readonly projectSlug: string;
  private readonly activeStates: string[];
  private stateIdByTeam: Map<string, Map<string, string>> = new Map();
  private teamByIssue: Map<string, string> = new Map();

  constructor(options: LinearTrackerOptions) {
    if (!options.apiKey) {
      throw new Error("LinearTracker requires an apiKey (LINEAR_API_KEY)");
    }
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.projectSlug = options.projectSlug;
    this.activeStates = [...options.activeStates];
    this.headers = {
      "Content-Type": "application/json",
      Authorization: options.apiKey,
    };
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    const body = await this.gql<GqlIssuesResponse>("issues", {
      query: ISSUES_QUERY,
      variables: { slug: this.projectSlug, states: this.activeStates },
    });
    const nodes = body.data?.issues.nodes ?? [];
    return nodes.map((n) => {
      this.teamByIssue.set(n.id, n.team.id);
      return {
        id: n.id,
        identifier: n.identifier,
        title: n.title,
        description: n.description,
        state: n.state.name,
        labels: (n.labels?.nodes ?? []).map((l) => l.name),
        url: n.url,
      };
    });
  }

  async updateIssueState(issueId: string, state: string): Promise<void> {
    const teamId = this.teamByIssue.get(issueId);
    if (!teamId) {
      throw new Error(
        `LinearTracker has no team cached for ${issueId}; call fetchCandidateIssues first`,
      );
    }
    const stateId = await this.resolveStateId(teamId, state);
    const body = await this.gql<GqlIssueUpdateResponse>("issueUpdate", {
      query: ISSUE_UPDATE_MUTATION,
      variables: { id: issueId, stateId },
    });
    if (!body.data?.issueUpdate.success) {
      throw new LinearApiError("issueUpdate", [{ message: "mutation returned success=false" }]);
    }
  }

  async addComment(issueId: string, body: string): Promise<void> {
    const res = await this.gql<GqlCommentCreateResponse>("commentCreate", {
      query: COMMENT_CREATE_MUTATION,
      variables: { issueId, body },
    });
    if (!res.data?.commentCreate.success) {
      throw new LinearApiError("commentCreate", [{ message: "mutation returned success=false" }]);
    }
  }

  private async resolveStateId(teamId: string, name: string): Promise<string> {
    let cache = this.stateIdByTeam.get(teamId);
    if (!cache) {
      const body = await this.gql<GqlWorkflowStatesResponse>("workflowStates", {
        query: STATES_QUERY,
        variables: { teamId },
      });
      cache = new Map();
      for (const n of body.data?.workflowStates.nodes ?? []) {
        cache.set(n.name, n.id);
      }
      this.stateIdByTeam.set(teamId, cache);
    }
    const id = cache.get(name);
    if (!id) {
      throw new Error(`no Linear workflow state named ${JSON.stringify(name)} on team ${teamId}`);
    }
    return id;
  }

  private async gql<T extends { errors?: Array<{ message: string }> }>(
    operation: string,
    body: { query: string; variables: Record<string, unknown> },
  ): Promise<T> {
    const res = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LinearApiError(operation, [
        { message: `HTTP ${res.status}: ${text.slice(0, 200)}` },
      ]);
    }
    const parsed = (await res.json()) as T;
    if (parsed.errors && parsed.errors.length > 0) {
      throw new LinearApiError(operation, parsed.errors);
    }
    return parsed;
  }
}
