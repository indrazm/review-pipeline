import type { DiffScopeItem } from "../diff-scope/index.js";
import type { GitDiffSnapshot } from "../git-diff/index.js";
import type { MenuItem } from "../main-menu/index.js";

export type VerdictKind = "review" | "fix" | "verification";

export type PrMonitorStatus = "ready" | "failing" | "timeout" | "error";

export type PrRepairTrigger = "checks" | "review-comments";

export type PrRepairVerdict = "fixed" | "not-fixed" | "no-op";

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

export type VerificationVerdicts = {
  readonly verdict: "pass" | "fail";
};

export type VerificationRunPhase = "pre-fix" | "post-fix";

export type AgentFixResult = {
  readonly content: string;
  readonly verdicts: FixVerdicts;
};

export type AgentVerificationResult = {
  readonly content: string;
  readonly verdicts: VerificationVerdicts;
};

export type AgentPrResult = {
  readonly content: string;
  readonly prUrl?: string | undefined;
};

export type AgentPrMonitorResult = {
  readonly content: string;
  readonly prUrl: string;
  readonly repairable: boolean;
  readonly repairTriggers: readonly PrRepairTrigger[];
  readonly status: PrMonitorStatus;
};

export type AgentPrRepairResult = {
  readonly content: string;
  readonly prUrl: string;
  readonly verdict: PrRepairVerdict;
};

export type AgentReviewResult = {
  readonly content: string;
  readonly verdicts: ReviewVerdicts;
};

export type RunFixAgentOptions = {
  readonly attempt?: number;
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly verification?: AgentVerificationResult | undefined;
  readonly maxAttempts?: number;
  readonly mode: MenuItem;
  readonly previousFix?: AgentFixResult | undefined;
  readonly review: AgentReviewResult;
};

export type RunVerificationAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly mode: MenuItem;
  readonly phase?: VerificationRunPhase;
};

export type RunPrAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly fix?: AgentFixResult | undefined;
  readonly verification: AgentVerificationResult;
  readonly mode: MenuItem;
  readonly review?: AgentReviewResult | undefined;
};

export type RunPrMonitorAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly fix?: AgentFixResult | undefined;
  readonly verification: AgentVerificationResult;
  readonly mode: MenuItem;
  readonly pr: AgentPrResult & { readonly prUrl: string };
  readonly review?: AgentReviewResult | undefined;
};

export type RunPrRepairAgentOptions = {
  readonly attempt: number;
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly fix?: AgentFixResult | undefined;
  readonly verification: AgentVerificationResult;
  readonly maxAttempts: number;
  readonly mode: MenuItem;
  readonly monitor: AgentPrMonitorResult;
  readonly pr: AgentPrResult & { readonly prUrl: string };
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
