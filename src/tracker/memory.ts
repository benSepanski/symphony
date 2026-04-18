import type { Issue, Tracker } from "./types.js";

export interface MemoryTrackerOptions {
  issues: Issue[];
  activeStates: string[];
}

export class MemoryTracker implements Tracker {
  private readonly issues: Map<string, Issue>;
  private readonly activeStates: Set<string>;
  private readonly comments: Map<string, string[]> = new Map();

  constructor(options: MemoryTrackerOptions) {
    this.issues = new Map(options.issues.map((i) => [i.id, { ...i }]));
    this.activeStates = new Set(options.activeStates);
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    return [...this.issues.values()]
      .filter((i) => this.activeStates.has(i.state))
      .sort((a, b) => a.identifier.localeCompare(b.identifier))
      .map((i) => ({ ...i }));
  }

  async updateIssueState(issueId: string, state: string): Promise<void> {
    const issue = this.issues.get(issueId);
    if (!issue) {
      throw new Error(`unknown issue id ${issueId}`);
    }
    issue.state = state;
  }

  async addComment(issueId: string, body: string): Promise<void> {
    if (!this.issues.has(issueId)) {
      throw new Error(`unknown issue id ${issueId}`);
    }
    const list = this.comments.get(issueId) ?? [];
    list.push(body);
    this.comments.set(issueId, list);
  }

  getComments(issueId: string): string[] {
    return [...(this.comments.get(issueId) ?? [])];
  }

  getIssue(issueId: string): Issue | undefined {
    const found = this.issues.get(issueId);
    return found ? { ...found } : undefined;
  }
}
