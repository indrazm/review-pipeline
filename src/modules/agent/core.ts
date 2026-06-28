import { AgentBuilder, createParsedCompletion } from "@anvia/core";
import { z } from "zod";
import { AGENT_MAX_TURNS, createCompletionModel } from "./config.js";
import {
  FIX_AGENT_INSTRUCTIONS,
  LINT_AGENT_INSTRUCTIONS,
  PR_AGENT_INSTRUCTIONS,
  REVIEW_AGENT_INSTRUCTIONS,
  toFixPrompt,
  toLintPrompt,
  toPrPrompt,
  toReviewPrompt,
} from "./prompts.js";
import { createAgentTools, PtySessionManager } from "./tools.js";
import type {
  AgentFixResult,
  AgentLintResult,
  AgentPrResult,
  AgentReviewResult,
  FixVerdicts,
  LintVerdicts,
  ReviewVerdicts,
  RunFixAgentOptions,
  RunLintAgentOptions,
  RunPrAgentOptions,
  RunReviewAgentOptions,
  VerdictKind,
} from "./types.js";
import {
  fallbackVerdict,
  getMarkdownSection,
  matchVerdictMarker,
  verdictInstructions,
} from "./utils.js";

const reviewVerdictsSchema = z.object({
  verdict: z.enum(["pass", "needs changes"]),
});

const fixVerdictsSchema = z.object({
  verdict: z.enum(["fixed", "not-fixed", "no-op"]),
});

const lintVerdictsSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
});

export async function runFixAgent({
  cwd,
  diff,
  diffScope,
  lint,
  mode,
  review,
}: RunFixAgentOptions): Promise<AgentFixResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-this-fixer", createCompletionModel())
      .name("Review This Fixer")
      .instructions(FIX_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent
      .prompt(toFixPrompt(mode, diffScope, diff, review, lint))
      .send();
    const verdicts = await generateVerdicts("fix", response.output);

    return {
      content: response.output,
      verdicts,
    };
  } finally {
    ptySessions.dispose();
  }
}

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
    const agent = new AgentBuilder("review-this-pr", createCompletionModel())
      .name("Review This PR Agent")
      .instructions(PR_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent
      .prompt(toPrPrompt(mode, diffScope, diff, review, fix, lint))
      .send();

    return {
      content: response.output,
    };
  } finally {
    ptySessions.dispose();
  }
}

export async function runReviewAgent({
  cwd,
  diff,
  diffScope,
  mode,
}: RunReviewAgentOptions): Promise<AgentReviewResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-this-reviewer", createCompletionModel())
      .name("Review This Reviewer")
      .instructions(REVIEW_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent.prompt(toReviewPrompt(mode, diffScope, diff)).send();
    const verdicts = await generateVerdicts("review", response.output);

    return {
      content: response.output,
      verdicts,
    };
  } finally {
    ptySessions.dispose();
  }
}

export async function generateVerdicts(
  kind: "review",
  content: string,
): Promise<ReviewVerdicts>;
export async function generateVerdicts(
  kind: "fix",
  content: string,
): Promise<FixVerdicts>;
export async function generateVerdicts(
  kind: "lint",
  content: string,
): Promise<LintVerdicts>;
export async function generateVerdicts(
  kind: VerdictKind,
  content: string,
): Promise<ReviewVerdicts | FixVerdicts | LintVerdicts> {
  const localVerdict = parseLocalVerdict(kind, content);

  if (localVerdict !== undefined) {
    return localVerdict;
  }

  try {
    if (kind === "review") {
      return await generateParsedVerdicts(kind, content, reviewVerdictsSchema);
    }

    if (kind === "fix") {
      return await generateParsedVerdicts(kind, content, fixVerdictsSchema);
    }

    return await generateParsedVerdicts(kind, content, lintVerdictsSchema);
  } catch {
    return fallbackVerdict(kind);
  }
}

function parseLocalVerdict(
  kind: "review",
  content: string,
): ReviewVerdicts | undefined;
function parseLocalVerdict(
  kind: "fix",
  content: string,
): FixVerdicts | undefined;
function parseLocalVerdict(
  kind: "lint",
  content: string,
): LintVerdicts | undefined;
function parseLocalVerdict(
  kind: VerdictKind,
  content: string,
): ReviewVerdicts | FixVerdicts | LintVerdicts | undefined;
function parseLocalVerdict(
  kind: VerdictKind,
  content: string,
): ReviewVerdicts | FixVerdicts | LintVerdicts | undefined {
  if (kind === "review") {
    const verdictsSection = getMarkdownSection(content, "Verdicts");
    const verdict = matchVerdictMarker(
      verdictsSection,
      String.raw`\*\*Verdict:\*\*`,
      ["pass", "needs changes"],
    );

    return verdict === undefined
      ? undefined
      : reviewVerdictsSchema.parse({ verdict });
  }

  if (kind === "fix") {
    const verdict = matchVerdictMarker(content, "FIX_VERDICT:", [
      "fixed",
      "not-fixed",
      "no-op",
    ]);

    return verdict === undefined ? undefined : fixVerdictsSchema.parse({ verdict });
  }

  const verdict = matchVerdictMarker(content, "VERDICT:", ["pass", "fail"]);

  return verdict === undefined ? undefined : lintVerdictsSchema.parse({ verdict });
}

async function generateParsedVerdicts<T>(
  kind: VerdictKind,
  content: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = await createParsedCompletion(createCompletionModel(), {
    instructions: verdictInstructions(kind),
    input: content,
    schema,
  });

  return result.data;
}

