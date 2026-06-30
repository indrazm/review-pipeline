import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { DIFF_SCOPE_ITEMS, type DiffScopeId } from "../diff-scope/index.js";
import { getGitDiff, getGitDiffSummary } from "./service.js";

const execFileAsync = promisify(execFile);

test("current changes summary includes tracked and untracked files and supports path filtering", async () => {
  const cwd = await createRepo();

  try {
    await writeFile(join(cwd, "a.txt"), "one\ntwo\n");
    await writeFile(join(cwd, "c.txt"), "new\nfile\n");

    const summary = await getGitDiffSummary(cwd, diffScope("current-changes"));

    assert.deepEqual(
      summary.files.map((file) => file.path),
      ["a.txt", "c.txt"],
    );
    assert.equal(summary.stats.changedFiles, 2);
    assert.equal(summary.stats.addedLines, 3);

    const filteredDiff = await getGitDiff(cwd, diffScope("current-changes"), {
      paths: ["a.txt"],
    });

    assert.equal(filteredDiff.stats.changedFiles, 1);
    assert.match(filteredDiff.patch, /a\.txt/);
    assert.doesNotMatch(filteredDiff.patch, /c\.txt/);
  } finally {
    await removeRepo(cwd);
  }
});

test("staged changes summary excludes unstaged changes", async () => {
  const cwd = await createRepo();

  try {
    await writeFile(join(cwd, "a.txt"), "one\nunstaged\n");
    await writeFile(join(cwd, "b.txt"), "base\nstaged\n");
    await git(cwd, ["add", "b.txt"]);

    const summary = await getGitDiffSummary(cwd, diffScope("staged-changes"));

    assert.deepEqual(
      summary.files.map((file) => file.path),
      ["b.txt"],
    );
    assert.equal(summary.stats.changedFiles, 1);
    assert.equal(summary.stats.addedLines, 1);
  } finally {
    await removeRepo(cwd);
  }
});

test("branch against main summary includes commit count", async () => {
  const cwd = await createRepo();

  try {
    await git(cwd, ["checkout", "-b", "feature"]);
    await writeFile(join(cwd, "a.txt"), "one\nbranch\n");
    await git(cwd, ["add", "a.txt"]);
    await git(cwd, ["commit", "-m", "feature change"]);

    const summary = await getGitDiffSummary(
      cwd,
      diffScope("branch-against-main"),
    );

    assert.equal(summary.stats.commitCount, 1);
    assert.deepEqual(
      summary.files.map((file) => file.path),
      ["a.txt"],
    );
  } finally {
    await removeRepo(cwd);
  }
});

function diffScope(id: DiffScopeId) {
  const scope = DIFF_SCOPE_ITEMS.find((item) => item.id === id);

  if (scope === undefined) {
    throw new Error(`Unknown diff scope: ${id}`);
  }

  return scope;
}

async function createRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "review-this-"));

  await git(cwd, ["init", "-b", "main"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
  await writeFile(join(cwd, "a.txt"), "one\n");
  await writeFile(join(cwd, "b.txt"), "base\n");
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", "initial"]);

  return cwd;
}

async function removeRepo(cwd: string): Promise<void> {
  await rm(cwd, {
    force: true,
    recursive: true,
  });
}

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args]);
}

