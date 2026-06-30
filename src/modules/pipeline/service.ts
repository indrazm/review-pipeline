import {
  runFixAgent,
  runVerificationAgent,
  runPrAgent,
  runPrMonitorAgent,
  runPrRepairAgent,
  runReviewAgent,
} from "../agent/core.js";
import type {
  AgentFixResult,
  AgentVerificationResult,
  AgentPrMonitorResult,
  AgentPrRepairResult,
  AgentPrResult,
  AgentReviewResult,
  VerificationRunPhase,
} from "../agent/types.js";
import type { DiffScopeItem } from "../diff-scope/index.js";
import { getGitDiff, type GitDiffSnapshot } from "../git-diff/index.js";
import type { MenuItem } from "../main-menu/index.js";
import type { ReviewTarget } from "../review-target/index.js";
import type {
  PipelineDefinition,
  PipelineRunResult,
  RunPipelineOptions,
} from "./types.js";
import {
  getPrRunDecision,
  hasReviewableDiff,
  shouldRunFix,
  shouldSkipFix,
  shouldSkipPostFixVerification,
} from "./utils.js";

const MAX_LOCAL_FIX_ATTEMPTS = 2;
const MAX_PR_REPAIR_ATTEMPTS = 2;

export const PIPELINE_DEFINITIONS: Record<MenuItem["id"], PipelineDefinition> = {
  review: {
    mode: "review",
    steps: ["git-diff", "review", "verification"],
  },
  "review-and-fix": {
    mode: "review-and-fix",
    steps: ["git-diff", "review", "verification", "fix", "post-fix-verification"],
  },
  "full-pipeline": {
    mode: "full-pipeline",
    steps: [
      "git-diff",
      "review",
      "verification",
      "fix",
      "post-fix-verification",
      "pr",
      "pr-monitor",
    ],
  },
};

