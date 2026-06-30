export type GitDiffStats = {
  readonly addedLines: number;
  readonly binaryFiles: number;
  readonly changedFiles: number;
  readonly commitCount?: number;
  readonly cwd: string;
  readonly removedLines: number;
};

export type GitDiffFileStat = {
  readonly addedLines: number;
  readonly binary: boolean;
  readonly path: string;
  readonly removedLines: number;
};

export type GitDiffOptions = {
  readonly paths?: readonly string[];
};

export type GitDiffSummary = {
  readonly files: readonly GitDiffFileStat[];
  readonly stats: GitDiffStats;
};

export type GitDiffSnapshot = {
  readonly patch: string;
  readonly stats: GitDiffStats;
};
