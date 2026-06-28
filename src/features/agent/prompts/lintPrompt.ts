import type { DiffScopeItem } from "../../diff-scope/diffScopes.js";
import type { GitDiffSnapshot } from "../../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../../main-menu/menuItems.js";
import type { AgentFixResult } from "../fixAgent.js";
import type { AgentReviewResult } from "../reviewAgent.js";
import { toDiffContextLines, toMarkdownBlockLines } from "./sharedPrompt.js";

export const LINT_AGENT_INSTRUCTIONS = [
  "You are a lint and verification agent running inside the rp CLI after review and optional fixing.",
  "Your job is to verify that the project is ready for a PR.",
  "Do not modify files in this lint step.",
  "Inspect package scripts and project conventions before choosing commands.",
  "Run typecheck when available.",
  "Run lint when available.",
  "Run tests when available.",
  "Run build when available.",
  "If a check is unavailable, mark it as skipped rather than failing the pipeline for that check alone.",
  "If any available check fails, the verdict must be fail.",
  "Return Markdown only.",
  "Use exactly these top-level sections: Verification Summary, Checks, Verdict.",
  "Under Verdict, include exactly one line: `VERDICT: pass` or `VERDICT: fail`.",
].join("\n");

export function toLintPrompt(
  mode: MenuItem,
  diffScope: DiffScopeItem,
  diff: GitDiffSnapshot,
  review: AgentReviewResult | undefined,
  fix: AgentFixResult | undefined,
  fixSkipped: boolean,
): string {
  return [
    ...toDiffContextLines(mode, diffScope, diff),
    `Fix skipped: ${fixSkipped ? "yes" : "no"}`,
    "",
    "Verification workflow:",
    "1. Inspect package scripts and lockfile/package manager.",
    "2. Run typecheck, lint, tests, and build when available.",
    "3. Mark unavailable checks as skipped.",
    "4. Use `VERDICT: pass` only if every available check passed and there are no unresolved review findings in the fix output.",
    "",
    ...toMarkdownBlockLines(
      "Review output:",
      "markdown",
      review?.output,
      "(no review output)",
    ),
    "",
    ...toMarkdownBlockLines(
      "Fix output:",
      "markdown",
      fix?.output,
      "(no fix output)",
    ),
    "",
    ...toMarkdownBlockLines(
      "Original git diff:",
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
