import { AgentBuilder } from "@anvia/core";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";
import type { GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import type { AgentFixResult } from "./fixAgent.js";
import type { AgentLintResult } from "./lintAgent.js";
import { AGENT_MAX_TURNS, createCompletionModel } from "./model.js";
import { PR_AGENT_INSTRUCTIONS, toPrPrompt } from "./prompt.js";
import type { AgentReviewResult } from "./reviewAgent.js";
import { PtySessionManager } from "./ptySessionManager.js";
import { createAgentTools } from "./tools.js";

export type AgentPrResult = {
  readonly output: string;
};

type RunPrAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly fix?: AgentFixResult | undefined;
  readonly lint: AgentLintResult;
  readonly mode: MenuItem;
  readonly review?: AgentReviewResult | undefined;
};

export async function runPrAgent({
  cwd,
  diff,
  diffScope,
  fix,
  lint,
  mode,
  review,
}: RunPrAgentOptions): Promise<AgentPrResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-pipeline-pr", createCompletionModel())
      .name("Review Pipeline PR Agent")
      .instructions(PR_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent
      .prompt(toPrPrompt(mode, diffScope, diff, review, fix, lint))
      .send();

    return {
      output: response.output,
    };
  } finally {
    ptySessions.dispose();
  }
}
