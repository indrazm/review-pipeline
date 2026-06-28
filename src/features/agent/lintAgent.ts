import { AgentBuilder } from "@anvia/core";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";
import type { GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { AGENT_MAX_TURNS, createCompletionModel } from "./model.js";
import { LINT_AGENT_INSTRUCTIONS, toLintPrompt } from "./prompt.js";
import { PtySessionManager } from "./ptySessionManager.js";
import { createAgentTools } from "./tools.js";
import { generateVerdicts, type LintVerdicts } from "./verdicts.js";

export type LintRunPhase = "pre-fix" | "post-fix";

export type AgentLintResult = {
  readonly content: string;
  readonly verdicts: LintVerdicts;
};

type RunLintAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly diffScope: DiffScopeItem;
  readonly mode: MenuItem;
  readonly phase?: LintRunPhase;
};

export async function runLintAgent({
  cwd,
  diff,
  diffScope,
  mode,
  phase = "pre-fix",
}: RunLintAgentOptions): Promise<AgentLintResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-this-linter", createCompletionModel())
      .name("Review This Linter")
      .instructions(LINT_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent
      .prompt(toLintPrompt(mode, diffScope, diff, phase))
      .send();
    const verdicts = await generateVerdicts("lint", response.output);

    return {
      content: response.output,
      verdicts,
    };
  } finally {
    ptySessions.dispose();
  }
}
