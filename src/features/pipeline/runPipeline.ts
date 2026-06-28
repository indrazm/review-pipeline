import { runReviewAgent, type AgentReviewResult } from "../agent/reviewAgent.js";
import { getGitDiff, type GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { PIPELINE_DEFINITIONS } from "./pipelineDefinitions.js";

export type PipelineRunResult = {
  readonly agentReview?: AgentReviewResult;
  readonly gitDiff?: GitDiffSnapshot;
  readonly mode: MenuItem;
};

type RunPipelineOptions = {
  readonly cwd: string;
  readonly mode: MenuItem;
  readonly onGitDiffLoaded: (diff: GitDiffSnapshot) => void;
};

export async function runPipeline({
  cwd,
  mode,
  onGitDiffLoaded,
}: RunPipelineOptions): Promise<PipelineRunResult> {
  const definition = PIPELINE_DEFINITIONS[mode.id];
  let agentReview: AgentReviewResult | undefined;
  let gitDiff: GitDiffSnapshot | undefined;

  for (const step of definition.steps) {
    if (step === "git-diff") {
      gitDiff = await runGitDiffStep(cwd, onGitDiffLoaded);
    } else if (step === "review") {
      agentReview = await runReviewStep(cwd, mode, gitDiff);
    } else {
      assertNever(step);
    }
  }

  return {
    agentReview,
    gitDiff,
    mode,
  };
}

async function runGitDiffStep(
  cwd: string,
  onGitDiffLoaded: (diff: GitDiffSnapshot) => void,
): Promise<GitDiffSnapshot> {
  const diff = await getGitDiff(cwd);

  onGitDiffLoaded(diff);

  return diff;
}

async function runReviewStep(
  cwd: string,
  mode: MenuItem,
  gitDiff: GitDiffSnapshot | undefined,
): Promise<AgentReviewResult> {
  if (gitDiff === undefined) {
    throw new Error("Review step requires git diff context");
  }

  return runReviewAgent({ cwd, diff: gitDiff, mode });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled pipeline step: ${value}`);
}
