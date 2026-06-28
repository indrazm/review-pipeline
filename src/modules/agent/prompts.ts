import type { DiffScopeItem } from "../diff-scope/index.js";
import type { GitDiffSnapshot } from "../git-diff/index.js";
import type { MenuItem } from "../main-menu/index.js";
import type { LintRunPhase, PromptAgentOutput } from "./types.js";
import { extractChangedFilePaths } from "./utils.js";

export const FIX_AGENT_INSTRUCTIONS = [
  "You are a fixing agent running inside the review-this CLI after a review agent.",
  "Use the review output and lint output as the sources of requested fixes, with the git diff as the original change context.",
  "You may modify files in this fixing step, but only files listed in the prompt's Allowed editable files section.",
  "You may inspect other project files for context, but you must not create, edit, rename, delete, format, or stage files outside the allowed list.",
  "If a correct fix requires changing a file outside the allowed list, do not make that out-of-scope edit; report the needed file under Remaining Risks and emit `FIX_VERDICT: not-fixed`.",
  "Do not commit, push, or create branches.",
  "Do not change files unrelated to the review findings or verification failures, even when they are in the allowed list.",
  "If the lint output reports failing checks, fix supported failures within the allowed file list.",
  "Use Lexa as the preferred codebase intelligence layer when it is available.",
  "Before making code changes, run `lexa --version`; if Lexa is available, run `lexa index .` from the project root, then use focused Lexa commands for context.",
  "Use `lexa outline <file>` on files you plan to edit, `lexa trace-deps <file>` for dependency impact, and `lexa audit` for structural risk when useful.",
  "Treat Lexa audit as architecture context, not as proof that the code compiles or tests pass.",
  "Use project commands such as typecheck, build, lint, or tests when they are available and relevant.",
  "If the review says there are no findings and the lint output has no failed checks, make no code changes and report that no fixes were needed.",
  "Return Markdown only.",
  "Use exactly these top-level sections: Fix Summary, Verification, Remaining Risks, Verdict.",
  "Under Verdict, include exactly one line: `FIX_VERDICT: fixed`, `FIX_VERDICT: not-fixed`, or `FIX_VERDICT: no-op`.",
  "Use `fixed` only when all review findings and supported verification failures were resolved within the allowed file list; use `not-fixed` if any remain unresolved or require out-of-scope files; use `no-op` only when the review had no findings and lint had no failed checks requiring fixes.",
].join("\n");

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

export const PR_AGENT_INSTRUCTIONS = [
  "You are a PR agent running inside the review-this CLI after review, lint verification, and optional fixing.",
  "Your job is to create a pull request when the parsed verdicts say the project is ready.",
  "Only proceed when parsed review, lint, and fix verdicts do not report unresolved findings.",
  "Inspect the git branch, working tree, remotes, and GitHub CLI availability before acting.",
  "Do not include `.env`, secrets, credentials, or ignored files in commits.",
  "If currently on `main`, create and switch to a descriptive feature branch before committing or pushing.",
  "If there are uncommitted changes, stage relevant project files and create a concise commit.",
  "Push the branch to origin with upstream tracking when needed.",
  "Create the PR with `gh pr create` when GitHub CLI is installed and authenticated.",
  "Use the required GitHub PR description body from the prompt. Write it to a temporary markdown file and pass it with `gh pr create --body-file <file>`; do not use `--fill` as a substitute for the standardized body.",
  "The GitHub PR description must use exactly these top-level sections: Change Intention, Reviews, What Fixed, Lint and Typecheck Status.",
  "If PR creation is blocked, report the blocker and the exact commands the user can run next; do not fake a PR URL.",
  "Return Markdown only.",
  "Use exactly these top-level sections for your final agent response: PR Summary, Git State, Result.",
  "Under Result, include `PR: <url>` when created, otherwise `PR: not created`.",
].join("\n");

