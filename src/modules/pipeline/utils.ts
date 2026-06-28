import type {
  AgentFixResult,
  AgentLintResult,
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
  lint: AgentLintResult | undefined,
): boolean {
  if (!hasFixStep) {
    return false;
  }

  const reviewNeedsFix =
    review !== undefined && review.verdicts.verdict !== "pass";
  const lintNeedsFix = lint !== undefined && lint.verdicts.verdict !== "pass";

  return reviewNeedsFix || lintNeedsFix;
}

export function shouldSkipFix(
  hasFixStep: boolean,
  fix: AgentFixResult | undefined,
): boolean {
  return hasFixStep && fix === undefined;
}

export function shouldSkipPostFixLint(
  hasPostFixLintStep: boolean,
  postFixLint: AgentLintResult | undefined,
): boolean {
  return hasPostFixLintStep && postFixLint === undefined;
}

export function getPrRunDecision(
  hasPrStep: boolean,
  initialLint: AgentLintResult | undefined,
  postFixLint: AgentLintResult | undefined,
  review: AgentReviewResult | undefined,
  fix: AgentFixResult | undefined,
): {
  readonly lint?: AgentLintResult;
  readonly skipReason?: string;
  readonly willRun: boolean;
} {
  if (!hasPrStep) {
    return {
      skipReason: "pipeline mode does not include a PR step",
      willRun: false,
    };
  }

  if (initialLint === undefined) {
    return {
      skipReason: "lint agent did not produce a result",
      willRun: false,
    };
  }

  const initialLintVerdict = initialLint.verdicts.verdict;
  const reviewVerdict = review?.verdicts.verdict;
  const needsFix =
    initialLintVerdict !== "pass" ||
    (reviewVerdict !== undefined && reviewVerdict !== "pass");

  if (!needsFix) {
    return { lint: initialLint, willRun: true };
  }

  const fixVerdict = fix?.verdicts.verdict;

  if (fixVerdict !== "fixed") {
    return {
      skipReason: `fix was required but did not complete (review verdict: ${reviewVerdict ?? "missing"}, initial lint verdict: ${initialLintVerdict}, fix verdict: ${fixVerdict ?? "missing"})`,
      willRun: false,
    };
  }

  if (postFixLint === undefined) {
    return {
      skipReason: "post-fix verification did not produce a result",
      willRun: false,
    };
  }

  const postFixLintVerdict = postFixLint.verdicts.verdict;

  if (postFixLintVerdict !== "pass") {
    return {
      skipReason: `post-fix verification failed (review verdict: ${reviewVerdict ?? "missing"}, initial lint verdict: ${initialLintVerdict}, fix verdict: ${fixVerdict}, post-fix lint verdict: ${postFixLintVerdict})`,
      willRun: false,
    };
  }

  return { lint: postFixLint, willRun: true };
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
