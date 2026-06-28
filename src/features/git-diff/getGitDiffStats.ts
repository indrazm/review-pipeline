import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitDiffStats = {
  readonly addedLines: number;
  readonly binaryFiles: number;
  readonly changedFiles: number;
  readonly cwd: string;
  readonly removedLines: number;
};

export type GitDiffSnapshot = {
  readonly patch: string;
  readonly stats: GitDiffStats;
};

type GitDiffTarget = {
  readonly hasHead: boolean;
};

export async function getGitDiffStats(cwd = process.cwd()): Promise<GitDiffStats> {
  const target = await getGitDiffTarget(cwd);
  const [trackedNumstat, untrackedNumstat] = await Promise.all([
    runGit(cwd, buildGitDiffArgs(target, "--numstat")),
    getUntrackedNumstat(cwd),
  ]);

  return toGitDiffStats(cwd, joinGitOutputs([trackedNumstat.stdout, untrackedNumstat]));
}

export async function getGitDiff(cwd = process.cwd()): Promise<GitDiffSnapshot> {
  const target = await getGitDiffTarget(cwd);
  const [trackedNumstat, trackedPatch, untrackedNumstat, untrackedPatch] = await Promise.all([
    runGit(cwd, buildGitDiffArgs(target, "--numstat")),
    runGit(cwd, buildGitDiffArgs(target)),
    getUntrackedNumstat(cwd),
    getUntrackedPatch(cwd),
  ]);

  return {
    patch: joinGitOutputs([trackedPatch.stdout, untrackedPatch]),
    stats: toGitDiffStats(cwd, joinGitOutputs([trackedNumstat.stdout, untrackedNumstat])),
  };
}

function toGitDiffStats(cwd: string, numstat: string): GitDiffStats {
  return {
    cwd,
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

async function getGitDiffTarget(cwd: string): Promise<GitDiffTarget> {
  await assertGitWorkTree(cwd);

  return {
    hasHead: await hasGitHead(cwd),
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