export async function runPipeline({
  cwd,
  mode,
  onFixCompleted,
  onFixStarted,
  onGitDiffLoaded,
  onVerificationCompleted,
  onVerificationStarted,
  onPostFixVerificationCompleted,
  onPostFixVerificationStarted,
  onPrCompleted,
  onPrMonitorCompleted,
  onPrMonitorStarted,
  onPrRepairCompleted,
  onPrRepairStarted,
  onPrStarted,
  onReviewCompleted,
  reviewTarget,
}: RunPipelineOptions): Promise<PipelineRunResult> {
  const diffScope = reviewTarget.scope;
  const definition = PIPELINE_DEFINITIONS[mode.id];
  const hasFixStep = definition.steps.includes("fix");
  const hasVerificationStep = definition.steps.includes("verification");
  const hasPostFixVerificationStep = definition.steps.includes("post-fix-verification");
  const hasPrStep = definition.steps.includes("pr");
  const hasPrMonitorStep = definition.steps.includes("pr-monitor");
  let agentFix: AgentFixResult | undefined;
  const agentFixAttempts: AgentFixResult[] = [];
  let agentInitialVerification: AgentVerificationResult | undefined;
  const agentVerificationAttempts: AgentVerificationResult[] = [];
  let agentPostFixVerification: AgentVerificationResult | undefined;
  let agentPr: AgentPrResult | undefined;
  let agentPrMonitor: AgentPrMonitorResult | undefined;
  const agentPrMonitorAttempts: AgentPrMonitorResult[] = [];
  let agentPrRepair: AgentPrRepairResult | undefined;
  const agentPrRepairAttempts: AgentPrRepairResult[] = [];
  let agentReview: AgentReviewResult | undefined;
  const agentReviewAttempts: AgentReviewResult[] = [];
  let gitDiff: GitDiffSnapshot | undefined;
  let prMonitorSkipReason: string | undefined;
  let prRepairSkipReason: string | undefined;
  let prSkipReason: string | undefined;

  for (const step of definition.steps) {
    if (step === "git-diff") {
      gitDiff = await runGitDiffStep(cwd, reviewTarget, onGitDiffLoaded);
    } else if (step === "review") {
      if (gitDiff === undefined) {
        throw new Error("Review step requires git diff context");
      }

      if (!hasReviewableDiff(gitDiff)) {
        continue;
      }

      agentReview = await runReviewStep(cwd, mode, diffScope, gitDiff);
      agentReviewAttempts.push(agentReview);
      onReviewCompleted(
        agentReview,
        gitDiff,
        shouldRunFix(hasFixStep, agentReview, agentInitialVerification),
      );
    } else if (step === "fix") {
      if (
        gitDiff === undefined ||
        agentReview === undefined ||
        !shouldRunFix(hasFixStep, agentReview, agentInitialVerification)
      ) {
        continue;
      }

      const initialVerificationForLoop = agentInitialVerification;

      if (mode.id === "full-pipeline" && initialVerificationForLoop === undefined) {
        throw new Error("Full pipeline fix loop requires initial verification");
      }

      const maxAttempts =
        mode.id === "full-pipeline" ? MAX_LOCAL_FIX_ATTEMPTS : 1;
      let previousFix: AgentFixResult | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const verificationForFix = agentPostFixVerification ?? initialVerificationForLoop;

        onFixStarted(gitDiff, agentReview, verificationForFix, attempt, maxAttempts);
        agentFix = await runFixStep(
          cwd,
          mode,
          diffScope,
          gitDiff,
          agentReview,
          verificationForFix,
          previousFix,
          attempt,
          maxAttempts,
        );
        agentFixAttempts.push(agentFix);
        onFixCompleted(
          agentFix,
          gitDiff,
          agentReview,
          verificationForFix,
          attempt,
          maxAttempts,
        );
        previousFix = agentFix;

        if (mode.id !== "full-pipeline") {
          break;
        }

        const checkedInitialVerification = initialVerificationForLoop;

        if (checkedInitialVerification === undefined) {
          throw new Error("Full pipeline fix loop requires initial verification");
        }

        gitDiff = await getReviewTargetDiff(cwd, reviewTarget);
        onPostFixVerificationStarted(
          gitDiff,
          agentReview,
          agentFix,
          checkedInitialVerification,
          attempt,
          maxAttempts,
        );
        agentPostFixVerification = await runVerificationStep(
          cwd,
          mode,
          diffScope,
          gitDiff,
          "post-fix",
        );
        agentVerificationAttempts.push(agentPostFixVerification);
        onPostFixVerificationCompleted(
          agentPostFixVerification,
          gitDiff,
          agentReview,
          agentFix,
          checkedInitialVerification,
          attempt,
          maxAttempts,
        );

        agentReview = await runReviewStep(cwd, mode, diffScope, gitDiff);
        agentReviewAttempts.push(agentReview);
        onReviewCompleted(
          agentReview,
          gitDiff,
          shouldRunFix(hasFixStep, agentReview, agentPostFixVerification),
        );

        if (isReadyForPr(agentReview, agentPostFixVerification)) {
          break;
        }
      }
    } else if (step === "verification") {
      if (gitDiff === undefined || !hasReviewableDiff(gitDiff)) {
        continue;
      }

      onVerificationStarted(
        gitDiff,
        agentReview,
        agentFix,
        false,
      );
      agentInitialVerification = await runVerificationStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        "pre-fix",
      );
      agentVerificationAttempts.push(agentInitialVerification);
      onVerificationCompleted(agentInitialVerification, gitDiff);
    } else if (step === "post-fix-verification") {
      if (mode.id === "full-pipeline" && agentFixAttempts.length > 0) {
        continue;
      }

      if (
        gitDiff === undefined ||
        agentReview === undefined ||
        agentInitialVerification === undefined ||
        agentFix?.verdicts.verdict !== "fixed"
      ) {
        continue;
      }

      gitDiff = await getReviewTargetDiff(cwd, reviewTarget);
      onPostFixVerificationStarted(gitDiff, agentReview, agentFix, agentInitialVerification, 1, 1);
      agentPostFixVerification = await runVerificationStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        "post-fix",
      );
      agentVerificationAttempts.push(agentPostFixVerification);
      onPostFixVerificationCompleted(
        agentPostFixVerification,
        gitDiff,
        agentReview,
        agentFix,
        agentInitialVerification,
        1,
        1,
      );
    } else if (step === "pr") {
      const prDecision = getPrRunDecision(
        hasPrStep,
        agentReview,
        agentPostFixVerification ?? agentInitialVerification,
      );

      if (
        gitDiff === undefined ||
        prDecision.verification === undefined ||
        !prDecision.willRun
      ) {
        prSkipReason = prDecision.skipReason;
        continue;
      }

      prSkipReason = undefined;
      onPrStarted(gitDiff, agentReview, agentFix, prDecision.verification);
      agentPr = await runPrStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        agentReview,
        agentFix,
        prDecision.verification,
      );
      onPrCompleted(agentPr, gitDiff, prDecision.verification);
    } else if (step === "pr-monitor") {
      const agentVerification = agentPostFixVerification ?? agentInitialVerification;

      if (!hasPrMonitorStep) {
        prMonitorSkipReason = "pipeline mode does not include a PR monitor step";
        continue;
      }

      if (gitDiff === undefined || agentVerification === undefined || agentPr === undefined) {
        prMonitorSkipReason = "PR monitor requires a created PR and verification result";
        continue;
      }

      if (agentPr.prUrl === undefined) {
        prMonitorSkipReason = "PR agent did not produce a monitorable PR URL";
        continue;
      }

      prMonitorSkipReason = undefined;
      prRepairSkipReason = "PR did not require repair";

      let repairAttempt = 0;
      const monitorablePr = agentPr as AgentPrResult & { readonly prUrl: string };

      while (true) {
        onPrMonitorStarted(gitDiff, agentReview, agentFix, agentVerification, agentPr);
        agentPrMonitor = await runPrMonitorStep(
          cwd,
          mode,
          diffScope,
          gitDiff,
          agentReview,
          agentFix,
          agentVerification,
          monitorablePr,
        );
        agentPrMonitorAttempts.push(agentPrMonitor);
        onPrMonitorCompleted(agentPrMonitor, gitDiff, agentPr);

        if (agentPrMonitor.status === "ready") {
          prRepairSkipReason = "PR monitor reported ready";
          break;
        }

        if (agentPrMonitor.status !== "failing") {
          prRepairSkipReason = `PR monitor reported ${agentPrMonitor.status}`;
          break;
        }

        if (!agentPrMonitor.repairable) {
          prRepairSkipReason = "PR monitor reported a non-repairable failing state";
          break;
        }

        if (repairAttempt >= MAX_PR_REPAIR_ATTEMPTS) {
          prRepairSkipReason = `maximum PR repair attempts reached (${MAX_PR_REPAIR_ATTEMPTS})`;
          break;
        }

        repairAttempt += 1;
        prRepairSkipReason = undefined;
        onPrRepairStarted(
          gitDiff,
          agentReview,
          agentFix,
          agentVerification,
          agentPr,
          agentPrMonitor,
          repairAttempt,
          MAX_PR_REPAIR_ATTEMPTS,
        );
        agentPrRepair = await runPrRepairStep(
          cwd,
          mode,
          diffScope,
          gitDiff,
          agentReview,
          agentFix,
          agentVerification,
          monitorablePr,
          agentPrMonitor,
          repairAttempt,
          MAX_PR_REPAIR_ATTEMPTS,
        );
        agentPrRepairAttempts.push(agentPrRepair);
        onPrRepairCompleted(agentPrRepair, gitDiff, agentPr, agentPrMonitor);

        if (agentPrRepair.verdict !== "fixed") {
          prRepairSkipReason =
            agentPrRepair.verdict === "no-op"
              ? "PR repair reported no-op"
              : "PR repair did not complete a fix";
          break;
        }

        gitDiff = await getReviewTargetDiff(cwd, reviewTarget);
      }
    } else {
      assertNever(step);
    }
  }

  return {
    agentFix,
    agentFixAttempts,
    agentInitialVerification,
    agentVerification: agentPostFixVerification ?? agentInitialVerification,
    agentVerificationAttempts,
    agentPostFixVerification,
    agentPr,
    agentPrMonitor,
    agentPrMonitorAttempts,
    agentPrRepair,
    agentPrRepairAttempts,
    agentReview,
    agentReviewAttempts,
    diffScope,
    fixSkipped: shouldSkipFix(hasFixStep, agentFix),
    gitDiff,
    verificationSkipped: hasVerificationStep && agentInitialVerification === undefined,
    mode,
    postFixVerificationSkipped: shouldSkipPostFixVerification(
      hasPostFixVerificationStep,
      agentPostFixVerification,
    ),
    prMonitorSkipReason,
    prMonitorSkipped: hasPrMonitorStep && agentPrMonitor === undefined,
    prRepairSkipReason,
    prRepairSkipped: hasPrMonitorStep && agentPrRepairAttempts.length === 0,
    prSkipReason,
    prSkipped: hasPrStep && agentPr === undefined,
    reviewSkipped: agentReview === undefined,
  };
}

