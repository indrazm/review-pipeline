import { AgentBuilder } from "@anvia/core";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";
import type { GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import type { AgentReviewResult } from "./reviewAgent.js";
import { AGENT_MAX_TURNS, createCompletionModel } from "./model.js";
import { FIX_AGENT_INSTRUCTIONS, toFixPrompt } from "./prompt.js";
import { PtySessionManager } from "./ptySessionManager.js";
import { createAgentTools } from "./tools.js";

export type AgentFixResult = {
  readonly output: string;
};

type RunFixAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly mode: MenuItem;
  readonly review: AgentReviewResult;
};

export async function runFixAgent({
  cwd,
  diff,
  diffScope,
  mode,
  review,
}: RunFixAgentOptions): Promise<AgentFixResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-pipeline-fixer", createCompletionModel())
      .name("Review Pipeline Fixer")
      .instructions(FIX_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent
      .prompt(toFixPrompt(mode, diffScope, diff, review))
      .send();

    return {
      output: response.output,
    };
  } finally {
    ptySessions.dispose();
  }
}
