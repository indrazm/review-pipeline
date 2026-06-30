import type {
  AgentFixResult,
  AgentVerificationResult,
  AgentPrMonitorResult,
  AgentPrRepairResult,
  AgentPrResult,
  AgentReviewResult,
} from "../agent/types.js";
import type { DiffScopeItem } from "../diff-scope/index.js";
import type { GitDiffSnapshot } from "../git-diff/index.js";
import type { MenuItem } from "../main-menu/index.js";
import type { ReviewTarget } from "../review-target/index.js";

export type PipelineStepId =
  | "git-diff"
  | "review"
  | "fix"
  | "verification"
  | "post-fix-verification"
  | "pr"
  | "pr-monitor";

export type PipelineDefinition = {
  readonly mode: MenuItem["id"];
  readonly steps: readonly PipelineStepId[];
};

export type PipelineRunResult = {
  readonly agentFix?: AgentFixResult;
  readonly agentFixAttempts: readonly AgentFixResult[];
  readonly agentInitialVerification?: AgentVerificationResult;
  readonly agentVerification?: AgentVerificationResult;
  readonly agentVerificationAttempts: readonly AgentVerificationResult[];
  readonly agentPostFixVerification?: AgentVerificationResult;
  readonly agentPr?: AgentPrResult;
  readonly agentPrMonitor?: AgentPrMonitorResult;
  readonly agentPrMonitorAttempts: readonly AgentPrMonitorResult[];
  readonly agentPrRepair?: AgentPrRepairResult;
  readonly agentPrRepairAttempts: readonly AgentPrRepairResult[];
  readonly agentReview?: AgentReviewResult;
  readonly agentReviewAttempts: readonly AgentReviewResult[];
  readonly diffScope: DiffScopeItem;
  readonly fixSkipped: boolean;
  readonly gitDiff?: GitDiffSnapshot;
  readonly verificationSkipped: boolean;
  readonly mode: MenuItem;
  readonly postFixVerificationSkipped: boolean;
  readonly prSkipReason?: string;
  readonly prMonitorSkipReason?: string;
  readonly prMonitorSkipped: boolean;
  readonly prRepairSkipReason?: string;
  readonly prRepairSkipped: boolean;
  readonly prSkipped: boolean;
  readonly reviewSkipped: boolean;
};

export type RunPipelineOptions = {
  readonly cwd: string;
  readonly mode: MenuItem;
  readonly reviewTarget: ReviewTarget;
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
    verification: AgentVerificationResult | undefined,
    attempt: number,
    maxAttempts: number,
  ) => void;
  readonly onFixCompleted: (
    fix: AgentFixResult,
    diff: GitDiffSnapshot,
    review: AgentReviewResult,
    verification: AgentVerificationResult | undefined,
    attempt: number,
    maxAttempts: number,
  ) => void;
  readonly onVerificationCompleted: (
    verification: AgentVerificationResult,
    diff: GitDiffSnapshot,
  ) => void;
  readonly onVerificationStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult | undefined,
    fix: AgentFixResult | undefined,
    fixSkipped: boolean,
  ) => void;
  readonly onPostFixVerificationCompleted: (
    verification: AgentVerificationResult,
    diff: GitDiffSnapshot,
    review: AgentReviewResult,
    fix: AgentFixResult,
    initialVerification: AgentVerificationResult,
    attempt: number,
    maxAttempts: number,
  ) => void;
  readonly onPostFixVerificationStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult,
    fix: AgentFixResult,
    initialVerification: AgentVerificationResult,
    attempt: number,
    maxAttempts: number,
  ) => void;
  readonly onPrCompleted: (
    pr: AgentPrResult,
    diff: GitDiffSnapshot,
    verification: AgentVerificationResult,
  ) => void;
  readonly onPrMonitorCompleted: (
    monitor: AgentPrMonitorResult,
    diff: GitDiffSnapshot,
    pr: AgentPrResult,
  ) => void;
  readonly onPrMonitorStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult | undefined,
    fix: AgentFixResult | undefined,
    verification: AgentVerificationResult,
    pr: AgentPrResult,
  ) => void;
  readonly onPrRepairCompleted: (
    repair: AgentPrRepairResult,
    diff: GitDiffSnapshot,
    pr: AgentPrResult,
    monitor: AgentPrMonitorResult,
  ) => void;
  readonly onPrRepairStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult | undefined,
    fix: AgentFixResult | undefined,
    verification: AgentVerificationResult,
    pr: AgentPrResult,
    monitor: AgentPrMonitorResult,
    attempt: number,
    maxAttempts: number,
  ) => void;
  readonly onPrStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult | undefined,
    fix: AgentFixResult | undefined,
    verification: AgentVerificationResult,
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
      readonly fixAttempt: number;
      readonly verification?: AgentVerificationResult;
      readonly maxFixAttempts: number;
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
      readonly status: "verifying";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix: AgentFixResult;
      readonly fixSkipped: false;
      readonly verification: AgentVerificationResult;
      readonly maxVerificationAttempts: number;
      readonly mode: MenuItem;
      readonly review: AgentReviewResult;
      readonly status: "verifying-after-fix";
      readonly verificationAttempt: number;
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly verification: AgentVerificationResult;
      readonly mode: MenuItem;
      readonly review?: AgentReviewResult;
      readonly status: "preparing-pr";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly verification: AgentVerificationResult;
      readonly mode: MenuItem;
      readonly pr: AgentPrResult;
      readonly review?: AgentReviewResult;
      readonly status: "monitoring-pr";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly verification: AgentVerificationResult;
      readonly maxRepairAttempts: number;
      readonly mode: MenuItem;
      readonly pr: AgentPrResult;
      readonly prMonitor: AgentPrMonitorResult;
      readonly repairAttempt: number;
      readonly review?: AgentReviewResult;
      readonly status: "repairing-pr";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixAttempts: readonly AgentFixResult[];
      readonly fixSkipped: boolean;
      readonly verification?: AgentVerificationResult;
      readonly verificationAttempts: readonly AgentVerificationResult[];
      readonly verificationSkipped: boolean;
      readonly mode: MenuItem;
      readonly postFixVerification?: AgentVerificationResult;
      readonly postFixVerificationSkipped: boolean;
      readonly pr?: AgentPrResult;
      readonly prSkipReason?: string;
      readonly prMonitor?: AgentPrMonitorResult;
      readonly prMonitorAttempts: readonly AgentPrMonitorResult[];
      readonly prMonitorSkipped: boolean;
      readonly prRepair?: AgentPrRepairResult;
      readonly prRepairAttempts: readonly AgentPrRepairResult[];
      readonly prRepairSkipped: boolean;
      readonly prSkipped: boolean;
      readonly review?: AgentReviewResult;
      readonly reviewAttempts: readonly AgentReviewResult[];
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
  readonly run: (mode: MenuItem, reviewTarget: ReviewTarget) => void;
  readonly state: PipelineRunState;
};
