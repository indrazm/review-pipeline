import type {
  AgentFixResult,
  AgentVerificationResult,
  AgentReviewResult,
} from "../agent/types.js";
import type { GitDiffSnapshot } from "../git-diff/index.js";
import type { PipelineRunState } from "./types.js";

export function hasReviewableDiff(diff: GitDiffSnapshot): boolean {
  return diff.stats.changedFiles > 0;
}

export function shouldRunFix(
  hasFixStep: boolean,
  review: AgentReviewResult | undefined,
  verification: AgentVerificationResult | undefined,
): boolean {
  if (!hasFixStep) {
    return false;
  }

  const reviewNeedsFix =
    review !== undefined && review.verdicts.verdict !== "pass";
  const verificationNeedsFix = verification !== undefined && verification.verdicts.verdict !== "pass";

  return reviewNeedsFix || verificationNeedsFix;
}

export function shouldSkipFix(
  hasFixStep: boolean,
  fix: AgentFixResult | undefined,
): boolean {
  return hasFixStep && fix === undefined;
}

export function shouldSkipPostFixVerification(
  hasPostFixVerificationStep: boolean,
  postFixVerification: AgentVerificationResult | undefined,
): boolean {
  return hasPostFixVerificationStep && postFixVerification === undefined;
}

export function getPrRunDecision(
  hasPrStep: boolean,
  review: AgentReviewResult | undefined,
  verification: AgentVerificationResult | undefined,
): {
  readonly verification?: AgentVerificationResult;
  readonly skipReason?: string;
  readonly willRun: boolean;
} {
  if (!hasPrStep) {
    return {
      skipReason: "pipeline mode does not include a PR step",
      willRun: false,
    };
  }

  if (review === undefined) {
    return {
      skipReason: "review agent did not produce a result",
      willRun: false,
    };
  }

  const reviewVerdict = review.verdicts.verdict;

  if (reviewVerdict !== "pass") {
    return {
      skipReason: `latest review did not pass (review verdict: ${reviewVerdict})`,
      willRun: false,
    };
  }

  if (verification === undefined) {
    return {
      skipReason: "verification agent did not produce a result",
      willRun: false,
    };
  }

  const verificationVerdict = verification.verdicts.verdict;

  if (verificationVerdict !== "pass") {
    return {
      skipReason: `latest verification failed (review verdict: ${reviewVerdict}, verification verdict: ${verificationVerdict})`,
      willRun: false,
    };
  }

  return { verification, willRun: true };
}

export function formatNoChangesMessage(
  state: Extract<PipelineRunState, { readonly status: "completed" }>,
): string {
  const lineStats = `0 files changed, ${state.diff.stats.addedLines} added, ${state.diff.stats.removedLines} removed`;

  if (state.diffScope.id !== "branch-against-main") {
    return `No changes found (${lineStats}). Review skipped.`;
  }

  const commitCount = state.diff.stats.commitCount ?? 0;

  return `No changes found (${lineStats}, ${commitCount} commits against main). Review skipped.`;
}
