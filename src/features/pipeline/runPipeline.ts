import { runFixAgent, type AgentFixResult } from "../agent/fixAgent.js";
import { runLintAgent, type AgentLintResult } from "../agent/lintAgent.js";
import { runPrAgent, type AgentPrResult } from "../agent/prAgent.js";
import { runReviewAgent, type AgentReviewResult } from "../agent/reviewAgent.js";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";
import { getGitDiff, type GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { PIPELINE_DEFINITIONS } from "./pipelineDefinitions.js";

export type PipelineRunResult = {
  readonly agentFix?: AgentFixResult;
  readonly agentLint?: AgentLintResult;
  readonly agentPr?: AgentPrResult;
  readonly agentReview?: AgentReviewResult;
  readonly diffScope: DiffScopeItem;
  readonly fixSkipped: boolean;
  readonly gitDiff?: GitDiffSnapshot;
  readonly lintSkipped: boolean;
  readonly mode: MenuItem;
  readonly prSkipped: boolean;
  readonly reviewSkipped: boolean;
};

type RunPipelineOptions = {
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
  readonly onFixCompleted: (
    fix: AgentFixResult,
    diff: GitDiffSnapshot,
    review: AgentReviewResult,
  ) => void;
  readonly onLintCompleted: (
    lint: AgentLintResult,
    diff: GitDiffSnapshot,
    prWillRun: boolean,
  ) => void;
  readonly onLintStarted: (
    diff: GitDiffSnapshot,
    review: AgentReviewResult | undefined,
    fix: AgentFixResult | undefined,
    fixSkipped: boolean,
  ) => void;
  readonly onPrCompleted: (
    pr: AgentPrResult,
    diff: GitDiffSnapshot,
    lint: AgentLintResult,
  ) => void;
  readonly onPrStarted: (
    diff: GitDiffSnapshot,
    lint: AgentLintResult,
  ) => void;
};

export async function runPipeline({
  cwd,
  diffScope,
  mode,
  onFixCompleted,
  onGitDiffLoaded,
  onLintCompleted,
  onLintStarted,
  onPrCompleted,
  onPrStarted,
  onReviewCompleted,
}: RunPipelineOptions): Promise<PipelineRunResult> {
  const definition = PIPELINE_DEFINITIONS[mode.id];
  const hasFixStep = definition.steps.includes("fix");
  const hasLintStep = definition.steps.includes("lint");
  const hasPrStep = definition.steps.includes("pr");
  let agentFix: AgentFixResult | undefined;
  let agentLint: AgentLintResult | undefined;
  let agentPr: AgentPrResult | undefined;
  let agentReview: AgentReviewResult | undefined;
  let gitDiff: GitDiffSnapshot | undefined;

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
      onReviewCompleted(agentReview, gitDiff, shouldRunFix(hasFixStep, agentReview));
    } else if (step === "fix") {
      if (
        gitDiff === undefined ||
        agentReview === undefined ||
        !shouldRunFix(hasFixStep, agentReview)
      ) {
        continue;
      }

      agentFix = await runFixStep(cwd, mode, diffScope, gitDiff, agentReview);
      onFixCompleted(agentFix, gitDiff, agentReview);
    } else if (step === "lint") {
      if (gitDiff === undefined || !hasReviewableDiff(gitDiff)) {
        continue;
      }

      onLintStarted(
        gitDiff,
        agentReview,
        agentFix,
        shouldSkipFix(hasFixStep, agentFix),
      );
      agentLint = await runLintStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        agentReview,
        agentFix,
        shouldSkipFix(hasFixStep, agentFix),
      );
      onLintCompleted(
        agentLint,
        gitDiff,
        shouldRunPr(hasPrStep, agentLint, agentReview, agentFix),
      );
    } else if (step === "pr") {
      if (
        gitDiff === undefined ||
        agentLint === undefined ||
        !shouldRunPr(hasPrStep, agentLint, agentReview, agentFix)
      ) {
        continue;
      }

      onPrStarted(gitDiff, agentLint);
      agentPr = await runPrStep(
        cwd,
        mode,
        diffScope,
        gitDiff,
        agentReview,
        agentFix,
        agentLint,
      );
      onPrCompleted(agentPr, gitDiff, agentLint);
    } else {
      assertNever(step);
    }
  }

  return {
    agentFix,
    agentLint,
    agentPr,
    agentReview,
    diffScope,
    fixSkipped: shouldSkipFix(hasFixStep, agentFix),
    gitDiff,
    lintSkipped: hasLintStep && agentLint === undefined,
    mode,
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
): Promise<AgentFixResult> {
  return runFixAgent({
    cwd,
    diff: gitDiff,
    diffScope,
    mode,
    review: agentReview,
  });
}

async function runLintStep(
  cwd: string,
  mode: MenuItem,
  diffScope: DiffScopeItem,
  gitDiff: GitDiffSnapshot,
  agentReview: AgentReviewResult | undefined,
  agentFix: AgentFixResult | undefined,
  fixSkipped: boolean,
): Promise<AgentLintResult> {
  return runLintAgent({
    cwd,
    diff: gitDiff,
    diffScope,
    fix: agentFix,
    fixSkipped,
    mode,
    review: agentReview,
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

function hasReviewableDiff(diff: GitDiffSnapshot): boolean {
  return diff.stats.changedFiles > 0;
}

function shouldRunFix(
  hasFixStep: boolean,
  review: AgentReviewResult | undefined,
): boolean {
  if (!hasFixStep || review === undefined) {
    return false;
  }

  return getReviewVerdict(review) !== "pass";
}

function shouldSkipFix(
  hasFixStep: boolean,
  fix: AgentFixResult | undefined,
): boolean {
  return hasFixStep && fix === undefined;
}

function shouldRunPr(
  hasPrStep: boolean,
  lint: AgentLintResult | undefined,
  review: AgentReviewResult | undefined,
  fix: AgentFixResult | undefined,
): boolean {
  if (!hasPrStep || lint === undefined || !hasResolvedReviewFindings(review, fix)) {
    return false;
  }

  return /(^|\n)\s*VERDICT:\s*pass\s*($|\n)/i.test(lint.output);
}

function hasResolvedReviewFindings(
  review: AgentReviewResult | undefined,
  fix: AgentFixResult | undefined,
): boolean {
  if (review === undefined || getReviewVerdict(review) === "pass") {
    return true;
  }

  return getFixVerdict(fix) === "fixed";
}

function getReviewVerdict(
  review: AgentReviewResult,
): "pass" | "needs changes" | undefined {
  const verdictsSection = getMarkdownSection(review.output, "Verdicts");
  const verdictMatch = verdictsSection.match(
    /(^|\n)\s*-?\s*\*\*Verdict:\*\*\s*(pass|needs changes)\s*($|\n)/i,
  );

  return verdictMatch?.[2]?.toLowerCase() as
    | "pass"
    | "needs changes"
    | undefined;
}

function getFixVerdict(
  fix: AgentFixResult | undefined,
): "fixed" | "not-fixed" | "no-op" | undefined {
  const verdictMatch = fix?.output.match(
    /(^|\n)\s*FIX_VERDICT:\s*(fixed|not-fixed|no-op)\s*($|\n)/i,
  );

  return verdictMatch?.[2]?.toLowerCase() as
    | "fixed"
    | "not-fixed"
    | "no-op"
    | undefined;
}

function getMarkdownSection(markdown: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(`(^|\\n)##\\s+${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i"),
  );

  return match?.[2] ?? "";
}
