import type { DiffScopeItem } from "../diff-scope/index.js";
import type { GitDiffSnapshot } from "../git-diff/index.js";
import type { MenuItem } from "../main-menu/index.js";

export type VerdictKind = "review" | "fix" | "lint";

export type PromptAgentOutput = {
  readonly content: string;
  readonly verdicts?: {
    readonly verdict: string;
  };
};

export type ReviewVerdicts = {
  readonly verdict: "pass" | "needs changes";
};

export type FixVerdicts = {
  readonly verdict: "fixed" | "not-fixed" | "no-op";
};

export type LintVerdicts = {
  readonly verdict: "pass" | "fail";
};

export type LintRunPhase = "pre-fix" | "post-fix";

export type AgentFixResult = {
  readonly content: string;
  readonly verdicts: FixVerdicts;
};

export type AgentLintResult = {
  readonly content: string;
  readonly verdicts: LintVerdicts;
};

export type AgentPrResult = {
  readonly content: string;
};

export type AgentReviewResult = {
  readonly content: string;
  readonly verdicts: ReviewVerdicts;
};

export type RunFixAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly lint?: AgentLintResult | undefined;
  readonly mode: MenuItem;
  readonly review: AgentReviewResult;
};

export type RunLintAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly mode: MenuItem;
  readonly phase?: LintRunPhase;
};

export type RunPrAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly fix?: AgentFixResult | undefined;
  readonly lint: AgentLintResult;
  readonly mode: MenuItem;
  readonly review?: AgentReviewResult | undefined;
};

export type RunReviewAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly mode: MenuItem;
};

export type PtyCommandResult = {
  readonly exitCode: number | null;
  readonly output: string;
  readonly running: boolean;
  readonly sessionId: string;
  readonly signal: number | null;
};
