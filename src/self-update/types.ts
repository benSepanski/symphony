export interface SelfUpdateResult {
  repoPath: string;
  branch: string;
  headBefore: string;
  headAfter: string;
  changed: boolean;
  fetchedAt: string;
}

export interface SelfUpdater {
  maybeFetch(): Promise<SelfUpdateResult | null>;
}
