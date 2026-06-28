import type { DiffScopeItem } from "../../diff-scope/diffScopes.js";
import type { GitDiffSnapshot } from "../../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../../main-menu/menuItems.js";
import type { LintRunPhase } from "../lintAgent.js";
import { toDiffContextLines, toMarkdownBlockLines } from "./sharedPrompt.js";

export const LINT_AGENT_INSTRUCTIONS = [
  "You are a lint and verification agent running inside the review-this CLI.",
  "Your job is to run available project verification checks and report their status.",
  "Do not modify files in this lint step.",
  "Inspect package scripts and project conventions before choosing commands.",
  "Run typecheck when available.",
  "Run lint when available.",
  "Run tests when available.",
  "Run build when available.",
  "If a check is unavailable, mark it as skipped rather than failing the pipeline for that check alone.",
  "If any available check fails, the verdict must be fail.",
  "Do not fail solely because review findings are unresolved; the later fixing and PR gates handle review findings.",
  "Return Markdown only.",
  "Use exactly these top-level sections: Verification Summary, Checks, Verdict.",
  "Under Verdict, include exactly one line: `VERDICT: pass` or `VERDICT: fail`.",
].join("\n");

export function toLintPrompt(
  mode: MenuItem,
  diffScope: DiffScopeItem,
  diff: GitDiffSnapshot,
  phase: LintRunPhase = "pre-fix",
): string {
  const phaseDescription =
    phase === "post-fix"
      ? "Post-fix verification: validate the current working tree after the fix agent changed files."
      : "Initial verification: validate the current working tree before optional fixing.";

  return [
    ...toDiffContextLines(mode, diffScope, diff),
    "",
    phaseDescription,
    "",
    "Verification workflow:",
    "1. Inspect package scripts and lockfile/package manager.",
    "2. Run typecheck, lint, tests, and build when available.",
    "3. Mark unavailable checks as skipped.",
    "4. Use `VERDICT: pass` only if every available check passed.",
    "",
    ...toMarkdownBlockLines(
      phase === "post-fix" ? "Current git diff after fix:" : "Original git diff:",
      "diff",
      diff.patch,
      "(empty diff)",
    ),
    "",
    "Required Markdown structure:",
    "## Verification Summary",
    "- <brief summary>",
    "",
    "## Checks",
    "- typecheck: <passed|failed|skipped> - <command or reason>",
    "- lint: <passed|failed|skipped> - <command or reason>",
    "- test: <passed|failed|skipped> - <command or reason>",
    "- build: <passed|failed|skipped> - <command or reason>",
    "",
    "## Verdict",
    "VERDICT: <pass|fail>",
  ].join("\n");
}
