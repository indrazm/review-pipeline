import { AgentBuilder } from "@anvia/core";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";
import type { GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import type { AgentFixResult } from "./fixAgent.js";
import { AGENT_MAX_TURNS, createCompletionModel } from "./model.js";
import { LINT_AGENT_INSTRUCTIONS, toLintPrompt } from "./prompt.js";
import type { AgentReviewResult } from "./reviewAgent.js";
import { PtySessionManager } from "./ptySessionManager.js";
import { createAgentTools } from "./tools.js";

export type AgentLintResult = {
  readonly output: string;
};

type RunLintAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly fix?: AgentFixResult | undefined;
  readonly fixSkipped: boolean;
  readonly mode: MenuItem;
  readonly review?: AgentReviewResult | undefined;
};

export async function runLintAgent({
  cwd,
  diff,
  diffScope,
  fix,
  fixSkipped,
  mode,
  review,
}: RunLintAgentOptions): Promise<AgentLintResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-pipeline-linter", createCompletionModel())
      .name("Review Pipeline Linter")
      .instructions(LINT_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent
      .prompt(toLintPrompt(mode, diffScope, diff, review, fix, fixSkipped))
      .send();

    return {
      output: response.output,
    };
  } finally {
    ptySessions.dispose();
  }
}
