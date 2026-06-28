import {
  runFixAgent,
  runLintAgent,
  runPrAgent,
  runReviewAgent,
} from "../agent/core.js";
import type {
  AgentFixResult,
  AgentLintResult,
  AgentPrResult,
  AgentReviewResult,
  LintRunPhase,
} from "../agent/types.js";
import type { DiffScopeItem } from "../diff-scope/index.js";
import { getGitDiff, type GitDiffSnapshot } from "../git-diff/index.js";
import type { MenuItem } from "../main-menu/index.js";
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
  shouldSkipPostFixLint,
} from "./utils.js";

export const PIPELINE_DEFINITIONS: Record<MenuItem["id"], PipelineDefinition> = {
  review: {
    mode: "review",
    steps: ["git-diff", "review"],
  },
  "review-and-fix": {
    mode: "review-and-fix",
    steps: ["git-diff", "review", "fix"],
  },
  "full-pipeline": {
    mode: "full-pipeline",
    steps: ["git-diff", "review", "lint", "fix", "post-fix-lint", "pr"],
  },
};

export async function runPipeline({
  cwd,
  diffScope,
  mode,
  onFixCompleted,
  onFixStarted,
  onGitDiffLoaded,
  onLintCompleted,
  onLintStarted,
  onPostFixLintCompleted,
  onPostFixLintStarted,
  onPrCompleted,
  onPrStarted,
  onReviewCompleted,
}: RunPipelineOptions): Promise<PipelineRunResult> {
  const definition = PIPELINE_DEFINITIONS[mode.id];
  const hasFixStep = definition.steps.includes("fix");
  const hasLintStep = definition.steps.includes("lint");
  const hasPostFixLintStep = definition.steps.includes("post-fix-lint");
  const hasPrStep = definition.steps.includes("pr");
  let agentFix: AgentFixResult | undefined;
  let agentInitialLint: AgentLintResult | undefined;
  let agentPostFixLint: AgentLintResult | undefined;
  let agentPr: AgentPrResult | undefined;
  let agentReview: AgentReviewResult | undefined;
  let gitDiff: GitDiffSnapshot | undefined;
  let prSkipReason: string | undefined;

  for (const step of definition.steps) {
    if (step === "git-diff") {
      gitDiff = await runGitDiffStep(cwd, diffScope, onGitDiffLoaded);
    } else if (step === "review") {
      if (gitDiff === undefined) {
        throw new Error("Review step requires git diff context");
      }

      if (!hasReviewableDiff(gitDiff)) {
        continue;
      }

      agentReview = await runReviewStep(cwd, mode, diffScope, gitDiff);
      onReviewCompleted(
        agentReview,
        gitDiff,
        shouldRunFix(hasFixStep, agentReview, agentInitialLint),
      );
    } else if (step === "fix") {
      if (
        gitDiff === undefined ||
        agentReview === undefined ||
        !shouldRunFix(hasFixStep, agentReview, agentInitialLint)
      ) {
        continue;
      }

      onFixStarted(gitDiff, agentReview, agentInitialLint);
      agentFix = await runFixStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        agentReview,
        agentInitialLint,
      );
      onFixCompleted(agentFix, gitDiff, agentReview, agentInitialLint);
    } else if (step === "lint") {
      if (gitDiff === undefined || !hasReviewableDiff(gitDiff)) {
        continue;
      }

      onLintStarted(
        gitDiff,
        agentReview,
        agentFix,
        false,
      );
      agentInitialLint = await runLintStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        "pre-fix",
      );
      onLintCompleted(agentInitialLint, gitDiff);
    } else if (step === "post-fix-lint") {
      if (
        gitDiff === undefined ||
        agentReview === undefined ||
        agentInitialLint === undefined ||
        agentFix?.verdicts.verdict !== "fixed"
      ) {
        continue;
      }

      gitDiff = await getGitDiff(cwd, diffScope);
      onPostFixLintStarted(gitDiff, agentReview, agentFix, agentInitialLint);
      agentPostFixLint = await runLintStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        "post-fix",
      );
      onPostFixLintCompleted(
        agentPostFixLint,
        gitDiff,
        agentReview,
        agentFix,
        agentInitialLint,
      );
    } else if (step === "pr") {
      const prDecision = getPrRunDecision(
        hasPrStep,
        agentInitialLint,
        agentPostFixLint,
        agentReview,
        agentFix,
      );

      if (
        gitDiff === undefined ||
        prDecision.lint === undefined ||
        !prDecision.willRun
      ) {
        prSkipReason = prDecision.skipReason;
        continue;
      }

      prSkipReason = undefined;
      onPrStarted(gitDiff, agentReview, agentFix, prDecision.lint);
      agentPr = await runPrStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        agentReview,
        agentFix,
        prDecision.lint,
      );
      onPrCompleted(agentPr, gitDiff, prDecision.lint);
    } else {
      assertNever(step);
    }
  }

  return {
    agentFix,
    agentInitialLint,
    agentLint: agentPostFixLint ?? agentInitialLint,
    agentPostFixLint,
    agentPr,
    agentReview,
    diffScope,
    fixSkipped: shouldSkipFix(hasFixStep, agentFix),
    gitDiff,
    lintSkipped: hasLintStep && agentInitialLint === undefined,
    mode,
    postFixLintSkipped: shouldSkipPostFixLint(
      hasPostFixLintStep,
      agentPostFixLint,
    ),
    prSkipReason,
    prSkipped: hasPrStep && agentPr === undefined,
    reviewSkipped: agentReview === undefined,
  };
}

async function runGitDiffStep(
  cwd: string,
  diffScope: DiffScopeItem,
  onGitDiffLoaded: (
    diff: GitDiffSnapshot,
    reviewWillRun: boolean,
  ) => void,
): Promise<GitDiffSnapshot> {
  const diff = await getGitDiff(cwd, diffScope);

  onGitDiffLoaded(diff, hasReviewableDiff(diff));

  return diff;
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
  agentLint: AgentLintResult | undefined,
): Promise<AgentFixResult> {
  return runFixAgent({
    cwd,
    diff: gitDiff,
    diffScope,
    lint: agentLint,
    mode,
    review: agentReview,
  });
}

async function runLintStep(
  cwd: string,
  mode: MenuItem,
  diffScope: DiffScopeItem,
  gitDiff: GitDiffSnapshot,
  phase: LintRunPhase,
): Promise<AgentLintResult> {
  return runLintAgent({
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
  agentLint: AgentLintResult,
): Promise<AgentPrResult> {
  return runPrAgent({
    cwd,
    diff: gitDiff,
    diffScope,
    fix: agentFix,
    lint: agentLint,
    mode,
    review: agentReview,
  });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled pipeline step: ${value}`);
}
