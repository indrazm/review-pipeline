import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";

const execFileAsync = promisify(execFile);

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

type GitDiffTarget = {
  readonly baseRef?: string;
  readonly hasHead: boolean;
  readonly scope: DiffScopeItem["id"];
};

export async function getGitDiffStats(
  cwd: string,
  scope: DiffScopeItem,
): Promise<GitDiffStats> {
  const target = await getGitDiffTarget(cwd, scope);
  const [trackedNumstat, untrackedNumstat, commitCount] = await Promise.all([
    runGit(cwd, buildGitDiffArgs(target, "--numstat")),
    getExtraNumstat(cwd, target),
    getCommitCount(cwd, target),
  ]);

  return toGitDiffStats(
    cwd,
    joinGitOutputs([trackedNumstat.stdout, untrackedNumstat]),
    commitCount,
  );
}

export async function getGitDiff(
  cwd: string,
  scope: DiffScopeItem,
): Promise<GitDiffSnapshot> {
  const target = await getGitDiffTarget(cwd, scope);
  const [
    trackedNumstat,
    trackedPatch,
    untrackedNumstat,
    untrackedPatch,
    commitCount,
  ] = await Promise.all([
    runGit(cwd, buildGitDiffArgs(target, "--numstat")),
    runGit(cwd, buildGitDiffArgs(target)),
    getExtraNumstat(cwd, target),
    getExtraPatch(cwd, target),
    getCommitCount(cwd, target),
  ]);

  return {
    patch: joinGitOutputs([trackedPatch.stdout, untrackedPatch]),
    stats: toGitDiffStats(
      cwd,
      joinGitOutputs([trackedNumstat.stdout, untrackedNumstat]),
      commitCount,
    ),
  };
}

function toGitDiffStats(
  cwd: string,
  numstat: string,
  commitCount?: number,
): GitDiffStats {
  return {
    cwd,
    ...(commitCount === undefined ? {} : { commitCount }),
    ...parseGitNumstat(numstat),
  };
}

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

async function assertGitWorkTree(cwd: string): Promise<void> {
  const { stdout } = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);

  if (stdout.trim() !== "true") {
    throw new Error(`${cwd} is not inside a git work tree`);
  }
}

async function getGitDiffTarget(
  cwd: string,
  scope: DiffScopeItem,
): Promise<GitDiffTarget> {
  await assertGitWorkTree(cwd);

  const hasHead = await hasGitHead(cwd);

  if (scope.id === "branch-against-main") {
    if (!hasHead) {
      throw new Error("Current branch against main requires a git HEAD commit");
    }

    return {
      baseRef: await resolveMainRef(cwd),
      hasHead,
      scope: scope.id,
    };
  }

  return {
    hasHead,
    scope: scope.id,
  };
}

async function hasGitHead(cwd: string): Promise<boolean> {
  try {
    await runGit(cwd, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

async function resolveMainRef(cwd: string): Promise<string> {
  for (const ref of ["main", "origin/main"]) {
    if (await hasGitRef(cwd, ref)) {
      return ref;
    }
  }

  throw new Error("Could not find main or origin/main for branch comparison");
}

async function hasGitRef(cwd: string, ref: string): Promise<boolean> {
  try {
    await runGit(cwd, ["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

async function getExtraNumstat(
  cwd: string,
  target: GitDiffTarget,
): Promise<string> {
  if (target.scope !== "current-changes") {
    return "";
  }

  return getUntrackedNumstat(cwd);
}

async function getExtraPatch(
  cwd: string,
  target: GitDiffTarget,
): Promise<string> {
  if (target.scope !== "current-changes") {
    return "";
  }

  return getUntrackedPatch(cwd);
}

async function getCommitCount(
  cwd: string,
  target: GitDiffTarget,
): Promise<number | undefined> {
  if (target.scope !== "branch-against-main") {
    return undefined;
  }

  if (target.baseRef === undefined) {
    throw new Error("Branch diff target is missing a base ref");
  }

  const { stdout } = await runGit(cwd, [
    "rev-list",
    "--count",
    `${target.baseRef}..HEAD`,
  ]);

  return Number.parseInt(stdout.trim(), 10);
}

async function getUntrackedNumstat(cwd: string): Promise<string> {
  return getUntrackedDiff(cwd, "--numstat");
}

async function getUntrackedPatch(cwd: string): Promise<string> {
  return getUntrackedDiff(cwd);
}

async function getUntrackedDiff(
  cwd: string,
  format?: "--numstat",
): Promise<string> {
  const paths = await getUntrackedPaths(cwd);
  const outputs = await Promise.all(
    paths.map((path) => runNoIndexDiff(cwd, path, format)),
  );

  return joinGitOutputs(outputs);
}

async function getUntrackedPaths(cwd: string): Promise<string[]> {
  const { stdout } = await runGit(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ".",
  ]);

  return stdout.split("\0").filter((path) => path.length > 0);
}

function buildGitDiffArgs(
  target: GitDiffTarget,
  format?: "--numstat",
): readonly string[] {
  if (target.scope === "branch-against-main") {
    if (target.baseRef === undefined) {
      throw new Error("Branch diff target is missing a base ref");
    }

    return format === undefined
      ? ["diff", `${target.baseRef}...HEAD`, "--", "."]
      : ["diff", format, `${target.baseRef}...HEAD`, "--", "."];
  }

  if (target.scope === "staged-changes") {
    return target.hasHead
      ? format === undefined
        ? ["diff", "--cached", "HEAD", "--", "."]
        : ["diff", "--cached", format, "HEAD", "--", "."]
      : format === undefined
        ? ["diff", "--cached", "--", "."]
        : ["diff", "--cached", format, "--", "."];
  }

  if (target.hasHead) {
    return format === undefined
      ? ["diff", "HEAD", "--", "."]
      : ["diff", format, "HEAD", "--", "."];
  }

  return format === undefined
    ? ["diff", "--", "."]
    : ["diff", format, "--", "."];
}

async function runGit(cwd: string, args: readonly string[]) {
  return execFileAsync("git", ["-C", cwd, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function runNoIndexDiff(
  cwd: string,
  path: string,
  format?: "--numstat",
): Promise<string> {
  const args =
    format === undefined
      ? ["diff", "--no-index", "--", "/dev/null", path]
      : ["diff", "--no-index", format, "--", "/dev/null", path];

  try {
    const { stdout } = await runGit(cwd, args);

    return stdout;
  } catch (error) {
    if (isExpectedNoIndexDiff(error)) {
      return error.stdout;
    }

    throw error;
  }
}

function isExpectedNoIndexDiff(
  error: unknown,
): error is { readonly code: 1; readonly stdout: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "stdout" in error &&
    error.code === 1 &&
    typeof error.stdout === "string"
  );
}

function joinGitOutputs(outputs: readonly string[]): string {
  return outputs
    .map((output) => output.trimEnd())
    .filter((output) => output.length > 0)
    .join("\n");
}