async function runGitDiffStep(
  cwd: string,
  reviewTarget: ReviewTarget,
  onGitDiffLoaded: (
    diff: GitDiffSnapshot,
    reviewWillRun: boolean,
  ) => void,
): Promise<GitDiffSnapshot> {
  const diff = await getReviewTargetDiff(cwd, reviewTarget);

  onGitDiffLoaded(diff, hasReviewableDiff(diff));

  return diff;
}

async function getReviewTargetDiff(
  cwd: string,
  reviewTarget: ReviewTarget,
): Promise<GitDiffSnapshot> {
  return getGitDiff(cwd, reviewTarget.scope, {
    paths: reviewTarget.selectedPaths,
  });
}

async function runReviewStep(
  cwd: string,
  mode: MenuItem,
  diffScope: DiffScopeItem,
  gitDiff: GitDiffSnapshot,
): Promise<AgentReviewResult> {
  return runReviewAgent({ cwd, diff: gitDiff, diffScope, mode });
}

async function runFixStep(
  cwd: string,
  mode: MenuItem,
  diffScope: DiffScopeItem,
  gitDiff: GitDiffSnapshot,
  agentReview: AgentReviewResult,
  agentVerification: AgentVerificationResult | undefined,
  previousFix: AgentFixResult | undefined,
  attempt: number,
  maxAttempts: number,
): Promise<AgentFixResult> {
  return runFixAgent({
    attempt,
    cwd,
    diff: gitDiff,
    diffScope,
    verification: agentVerification,
    maxAttempts,
    mode,
    previousFix,
    review: agentReview,
  });
}

