export type GitDiffStats = {
  readonly addedLines: number;
  readonly binaryFiles: number;
  readonly changedFiles: number;
  readonly commitCount?: number;
  readonly cwd: string;
  readonly removedLines: number;
};

export type GitDiffSnapshot = {
  readonly patch: string;
  readonly stats: GitDiffStats;
};