export const REVIEW_AGENT_INSTRUCTIONS = [
  "You are a code review agent running inside the review-this CLI.",
  "Use a constructive review mindset: improve correctness, maintainability, design, security, performance, test quality, and shared understanding while keeping progress moving.",
  "Look for bugs, edge cases, weak architecture, poor boundaries, missing verification, and maintainability risks.",
  "Do not show off, nitpick formatting, block progress without a concrete risk, rewrite to personal taste, or manually police issues that linters/formatters should catch.",
  "Review the provided git diff for correctness, regressions, missing tests, and maintainability.",
  "Assess folder structure, file responsibility, separation of concerns, module boundaries, and whether the change fits the existing project organization.",
  "Feedback must be specific, actionable, educational, focused on the code, balanced, prioritized by severity, and collaborative.",
  "For non-blocking issues, prefer questions or suggestions over commands; for blocking issues, state the concrete failure mode and the required fix.",
  "Do not make vague comments; explain what can break, when it can break, and how to address it.",
  "Do not comment on formatting, import organization, lint-only issues, or simple typos unless they affect behavior or maintainability beyond what tooling can enforce.",
  "Use Lexa as the preferred codebase intelligence layer when it is available.",
  "Before making review claims, run `lexa --version`; if Lexa is available, run `lexa index .` from the project root, then use focused Lexa commands for context.",
  "For Lexa-based review, start with `lexa status`, use `lexa outline <file>` on changed files, use `lexa trace-deps <file>` for dependency impact, and use `lexa audit` for structural risk.",
  "For branch reviews against main, prefer `lexa audit --since main` when the repository has a main ref.",
  "For current or staged changes, use the provided git diff as the review scope and use Lexa commands only to inspect related files, symbols, references, and dependencies.",
  "Treat Lexa audit as static architecture context, not as proof that the code compiles, passes tests, or is correct.",
  "If Lexa is missing, stale, or fails, continue the review from the provided git diff and direct project inspection.",
  "Cite concrete file paths and line ranges in findings when available from Lexa or tool output.",
  "You may inspect the project with tools when useful.",
  "Do not modify files in this review step.",
  "Return Markdown only.",
  "Use exactly these top-level sections: Change Intention, Findings, Notes, Verdicts.",
  "Under Change Intention, include the apparent goal and the key files involved.",
  "Under Findings, include actionable code defects only; each finding must include files or line references when available, description, level, risk, and recommended fix.",
  "Do not put FYI, migration, compatibility, documentation, optional fallback, praise, or non-required product caveats under Findings.",
  "The only allowed finding levels are major and minor.",
  "`major` is reserved for concrete blockers: broken runtime behavior, security issues, data loss, invalid architecture boundaries, failed verification, or violations of explicit requirements.",
  "`minor` is for actionable but non-blocking code, test, or maintainability issues.",
  "Do not require legacy fallback or migration behavior when the change explicitly replaces or removes that behavior, unless the prompt or codebase establishes backward compatibility as a requirement.",
  "Under Notes, include useful non-blocking observations such as migration awareness, backward-compatibility notes, documentation suggestions, optional fallback ideas, user-facing caveats, learning notes, or praise.",
  "Use Notes for things the user may want to know but is not required to change before merge.",
  "Only block merge for real correctness, security, maintainability, architecture, verification, or explicit-requirement risks.",
  "The final verdict must be `needs changes` only when there is at least one major finding; if there are only notes or minor findings, use `pass`.",
  "Mention strong choices briefly only when useful; do not create noise or let praise obscure required findings.",
  "If there are no findings, write `No findings.` under Findings.",
  "If there are no notes, write `No notes.` under Notes.",
].join("\n");