async function runVerificationStep(
  cwd: string,
  mode: MenuItem,
  diffScope: DiffScopeItem,
  gitDiff: GitDiffSnapshot,
  phase: VerificationRunPhase,
): Promise<AgentVerificationResult> {
  return runVerificationAgent({
    cwd,
    diff: gitDiff,
    diffScope,
    mode,
    phase,
  });
}

async function runPrStep(
  cwd: string,
  mode: MenuItem,
  diffScope: DiffScopeItem,
  gitDiff: GitDiffSnapshot,
  agentReview: AgentReviewResult | undefined,
  agentFix: AgentFixResult | undefined,
  agentVerification: AgentVerificationResult,
): Promise<AgentPrResult> {
  return runPrAgent({
    cwd,
    diff: gitDiff,
    diffScope,
    fix: agentFix,
    verification: agentVerification,
    mode,
    review: agentReview,
  });
}

async function runPrMonitorStep(
  cwd: string,
  mode: MenuItem,
  diffScope: DiffScopeItem,
  gitDiff: GitDiffSnapshot,
  agentReview: AgentReviewResult | undefined,
  agentFix: AgentFixResult | undefined,
  agentVerification: AgentVerificationResult,
  agentPr: AgentPrResult & { readonly prUrl: string },
): Promise<AgentPrMonitorResult> {
  return runPrMonitorAgent({
    cwd,
    diff: gitDiff,
    diffScope,
    fix: agentFix,
    verification: agentVerification,
    mode,
    pr: agentPr,
    review: agentReview,
  });
}

async function runPrRepairStep(
  cwd: string,
  mode: MenuItem,
  diffScope: DiffScopeItem,
  gitDiff: GitDiffSnapshot,
  agentReview: AgentReviewResult | undefined,
  agentFix: AgentFixResult | undefined,
  agentVerification: AgentVerificationResult,
  agentPr: AgentPrResult & { readonly prUrl: string },
  agentPrMonitor: AgentPrMonitorResult,
  attempt: number,
  maxAttempts: number,
): Promise<AgentPrRepairResult> {
  return runPrRepairAgent({
    attempt,
    cwd,
    diff: gitDiff,
    diffScope,
    fix: agentFix,
    verification: agentVerification,
    maxAttempts,
    mode,
    monitor: agentPrMonitor,
    pr: agentPr,
    review: agentReview,
  });
}

function isReadyForPr(
  review: AgentReviewResult | undefined,
  verification: AgentVerificationResult | undefined,
): boolean {
  return (
    review?.verdicts.verdict === "pass" &&
    verification?.verdicts.verdict === "pass"
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled pipeline step: ${value}`);
}
