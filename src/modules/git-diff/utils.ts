import type { GitDiffStats } from "./types.js";

export function parseGitNumstat(output: string): Omit<GitDiffStats, "cwd"> {
  let addedLines = 0;
  let binaryFiles = 0;
  let changedFiles = 0;
  let removedLines = 0;

  for (const line of output.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }

    const [added, removed] = line.split("\t");

    changedFiles += 1;

    if (added === "-" || removed === "-") {
      binaryFiles += 1;
      continue;
    }

    addedLines += Number.parseInt(added, 10);
    removedLines += Number.parseInt(removed, 10);
  }

  return {
    addedLines,
    binaryFiles,
    changedFiles,
    removedLines,
  };
}

