import { AgentBuilder } from "@anvia/core";
import { OpenAIClient } from "@anvia/openai";
import type { GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { PtySessionManager } from "./ptySessionManager.js";
import { createAgentTools } from "./tools.js";

const REVIEW_AGENT_INSTRUCTIONS = [
  "You are a code review agent running inside the rp CLI.",
  "Review the provided git diff for correctness, regressions, and missing tests.",
  "You may inspect the project with tools when useful.",
  "Do not modify files in this review step.",
  "Return Markdown only.",
  "Use exactly these top-level sections: Change Intention, Findings, Verdicts.",
  "Under Findings, each finding must include description, level, risk, and recommended fix.",
  "The only allowed finding levels are major and minor.",
  "If there are no findings, write `No findings.` under Findings.",
].join("\n");

const DEFAULT_MODEL = "cx/gpt-5.5";

export type AgentReviewResult = {
  readonly output: string;
};

type RunReviewAgentOptions = {
  readonly cwd: string;
  readonly diff: GitDiffSnapshot;
  readonly mode: MenuItem;
};

export async function runReviewAgent({
  cwd,
  diff,
  mode,
}: RunReviewAgentOptions): Promise<AgentReviewResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-pipeline-reviewer", createCompletionModel())
      .name("Review Pipeline Reviewer")
      .instructions(REVIEW_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(8)
      .build();

    const response = await agent.prompt(toReviewPrompt(mode, diff)).send();

    return {
      output: response.output,
    };
  } finally {
    ptySessions.dispose();
  }
}

function createCompletionModel() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;
  const client = new OpenAIClient({
    ...(apiKey === undefined || apiKey === "" ? {} : { apiKey }),
    ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }),
    completionApi: "chat",
  });

  return client.completionModel(model === undefined || model === "" ? DEFAULT_MODEL : model);
}

function toReviewPrompt(mode: MenuItem, diff: GitDiffSnapshot): string {
  return [
    `Pipeline mode: ${mode.label}`,
    `Project path: ${diff.stats.cwd}`,
    `Changed files: ${diff.stats.changedFiles}`,
    `Added lines: ${diff.stats.addedLines}`,
    `Removed lines: ${diff.stats.removedLines}`,
    "",
    "Git diff:",
    "```diff",
    diff.patch.length === 0 ? "(empty diff)" : diff.patch,
    "```",
    "",
    "Required Markdown structure:",
    "## Change Intention",
    "<Describe what this change appears to be trying to accomplish.>",
    "",
    "## Findings",
    "### Finding 1: <short title>",
    "- **Description:** <what is wrong>",
    "- **Level:** <major|minor>",
    "- **Risk:** <what can happen if this ships>",
    "- **Recommended fix:** <specific fix>",
    "",
    "## Verdicts",
    "- **Verdict:** <pass|needs changes>",
    "- **Reason:** <brief reason>",
  ].join("\n");
}
