import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffScopeItem } from "../diff-scope/index.js";
import type {
  GitDiffOptions,
  GitDiffSnapshot,
  GitDiffStats,
  GitDiffSummary,
} from "./types.js";
import {
  aggregateGitDiffFileStats,
  parseGitNumstatFiles,
} from "./utils.js";

const execFileAsync = promisify(execFile);

type GitDiffTarget = {
  readonly baseRef?: string;
  readonly hasHead: boolean;
  readonly scope: DiffScopeItem["id"];
};

export async function getGitDiffStats(
  cwd: string,
  scope: DiffScopeItem,
  options: GitDiffOptions = {},
): Promise<GitDiffStats> {
  return (await getGitDiffSummary(cwd, scope, options)).stats;
}

export async function getGitDiffSummary(
  cwd: string,
  scope: DiffScopeItem,
  options: GitDiffOptions = {},
): Promise<GitDiffSummary> {
  const target = await getGitDiffTarget(cwd, scope);
  const paths = normalizeDiffPaths(options.paths);

  if (paths !== undefined && paths.length === 0) {
    return toGitDiffSummary(cwd, "", await getCommitCount(cwd, target));
  }

  const [trackedNumstat, untrackedNumstat, commitCount] = await Promise.all([
    runGit(cwd, buildGitDiffArgs(target, "--numstat", paths)),
    getExtraNumstat(cwd, target, paths),
    getCommitCount(cwd, target),
  ]);

  return toGitDiffSummary(
    cwd,
    joinGitOutputs([trackedNumstat.stdout, untrackedNumstat]),
    commitCount,
  );
}

export async function getGitDiff(
  cwd: string,
  scope: DiffScopeItem,
  options: GitDiffOptions = {},
): Promise<GitDiffSnapshot> {
  const target = await getGitDiffTarget(cwd, scope);
  const paths = normalizeDiffPaths(options.paths);

  if (paths !== undefined && paths.length === 0) {
    return {
      patch: "",
      stats: toGitDiffSummary(cwd, "", await getCommitCount(cwd, target)).stats,
    };
  }

  const [
    trackedNumstat,
    trackedPatch,
    untrackedNumstat,
    untrackedPatch,
    commitCount,
  ] = await Promise.all([
    runGit(cwd, buildGitDiffArgs(target, "--numstat", paths)),
    runGit(cwd, buildGitDiffArgs(target, undefined, paths)),
    getExtraNumstat(cwd, target, paths),
    getExtraPatch(cwd, target, paths),
    getCommitCount(cwd, target),
  ]);

  const summary = toGitDiffSummary(
    cwd,
    joinGitOutputs([trackedNumstat.stdout, untrackedNumstat]),
    commitCount,
  );

  return {
    patch: joinGitOutputs([trackedPatch.stdout, untrackedPatch]),
    stats: summary.stats,
  };
}

function toGitDiffSummary(
  cwd: string,
  numstat: string,
  commitCount?: number,
): GitDiffSummary {
  const files = parseGitNumstatFiles(numstat);

  return {
    files,
    stats: {
      cwd,
      ...(commitCount === undefined ? {} : { commitCount }),
      ...aggregateGitDiffFileStats(files),
    },
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
  paths: readonly string[] | undefined,
): Promise<string> {
  if (target.scope !== "current-changes") {
    return "";
  }

  return getUntrackedNumstat(cwd, paths);
}

async function getExtraPatch(
  cwd: string,
  target: GitDiffTarget,
  paths: readonly string[] | undefined,
): Promise<string> {
  if (target.scope !== "current-changes") {
    return "";
  }

  return getUntrackedPatch(cwd, paths);
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

async function getUntrackedNumstat(
  cwd: string,
  paths: readonly string[] | undefined,
): Promise<string> {
  return getUntrackedDiff(cwd, "--numstat", paths);
}

async function getUntrackedPatch(
  cwd: string,
  paths: readonly string[] | undefined,
): Promise<string> {
  return getUntrackedDiff(cwd, undefined, paths);
}

async function getUntrackedDiff(
  cwd: string,
  format?: "--numstat",
  paths?: readonly string[] | undefined,
): Promise<string> {
  const untrackedPaths = await getUntrackedPaths(cwd, paths);
  const outputs = await Promise.all(
    untrackedPaths.map((path) => runNoIndexDiff(cwd, path, format)),
  );

  return joinGitOutputs(outputs);
}

async function getUntrackedPaths(
  cwd: string,
  paths: readonly string[] | undefined,
): Promise<string[]> {
  const { stdout } = await runGit(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ...toGitPathspecs(paths),
  ]);

  return stdout.split("\0").filter((path) => path.length > 0);
}

function buildGitDiffArgs(
  target: GitDiffTarget,
  format?: "--numstat",
  paths?: readonly string[] | undefined,
): readonly string[] {
  const pathspecs = toGitPathspecs(paths);

  if (target.scope === "branch-against-main") {
    if (target.baseRef === undefined) {
      throw new Error("Branch diff target is missing a base ref");
    }

    return format === undefined
      ? ["diff", `${target.baseRef}...HEAD`, "--", ...pathspecs]
      : ["diff", format, `${target.baseRef}...HEAD`, "--", ...pathspecs];
  }

  if (target.scope === "staged-changes") {
    return target.hasHead
      ? format === undefined
        ? ["diff", "--cached", "HEAD", "--", ...pathspecs]
        : ["diff", "--cached", format, "HEAD", "--", ...pathspecs]
      : format === undefined
        ? ["diff", "--cached", "--", ...pathspecs]
        : ["diff", "--cached", format, "--", ...pathspecs];
  }

  if (target.hasHead) {
    return format === undefined
      ? ["diff", "HEAD", "--", ...pathspecs]
      : ["diff", format, "HEAD", "--", ...pathspecs];
  }

  return format === undefined
    ? ["diff", "--", ...pathspecs]
    : ["diff", format, "--", ...pathspecs];
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

function normalizeDiffPaths(
  paths: readonly string[] | undefined,
): readonly string[] | undefined {
  if (paths === undefined) {
    return undefined;
  }

  return [...new Set(paths.map((path) => path.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function toGitPathspecs(paths: readonly string[] | undefined): readonly string[] {
  return paths === undefined ? ["."] : paths;
}
