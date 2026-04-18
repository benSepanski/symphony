export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  labels: string[];
  url: string;
}

export interface Tracker {
  fetchCandidateIssues(): Promise<Issue[]>;
  updateIssueState(issueId: string, state: string): Promise<void>;
  addComment(issueId: string, body: string): Promise<void>;
}
