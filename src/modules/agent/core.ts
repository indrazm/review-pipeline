import { AgentBuilder, createParsedCompletion } from "@anvia/core";
import { z } from "zod";
import { AGENT_MAX_TURNS, createCompletionModel } from "./config.js";
import {
  FIX_AGENT_INSTRUCTIONS,
  VERIFICATION_AGENT_INSTRUCTIONS,
  PR_AGENT_INSTRUCTIONS,
  PR_MONITOR_AGENT_INSTRUCTIONS,
  PR_REPAIR_AGENT_INSTRUCTIONS,
  REVIEW_AGENT_INSTRUCTIONS,
  toFixPrompt,
  toVerificationPrompt,
  toPrMonitorPrompt,
  toPrPrompt,
  toPrRepairPrompt,
  toReviewPrompt,
} from "./prompts.js";
import { createPrMonitorTools } from "./pr-monitor-tools.js";
import { createAgentTools, PtySessionManager } from "./tools.js";
import type {
  AgentFixResult,
  AgentVerificationResult,
  AgentPrMonitorResult,
  AgentPrRepairResult,
  AgentPrResult,
  AgentReviewResult,
  FixVerdicts,
  VerificationVerdicts,
  PrMonitorStatus,
  PrRepairVerdict,
  PrRepairTrigger,
  ReviewVerdicts,
  RunFixAgentOptions,
  RunVerificationAgentOptions,
  RunPrAgentOptions,
  RunPrMonitorAgentOptions,
  RunPrRepairAgentOptions,
  RunReviewAgentOptions,
  VerdictKind,
} from "./types.js";
import {
  extractPrUrl,
  fallbackVerdict,
  getMarkdownSection,
  matchPrMonitorStatus,
  matchPrRepairable,
  matchPrRepairVerdict,
  matchPrRepairTriggers,
  matchVerdictMarker,
  verdictInstructions,
} from "./utils.js";

const reviewVerdictsSchema = z.object({
  verdict: z.enum(["pass", "needs changes"]),
});

const fixVerdictsSchema = z.object({
  verdict: z.enum(["fixed", "not-fixed", "no-op"]),
});

const verificationVerdictsSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
});

const prMonitorStatusSchema = z.object({
  status: z.enum(["ready", "failing", "timeout", "error"]),
});

const prRepairVerdictSchema = z.object({
  verdict: z.enum(["fixed", "not-fixed", "no-op"]),
});

