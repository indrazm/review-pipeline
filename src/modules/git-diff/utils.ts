import type { GitDiffFileStat, GitDiffStats } from "./types.js";

export function parseGitNumstat(output: string): Omit<GitDiffStats, "cwd"> {
  return aggregateGitDiffFileStats(parseGitNumstatFiles(output));
}

export function parseGitNumstatFiles(output: string): readonly GitDiffFileStat[] {
  const files: GitDiffFileStat[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }

    const [added, removed, ...pathParts] = line.split("\t");
    const path = normalizeNumstatPath(pathParts.join("\t"));

    if (path.length === 0) {
      continue;
    }

    const binary = added === "-" || removed === "-";

    files.push({
      addedLines: binary ? 0 : Number.parseInt(added, 10),
      binary,
      path,
      removedLines: binary ? 0 : Number.parseInt(removed, 10),
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeNumstatPath(path: string): string {
  const trimmedPath = path.trim();
  const addedPath = trimmedPath.match(/^\/dev\/null => (.+)$/);

  if (addedPath?.[1] !== undefined) {
    return addedPath[1].trim();
  }

  const removedPath = trimmedPath.match(/^(.+) => \/dev\/null$/);

  if (removedPath?.[1] !== undefined) {
    return removedPath[1].trim();
  }

  return trimmedPath;
}

export function aggregateGitDiffFileStats(
  files: readonly GitDiffFileStat[],
): Omit<GitDiffStats, "cwd"> {
  let addedLines = 0;
  let binaryFiles = 0;
  let removedLines = 0;

  for (const file of files) {
    if (file.binary) {
      binaryFiles += 1;
      continue;
    }

    addedLines += file.addedLines;
    removedLines += file.removedLines;
  }

  return {
    addedLines,
    binaryFiles,
    changedFiles: files.length,
    removedLines,
  };
}