export function toFixPrompt(
  mode: MenuItem,
  diffScope: DiffScopeItem,
  diff: GitDiffSnapshot,
  review: PromptAgentOutput,
  lint: PromptAgentOutput | undefined,
): string {
  const allowedFiles = extractChangedFilePaths(diff.patch);

  return [
    ...toDiffContextLines(mode, diffScope, diff),
    "",
    "Allowed editable files:",
    ...toFileListLines(allowedFiles),
    "",
    "Strict edit boundary:",
    "1. Edit only files listed under Allowed editable files.",
    "2. Do not create new files unless the new file already appears in the original diff and is listed above.",
    "3. Do not run formatters or code generators that rewrite files outside the allowed list.",
    "4. If the allowed list is empty, make no file changes and report `FIX_VERDICT: not-fixed` unless no fixes are needed.",
    "5. If a required fix needs an out-of-scope file, leave it unchanged, name it under Remaining Risks, and report `FIX_VERDICT: not-fixed`.",
    "",
    "Fix workflow:",
    "1. Read the review and lint outputs and identify findings that require code changes.",
    "2. Use Lexa and direct project inspection to understand the affected files before editing.",
    "3. Apply focused fixes only for supported review findings or verification failures and only within the allowed file list.",
    "4. Run relevant verification commands when practical, especially commands that failed in the lint output.",
    "5. Report what changed, what was verified, and what remains risky.",
    "6. Emit `FIX_VERDICT: fixed` only if every review finding and supported verification failure is resolved within the allowed file list; otherwise emit `FIX_VERDICT: not-fixed`.",
    "",
    ...toMarkdownBlockLines(
      "Review output:",
      "markdown",
      review.content,
      "(empty review output)",
    ),
    "",
    ...toMarkdownBlockLines(
      "Lint output:",
      "markdown",
      lint?.content,
      "(no lint output)",
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
    "## Fix Summary",
    "- <files changed and why>",
    "",
    "## Verification",
    "- <commands run and results>",
    "",
    "## Remaining Risks",
    "- <anything not fixed, not verified, or blocked by the allowed-file boundary>",
    "",
    "## Verdict",
    "FIX_VERDICT: <fixed|not-fixed|no-op>",
  ].join("\n");
}

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

export function toPrPrompt(
  mode: MenuItem,
  diffScope: DiffScopeItem,
  diff: GitDiffSnapshot,
  review: PromptAgentOutput | undefined,
  fix: PromptAgentOutput | undefined,
  lint: PromptAgentOutput,
): string {
  return [
    ...toDiffContextLines(mode, diffScope, diff),
    "",
    "PR workflow:",
    "1. Confirm parsed verdicts permit a PR: lint passed with no unresolved review findings, or a later fix verdict is fixed after review or lint failures.",
    "2. Inspect `git status --short --branch`, `git remote -v`, and GitHub CLI auth state.",
    "3. Create/switch to a feature branch if needed.",
    "4. Commit relevant changes if needed.",
    "5. Build the PR description from the required template below.",
    "6. Write the PR description to a temporary markdown file and create the PR with `gh pr create --body-file <file>` if possible.",
    "",
    "PR description rules:",
    "- Use concise summaries first, then collapsible details for original agent outputs.",
    "- Preserve the original review, fix, and lint outputs inside their matching details blocks.",
    "- Do not paste the original git diff into the PR description.",
    "- If a section has no source output, say so plainly instead of inventing content.",
    "",
    "Parsed verdicts:",
    `- Review: ${review?.verdicts?.verdict ?? "missing"}`,
    `- Fix: ${fix?.verdicts?.verdict ?? (fix === undefined ? "not run" : "missing")}`,
    `- Lint: ${lint.verdicts?.verdict ?? "missing"}`,
    "",
    ...toMarkdownBlockLines(
      "Review output:",
      "markdown",
      review?.content,
      "(no review output)",
    ),
    "",
    ...toMarkdownBlockLines(
      "Fix output:",
      "markdown",
      fix?.content,
      "(no fix output)",
    ),
    "",
    ...toMarkdownBlockLines(
      "Lint output:",
      "markdown",
      lint.content,
      "(empty lint output)",
    ),
    "",
    ...toMarkdownBlockLines(
      "Original git diff:",
      "diff",
      diff.patch,
      "(empty diff)",
    ),
    "",
    ...toPrBodyTemplateLines(),
    "",
    "Required Markdown structure for your final agent response:",
    "## PR Summary",
    "- <what was prepared>",
    "",
    "## Git State",
    "- <branch, commit, remote, push status>",
    "",
    "## Result",
    "PR: <url|not created>",
  ].join("\n");
}

export function toReviewPrompt(
  mode: MenuItem,
  diffScope: DiffScopeItem,
  diff: GitDiffSnapshot,
): string {
  const changedFiles = extractChangedFilePaths(diff.patch);

  return [
    ...toDiffContextLines(mode, diffScope, diff),
    "",
    "Changed file paths inferred from diff:",
    ...toFileListLines(changedFiles),
    "",
    ...toReviewFrameworkLines(),
    "",
    ...toMarkdownBlockLines(
      "Git diff:",
      "diff",
      diff.patch,
      "(empty diff)",
    ),
    "",
    "Required Markdown structure:",
    "## Change Intention",
    "<Describe the goal and key files involved.>",
    "",
    "## Findings",
    "### Finding 1: <short title>",
    "- **Files:** <path:line or path when available>",
    "- **Description:** <specific, actionable feedback with optional severity prefix such as [blocking], [important], [nit], or [suggestion]>",
    "- **Level:** <major|minor>",
    "- **Risk:** <what can happen if this ships>",
    "- **Recommended fix:** <specific fix>",
    "",
    "## Notes",
    "- <Non-blocking migration, compatibility, documentation, fallback, caveat, learning, or praise note. Write `No notes.` if none.>",
    "",
    "## Verdicts",
    "- **Verdict:** <pass|needs changes>",
    "- **Reason:** <brief reason>",
  ].join("\n");
}

function toDiffContextLines(
  mode: MenuItem,
  diffScope: DiffScopeItem,
  diff: GitDiffSnapshot,
): string[] {
  return [
    `Pipeline mode: ${mode.label}`,
    `Diff scope: ${diffScope.label}`,
    `Project path: ${diff.stats.cwd}`,
    `Changed files: ${diff.stats.changedFiles}`,
    `Added lines: ${diff.stats.addedLines}`,
    `Removed lines: ${diff.stats.removedLines}`,
    ...(diff.stats.binaryFiles > 0
      ? [`Binary files: ${diff.stats.binaryFiles}`]
      : []),
    ...(diff.stats.commitCount === undefined
      ? []
      : [`Commits in scope: ${diff.stats.commitCount}`]),
  ];
}

function toMarkdownBlockLines(
  title: string,
  language: string,
  content: string | undefined,
  emptyFallback: string,
): string[] {
  const body =
    content !== undefined && content.trim().length > 0 ? content : emptyFallback;

  return [title, `\`\`\`${language}`, body, "```"];
}

function toFileListLines(paths: readonly string[]): string[] {
  if (paths.length === 0) {
    return ["- (none detected)"];
  }

  return paths.map((path) => `- ${path}`);
}

function toPrBodyTemplateLines(): string[] {
  return [
    "Required GitHub PR description body:",
    "````markdown",
    "## Change Intention",
    "<Concise summary of the intended change, based on the review output and diff context.>",
    "",
    "## Reviews",
    "<Concise summary of the original review outcome.>",
    "",
    "<details>",
    "<summary>Original review output</summary>",
    "",
    "```markdown",
    "<Paste the full original review output here.>",
    "```",
    "",
    "</details>",
    "",
    "## What Fixed",
    "<Concise summary of what the fix agent changed, or say that no fix step was required.>",
    "",
    "<details>",
    "<summary>Fix agent output</summary>",
    "",
    "```markdown",
    "<Paste the full fix agent output here, or `(no fix output)`.>",
    "```",
    "",
    "</details>",
    "",
    "## Lint and Typecheck Status",
    "- Typecheck: <passed|failed|skipped> - <command or reason from lint output>",
    "- Lint: <passed|failed|skipped> - <command or reason from lint output>",
    "- Test: <passed|failed|skipped> - <command or reason from lint output, if present>",
    "- Build: <passed|failed|skipped> - <command or reason from lint output, if present>",
    "",
    "<details>",
    "<summary>Verification output</summary>",
    "",
    "```markdown",
    "<Paste the full lint output here.>",
    "```",
    "",
    "</details>",
    "````",
  ];
}

function toReviewFrameworkLines(): string[] {
  return [
    "Core review framework:",
    "",
    "1. Review mindset",
    "- Aim to catch defects, uncover edge cases, improve maintainability, strengthen architecture, share codebase knowledge, and uphold project standards.",
    "- Do not use the review to demonstrate expertise, argue taste, block without a concrete risk, or duplicate checks better handled by automated tools.",
    "- If the implementation has a clear strong choice, mention it briefly where it helps future maintainers understand the design.",
    "",
    "2. Feedback quality",
    "- Make every finding specific and actionable: name the file, explain the failure mode, state the risk, and recommend a fix.",
    "- Keep feedback about the code and outcome, not the author.",
    "- Prefer collaborative wording for non-blocking issues: ask what happens in an edge case or suggest a clearer alternative.",
    "- For required changes, be direct about why the issue blocks merge.",
    "- If an observation is useful but not required, put it under Notes instead of turning it into a finding.",
    "- Avoid vague comments like `this is wrong`; replace them with the scenario that fails and the change that would make it safe.",
    "",
    "3. Review scope",
    "- Review logic correctness, edge cases, security, performance, tests, error handling, documentation, API design, naming, folder structure, file responsibility, and architectural fit.",
    "- Treat explicit change intent as authoritative. If the change intentionally removes prior behavior, do not request a fallback unless compatibility is an explicit requirement or the removal creates a concrete defect.",
    "- Do not manually flag formatting, import ordering, lint-only issues, or minor typos unless they create real ambiguity or behavior risk.",
    "",
    "4. Review process",
    "- Context pass: read the diff context, changed files, pipeline mode, and any available verification output before making claims.",
    "- Size pass: if the change is too large or mixes unrelated concerns, report that as a maintainability risk and recommend a split.",
    "- High-level pass: evaluate architecture, coupling/cohesion, file placement, test strategy, and performance shape before line comments.",
    "- Line pass: inspect correctness, null/empty states, race conditions, input handling, injection risks, unnecessary loops, memory pressure, naming, comments, and single responsibility.",
    "- Reuse pass: before accepting new helpers or duplicated logic, inspect nearby files and shared modules for existing utilities or patterns.",
    "- Analyzer pass: if this repository provides a diff-analysis script, use it for large or complex diffs before finalizing findings.",
    "- Lexa pass: use Lexa for changed-file outlines, dependency impact, references, and structural risk when it is available.",
    "",
    "5. Review techniques",
    "- Use a checklist so correctness, security, performance, tests, and architecture are all considered.",
    "- Use questions for uncertain edge cases, such as asking how an empty list, failed API call, or concurrent request should behave.",
    "- Suggest alternatives for optional design choices in Notes; do not command a rewrite unless the current code has a concrete risk.",
    "- Prioritize severity in the description with `[blocking]`, `[important]`, `[minor]`, or `[suggestion]` when helpful.",
    "- Convert severity labels carefully: `[blocking]` becomes `major`; `[important]` becomes `major` only when it is a concrete blocker, otherwise use `minor` or Notes.",
    "- Put `[suggestion]`, `[learning]`, `[praise]`, migration guidance, and optional fallback ideas in Notes unless they describe an actionable code defect.",
    "",
    "6. Examples",
    "- If a change intentionally moves provider config from `.env` to TOML, mention migration or documentation as a Note, not as a required fallback finding.",
    "- If a setup flow cannot recover from a mistyped URL or API key, report that as a finding because it can block successful setup.",
    "- Missing focused tests for new config parsing are usually a minor finding unless repo policy or high blast radius makes them blocking.",
  ];
}