export async function runFixAgent({
  attempt = 1,
  cwd,
  diff,
  diffScope,
  verification,
  maxAttempts = 1,
  mode,
  previousFix,
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
      .prompt(
        toFixPrompt(
          mode,
          diffScope,
          diff,
          review,
          verification,
          previousFix,
          attempt,
          maxAttempts,
        ),
      )
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

export async function runVerificationAgent({
  cwd,
  diff,
  diffScope,
  mode,
  phase = "pre-fix",
}: RunVerificationAgentOptions): Promise<AgentVerificationResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-this-verifier", createCompletionModel())
      .name("Review This Verifier")
      .instructions(VERIFICATION_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent
      .prompt(toVerificationPrompt(mode, diffScope, diff, phase))
      .send();
    const verdicts = await generateVerdicts("verification", response.output);

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
  verification,
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
      .prompt(toPrPrompt(mode, diffScope, diff, review, fix, verification))
      .send();

    return {
      content: response.output,
      prUrl: extractPrUrl(response.output),
    };
  } finally {
    ptySessions.dispose();
  }
}

export async function runPrMonitorAgent({
  cwd,
  diff,
  diffScope,
  fix,
  verification,
  mode,
  pr,
  review,
}: RunPrMonitorAgentOptions): Promise<AgentPrMonitorResult> {
  let steerPrompt = (_input: string): boolean => false;
  const agent = new AgentBuilder("review-this-pr-monitor", createCompletionModel())
    .name("Review This PR Monitor")
    .instructions(PR_MONITOR_AGENT_INSTRUCTIONS)
    .tools(
      createPrMonitorTools({
        cwd,
        steer: (input) => steerPrompt(input),
      }),
    )
    .defaultMaxTurns(AGENT_MAX_TURNS)
    .build();
  const request = agent.prompt(toPrMonitorPrompt(mode, diffScope, diff, review, fix, verification, pr));

  steerPrompt = request.steer.bind(request);

  const response = await request.send();
  const status = await generatePrMonitorStatus(response.output);
  const repairTriggers = generatePrRepairTriggers(response.output);

  return {
    content: response.output,
    prUrl: pr.prUrl,
    repairable:
      matchPrRepairable(response.output) ??
      (status === "failing" && repairTriggers.length > 0),
    repairTriggers,
    status,
  };
}

export async function runPrRepairAgent({
  attempt,
  cwd,
  diff,
  diffScope,
  fix,
  verification,
  maxAttempts,
  mode,
  monitor,
  pr,
  review,
}: RunPrRepairAgentOptions): Promise<AgentPrRepairResult> {
  const ptySessions = new PtySessionManager(cwd);

  try {
    const agent = new AgentBuilder("review-this-pr-repair", createCompletionModel())
      .name("Review This PR Repair")
      .instructions(PR_REPAIR_AGENT_INSTRUCTIONS)
      .tools(createAgentTools(ptySessions))
      .defaultMaxTurns(AGENT_MAX_TURNS)
      .build();

    const response = await agent
      .prompt(
        toPrRepairPrompt(
          mode,
          diffScope,
          diff,
          review,
          fix,
          verification,
          pr,
          monitor,
          attempt,
          maxAttempts,
        ),
      )
      .send();
    const verdict = await generatePrRepairVerdict(response.output);

    return {
      content: response.output,
      prUrl: pr.prUrl,
      verdict,
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

export async function generatePrMonitorStatus(content: string): Promise<PrMonitorStatus> {
  const localStatus = matchPrMonitorStatus(content);

  if (localStatus !== undefined) {
    return localStatus;
  }

  try {
    const result = await createParsedCompletion(createCompletionModel(), {
      instructions: [
        "Extract the final PR monitor status from this review-this agent output.",
        "Return only schema-valid data.",
        "Use `ready` when the output says the PR is ready to merge.",
        "Use `failing` when the output reports failed checks, actionable unresolved review comments, blocked mergeability, conflicts, draft, closed, or other terminal failure.",
        "Use `timeout` when monitoring timed out while still pending.",
        "Use `error` when monitoring could not be completed or the status is unclear.",
      ].join("\n"),
      input: content,
      schema: prMonitorStatusSchema,
    });

    return result.data.status;
  } catch {
    return "error";
  }
}

export async function generatePrRepairVerdict(content: string): Promise<PrRepairVerdict> {
  const localVerdict = matchPrRepairVerdict(content);

  if (localVerdict !== undefined) {
    return localVerdict;
  }

  try {
    const result = await createParsedCompletion(createCompletionModel(), {
      instructions: [
        "Extract the final PR repair verdict from this review-this agent output.",
        "Return only schema-valid data.",
        "Use `fixed` when the output says a repair was completed and pushed or the failure is resolved.",
        "Use `not-fixed` when a repair was attempted but remains unresolved, blocked, or failed to push.",
        "Use `no-op` when the output says no repair was needed or the issue was out of scope without file changes.",
      ].join("\n"),
      input: content,
      schema: prRepairVerdictSchema,
    });

    return result.data.verdict;
  } catch {
    return "not-fixed";
  }
}

function generatePrRepairTriggers(content: string): readonly PrRepairTrigger[] {
  return matchPrRepairTriggers(content);
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
  kind: "verification",
  content: string,
): Promise<VerificationVerdicts>;
export async function generateVerdicts(
  kind: VerdictKind,
  content: string,
): Promise<ReviewVerdicts | FixVerdicts | VerificationVerdicts> {
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

    return await generateParsedVerdicts(kind, content, verificationVerdictsSchema);
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
  kind: "verification",
  content: string,
): VerificationVerdicts | undefined;
function parseLocalVerdict(
  kind: VerdictKind,
  content: string,
): ReviewVerdicts | FixVerdicts | VerificationVerdicts | undefined;
function parseLocalVerdict(
  kind: VerdictKind,
  content: string,
): ReviewVerdicts | FixVerdicts | VerificationVerdicts | undefined {
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

  return verdict === undefined ? undefined : verificationVerdictsSchema.parse({ verdict });
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
