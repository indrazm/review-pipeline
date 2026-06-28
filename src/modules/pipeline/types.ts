import type {
  AgentFixResult,
  AgentLintResult,
  AgentPrResult,
  AgentReviewResult,
} from "../agent/types.js";
import type { DiffScopeItem } from "../diff-scope/index.js";
import type { GitDiffSnapshot } from "../git-diff/index.js";
import type { MenuItem } from "../main-menu/index.js";

export type PipelineStepId =
  | "git-diff"
  | "review"
  | "fix"
  | "lint"
  | "post-fix-lint"
  | "pr";

export type PipelineDefinition = {
  readonly mode: MenuItem["id"];
  readonly steps: readonly PipelineStepId[];
};

export type PipelineRunResult = {
  readonly agentFix?: AgentFixResult;
  readonly agentInitialLint?: AgentLintResult;
  readonly agentLint?: AgentLintResult;
  readonly agentPostFixLint?: AgentLintResult;
  readonly agentPr?: AgentPrResult;
  readonly agentReview?: AgentReviewResult;
  readonly diffScope: DiffScopeItem;
  readonly fixSkipped: boolean;
  readonly gitDiff?: GitDiffSnapshot;
  readonly lintSkipped: boolean;
  readonly mode: MenuItem;
  readonly postFixLintSkipped: boolean;
  readonly prSkipReason?: string;
  readonly prSkipped: boolean;
  readonly reviewSkipped: boolean;
};

export type RunPipelineOptions = {
  readonly cwd: string;
  readonly diffScope: DiffScopeItem;
  readonly mode: MenuItem;
  readonly onGitDiffLoaded: (
    diff: GitDiffSnapshot,
    reviewWillRun: boolean,
  ) => void;
  readonly onReviewCompleted: (
    review: AgentReviewResult,
    diff: GitDiffSnapshot,
    fixWillRun: boolean,
  ) => void;
  readonly onFixStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult,
    lint: AgentLintResult | undefined,
  ) => void;
  readonly onFixCompleted: (
    fix: AgentFixResult,
    diff: GitDiffSnapshot,
    review: AgentReviewResult,
    lint: AgentLintResult | undefined,
  ) => void;
  readonly onLintCompleted: (
    lint: AgentLintResult,
    diff: GitDiffSnapshot,
  ) => void;
  readonly onLintStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult | undefined,
    fix: AgentFixResult | undefined,
    fixSkipped: boolean,
  ) => void;
  readonly onPostFixLintCompleted: (
    lint: AgentLintResult,
    diff: GitDiffSnapshot,
    review: AgentReviewResult,
    fix: AgentFixResult,
    initialLint: AgentLintResult,
  ) => void;
  readonly onPostFixLintStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult,
    fix: AgentFixResult,
    initialLint: AgentLintResult,
  ) => void;
  readonly onPrCompleted: (
    pr: AgentPrResult,
    diff: GitDiffSnapshot,
    lint: AgentLintResult,
  ) => void;
  readonly onPrStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult | undefined,
    fix: AgentFixResult | undefined,
    lint: AgentLintResult,
  ) => void;
};

export type PipelineRunState =
  | {
      readonly status: "idle";
    }
  | {
      readonly diffScope: DiffScopeItem;
      readonly mode: MenuItem;
      readonly status: "loading-diff";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly mode: MenuItem;
      readonly status: "reviewing";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly lint?: AgentLintResult;
      readonly mode: MenuItem;
      readonly review: AgentReviewResult;
      readonly status: "fixing";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly mode: MenuItem;
      readonly review?: AgentReviewResult;
      readonly status: "linting";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix: AgentFixResult;
      readonly fixSkipped: false;
      readonly lint: AgentLintResult;
      readonly mode: MenuItem;
      readonly review: AgentReviewResult;
      readonly status: "verifying-after-fix";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly lint: AgentLintResult;
      readonly mode: MenuItem;
      readonly review?: AgentReviewResult;
      readonly status: "preparing-pr";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly lint?: AgentLintResult;
      readonly lintSkipped: boolean;
      readonly mode: MenuItem;
      readonly postFixLint?: AgentLintResult;
      readonly postFixLintSkipped: boolean;
      readonly pr?: AgentPrResult;
      readonly prSkipped: boolean;
      readonly review?: AgentReviewResult;
      readonly reviewSkipped: boolean;
      readonly status: "completed";
    }
  | {
      readonly diffScope: DiffScopeItem;
      readonly error: string;
      readonly mode: MenuItem;
      readonly status: "failed";
    };

export type PipelineRunner = {
  readonly run: (mode: MenuItem, diffScope: DiffScopeItem) => void;
  readonly state: PipelineRunState;
};
