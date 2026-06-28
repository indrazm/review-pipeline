import { runReviewAgent, type AgentReviewResult } from "../agent/reviewAgent.js";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";
import { getGitDiff, type GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { PIPELINE_DEFINITIONS } from "./pipelineDefinitions.js";

export type PipelineRunResult = {
  readonly agentReview?: AgentReviewResult;
  readonly diffScope: DiffScopeItem;
  readonly gitDiff?: GitDiffSnapshot;
  readonly mode: MenuItem;
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
};

export async function runPipeline({
  cwd,
  diffScope,
  mode,
  onGitDiffLoaded,
}: RunPipelineOptions): Promise<PipelineRunResult> {
  const definition = PIPELINE_DEFINITIONS[mode.id];
  let agentReview: AgentReviewResult | undefined;
  let gitDiff: GitDiffSnapshot | undefined;

  for (const step of definition.steps) {
    if (step === "git-diff") {
      gitDiff = await runGitDiffStep(cwd, diffScope, onGitDiffLoaded);
    } else if (step === "review") {
      if (gitDiff !== undefined && !hasReviewableDiff(gitDiff)) {
        continue;
      }

      agentReview = await runReviewStep(cwd, mode, diffScope, gitDiff);
    } else {
      assertNever(step);
    }
  }

  return {
    agentReview,
    diffScope,
    gitDiff,
    mode,
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
  gitDiff: GitDiffSnapshot | undefined,
): Promise<AgentReviewResult> {
  if (gitDiff === undefined) {
    throw new Error("Review step requires git diff context");
  }

  return runReviewAgent({ cwd, diff: gitDiff, diffScope, mode });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled pipeline step: ${value}`);
}

function hasReviewableDiff(diff: GitDiffSnapshot): boolean {
  return diff.stats.changedFiles > 0;
}
