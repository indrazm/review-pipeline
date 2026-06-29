import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createTool } from "@anvia/core";
import { z } from "zod";
import type { PrMonitorStatus } from "./types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_SECONDS = 15 * 60;
const DEFAULT_INTERVAL_SECONDS = 30;
const MAX_GH_OUTPUT_BYTES = 1024 * 1024;
const REQUIRED_READY_SNAPSHOTS = 2;

const pollingInputSchema = z.object({
  intervalSeconds: z
    .number()
    .int()
    .min(5)
    .max(120)
    .optional()
    .describe("Polling interval in seconds. Defaults to 30 seconds."),
  prUrl: z.string().url().describe("GitHub pull request URL to monitor."),
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .max(3600)
    .optional()
    .describe("Maximum time to poll in seconds. Defaults to 900 seconds."),
});

const checkItemSchema = z.object({
  bucket: z.string(),
  link: z.string().optional(),
  name: z.string(),
  state: z.string().optional(),
  workflow: z.string().optional(),
});

const repairTriggerSchema = z.enum(["checks", "review-comments"]);

const actionableReviewThreadSchema = z.object({
  author: z.string().optional(),
  bodyExcerpt: z.string(),
  line: z.number().int().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
});

const pollingOutputSchema = z.object({
  actionableReviewThreads: z.array(actionableReviewThreadSchema),
  attempts: z.number().int().nonnegative(),
  checkSummary: z.object({
    cancelled: z.number().int().nonnegative(),
    failing: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    skipping: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  elapsedSeconds: z.number().nonnegative(),
  failingChecks: z.array(checkItemSchema),
  isDraft: z.boolean().optional(),
  mergeStateStatus: z.string().optional(),
  mergeable: z.string().optional(),
  pendingChecks: z.array(checkItemSchema),
  prUrl: z.string(),
  reason: z.string(),
  repairable: z.boolean(),
  repairTriggers: z.array(repairTriggerSchema),
  reviewDecision: z.string().optional(),
  reviewThreadSummary: z.object({
    actionable: z.number().int().nonnegative(),
    outdated: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
  }),
  state: z.string().optional(),
  status: z.enum(["ready", "failing", "timeout", "error"]),
  timedOut: z.boolean(),
  title: z.string().optional(),
});

type PollingInput = z.output<typeof pollingInputSchema>;
type PollingOutput = z.input<typeof pollingOutputSchema>;
type PrRepairTrigger = z.output<typeof repairTriggerSchema>;

type CreatePrMonitorToolsOptions = {
  readonly cwd: string;
  readonly steer: (input: string) => boolean;
};

type GhPrView = {
  readonly isDraft?: boolean;
  readonly mergeStateStatus?: string;
  readonly mergeable?: string;
  readonly reviewDecision?: string;
  readonly state?: string;
  readonly title?: string;
  readonly url?: string;
};

type GhCheck = {
  readonly bucket?: string;
  readonly link?: string;
  readonly name?: string;
  readonly state?: string;
  readonly workflow?: string;
};

type GhReviewThreadComment = {
  readonly author?: {
    readonly login?: string;
  } | null;
  readonly body?: string;
  readonly line?: number | null;
  readonly path?: string | null;
  readonly url?: string;
};

type GhReviewThread = {
  readonly comments?: {
    readonly nodes?: readonly (GhReviewThreadComment | null)[] | null;
  } | null;
  readonly isOutdated?: boolean;
  readonly isResolved?: boolean;
  readonly line?: number | null;
  readonly path?: string | null;
  readonly startLine?: number | null;
};

type GhReviewThreadsResponse = {
  readonly data?: {
    readonly repository?: {
      readonly pullRequest?: {
        readonly reviewThreads?: {
          readonly nodes?: readonly (GhReviewThread | null)[] | null;
        } | null;
      } | null;
    } | null;
  };
  readonly errors?: readonly {
    readonly message?: string;
  }[];
  readonly repository?: {
    readonly pullRequest?: {
      readonly reviewThreads?: {
        readonly nodes?: readonly (GhReviewThread | null)[] | null;
      } | null;
    } | null;
  } | null;
};

type ActionableReviewThread = z.input<typeof actionableReviewThreadSchema>;

type ReviewThreadSummary = {
  readonly actionable: number;
  readonly outdated: number;
  readonly total: number;
  readonly unresolved: number;
};

type PollSnapshot = {
  readonly actionableReviewThreads: readonly ActionableReviewThread[];
  readonly checks: readonly GhCheck[];
  readonly pr: GhPrView;
  readonly reviewThreadSummary: ReviewThreadSummary;
};

type TerminalClassification = {
  readonly reason: string;
  readonly repairable: boolean;
  readonly repairTriggers: readonly PrRepairTrigger[];
  readonly status: PrMonitorStatus;
};

type InternalClassification =
  | TerminalClassification
  | {
      readonly reason: string;
      readonly status: "pending";
    };

type GhResult = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};

export function createPrMonitorTools(options: CreatePrMonitorToolsOptions) {
  return [
    createTool({
      name: "polling",
      description:
        "Poll a GitHub pull request until it is ready to merge, failing, or the timeout expires.",
      input: pollingInputSchema,
      output: pollingOutputSchema,
      async execute(input) {
        const result = await pollPullRequest(options.cwd, input);
        options.steer(toSteeringMessage(result));
        return result;
      },
    }),
  ];
}

async function pollPullRequest(
  cwd: string,
  input: PollingInput,
): Promise<PollingOutput> {
  const timeoutSeconds = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const intervalSeconds = input.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;
  let attempts = 0;
  let cleanReadySnapshots = 0;

  while (true) {
    attempts += 1;

    try {
      const snapshot = await readPullRequestSnapshot(cwd, input.prUrl);
      const classification = classifySnapshot(snapshot);
      const elapsedSeconds = secondsSince(startedAt);

      if (classification.status === "ready") {
        cleanReadySnapshots += 1;

        if (cleanReadySnapshots >= REQUIRED_READY_SNAPSHOTS) {
          return toPollingOutput({
            attempts,
            classification,
            elapsedSeconds,
            prUrl: input.prUrl,
            snapshot,
            timedOut: false,
          });
        }

        const remainingMs = deadline - Date.now();

        if (remainingMs <= 0) {
          return toPollingOutput({
            attempts,
            classification: {
              reason: `Timed out after ${timeoutSeconds} seconds before observing ${REQUIRED_READY_SNAPSHOTS} consecutive clean PR snapshots. Last observed state: ${classification.reason}`,
              repairable: false,
              repairTriggers: [],
              status: "timeout",
            },
            elapsedSeconds,
            prUrl: input.prUrl,
            snapshot,
            timedOut: true,
          });
        }

        await wait(Math.min(intervalSeconds * 1000, remainingMs));
        continue;
      }

      cleanReadySnapshots = 0;

      if (classification.status !== "pending") {
        return toPollingOutput({
          attempts,
          classification,
          elapsedSeconds,
          prUrl: input.prUrl,
          snapshot,
          timedOut: false,
        });
      }

      const remainingMs = deadline - Date.now();

      if (remainingMs <= 0) {
        return toPollingOutput({
          attempts,
          classification: {
            reason: `Timed out after ${timeoutSeconds} seconds. Last observed state: ${classification.reason}`,
            repairable: false,
            repairTriggers: [],
            status: "timeout",
          },
          elapsedSeconds,
          prUrl: input.prUrl,
          snapshot,
          timedOut: true,
        });
      }

      await wait(Math.min(intervalSeconds * 1000, remainingMs));
    } catch (error) {
      return emptyPollingOutput({
        attempts,
        elapsedSeconds: secondsSince(startedAt),
        prUrl: input.prUrl,
        reason: error instanceof Error ? error.message : String(error),
        status: "error",
        timedOut: false,
      });
    }
  }
}

async function readPullRequestSnapshot(
  cwd: string,
  prUrl: string,
): Promise<PollSnapshot> {
  const pr = await runGhJson<GhPrView>(cwd, [
    "pr",
    "view",
    prUrl,
    "--json",
    [
      "isDraft",
      "mergeStateStatus",
      "mergeable",
      "reviewDecision",
      "state",
      "title",
      "url",
    ].join(","),
  ]);
  const checks = await runGhJson<GhCheck[]>(
    cwd,
    [
      "pr",
      "checks",
      prUrl,
      "--json",
      ["bucket", "link", "name", "state", "workflow"].join(","),
    ],
    [8],
  );
  const reviewThreads = await readReviewThreads(cwd, prUrl);

  return { checks, pr, ...reviewThreads };
}

async function readReviewThreads(
  cwd: string,
  prUrl: string,
): Promise<{
  readonly actionableReviewThreads: readonly ActionableReviewThread[];
  readonly reviewThreadSummary: ReviewThreadSummary;
}> {
  const pullRequest = parseGitHubPullRequestUrl(prUrl);
  const query = [
    "query($owner: String!, $repo: String!, $number: Int!) {",
    "  repository(owner: $owner, name: $repo) {",
    "    pullRequest(number: $number) {",
    "      reviewThreads(first: 100) {",
    "        nodes {",
    "          isOutdated",
    "          isResolved",
    "          line",
    "          path",
    "          startLine",
    "          comments(first: 20) {",
    "            nodes {",
    "              author { login }",
    "              body",
    "              line",
    "              path",
    "              url",
    "            }",
    "          }",
    "        }",
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n");
  const response = await runGhJson<GhReviewThreadsResponse>(cwd, [
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${pullRequest.owner}`,
    "-F",
    `repo=${pullRequest.repo}`,
    "-F",
    `number=${pullRequest.number}`,
  ]);

  return toReviewThreadSnapshot(response);
}

function toReviewThreadSnapshot(
  response: GhReviewThreadsResponse,
): {
  readonly actionableReviewThreads: readonly ActionableReviewThread[];
  readonly reviewThreadSummary: ReviewThreadSummary;
} {
  if (response.errors !== undefined && response.errors.length > 0) {
    throw new Error(
      `Failed to read PR review threads: ${response.errors
        .map((error) => error.message ?? "unknown GraphQL error")
        .join("; ")}`,
    );
  }

  const root = response.repository === undefined ? response.data : response;
  const nodes =
    root?.repository?.pullRequest?.reviewThreads?.nodes?.filter(
      (node): node is GhReviewThread => node !== null,
    ) ?? [];
  const actionableReviewThreads: ActionableReviewThread[] = [];
  let outdated = 0;
  let unresolved = 0;

  for (const thread of nodes) {
    if (thread.isOutdated === true) {
      outdated += 1;
    }

    if (thread.isResolved !== true) {
      unresolved += 1;
    }

    if (thread.isResolved === true || thread.isOutdated === true) {
      continue;
    }

    const comment = selectReviewThreadComment(thread);

    actionableReviewThreads.push({
      author: comment?.author?.login,
      bodyExcerpt: toBodyExcerpt(comment?.body),
      line: toLineNumber(thread.line ?? comment?.line ?? thread.startLine),
      path: toOptionalText(thread.path ?? comment?.path),
      url: toOptionalText(comment?.url),
    });
  }

  return {
    actionableReviewThreads,
    reviewThreadSummary: {
      actionable: actionableReviewThreads.length,
      outdated,
      total: nodes.length,
      unresolved,
    },
  };
}

function selectReviewThreadComment(
  thread: GhReviewThread,
): GhReviewThreadComment | undefined {
  const comments =
    thread.comments?.nodes?.filter(
      (comment): comment is GhReviewThreadComment => comment !== null,
    ) ?? [];

  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];

    if (comment !== undefined && toOptionalText(comment.body) !== undefined) {
      return comment;
    }
  }

  return comments.at(-1);
}

function parseGitHubPullRequestUrl(prUrl: string): {
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
} {
  const url = new URL(prUrl);
  const [owner, repo, pullSegment, numberSegment] = url.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  const number = Number.parseInt(numberSegment ?? "", 10);

  if (
    owner === undefined ||
    repo === undefined ||
    pullSegment !== "pull" ||
    !Number.isInteger(number)
  ) {
    throw new Error(`Could not parse GitHub pull request URL: ${prUrl}`);
  }

  return { number, owner, repo };
}

function toBodyExcerpt(body: string | undefined): string {
  const text = body?.replace(/\s+/g, " ").trim();

  if (text === undefined || text.length === 0) {
    return "(empty review comment)";
  }

  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

function toLineNumber(line: number | null | undefined): number | undefined {
  return typeof line === "number" && Number.isInteger(line) ? line : undefined;
}

function toOptionalText(value: string | null | undefined): string | undefined {
  const text = value?.trim();

  return text === undefined || text.length === 0 ? undefined : text;
}

function classifySnapshot(snapshot: PollSnapshot): InternalClassification {
  const prState = normalizeStatus(snapshot.pr.state);

  if (prState === "MERGED") {
    return terminalClassification("ready", "PR has already been merged.");
  }

  if (prState !== "OPEN") {
    return terminalClassification(
      "failing",
      `PR state is ${snapshot.pr.state ?? "unknown"}, not OPEN.`,
    );
  }

  if (snapshot.pr.isDraft === true) {
    return terminalClassification("failing", "PR is still a draft.");
  }

  const mergeBlocker = classifyNonRepairableMergeBlocker(snapshot.pr);

  if (mergeBlocker !== undefined) {
    return mergeBlocker;
  }

  const checkSummary = summarizeChecks(snapshot.checks);
  const repairTriggers: PrRepairTrigger[] = [];
  const repairReasons: string[] = [];

  if (checkSummary.failingChecks.length > 0) {
    repairTriggers.push("checks");
    repairReasons.push(
      `Failing checks: ${checkSummary.failingChecks
        .map((check) => check.name)
        .join(", ")}`,
    );
  }

  if (snapshot.actionableReviewThreads.length > 0) {
    repairTriggers.push("review-comments");
    repairReasons.push(
      `Unresolved actionable review threads: ${snapshot.actionableReviewThreads
        .map((thread) => toReviewThreadLabel(thread))
        .join(", ")}`,
    );
  }

  if (repairTriggers.length > 0) {
    return terminalClassification(
      "failing",
      repairReasons.join("; "),
      true,
      repairTriggers,
    );
  }

  const mergeClassification = classifyMergeability(snapshot.pr);

  if (mergeClassification.status !== "ready") {
    return mergeClassification;
  }

  if (checkSummary.pendingChecks.length > 0 || checkSummary.unknown > 0) {
    return {
      reason: `Waiting for checks: ${checkSummary.pendingChecks
        .map((check) => check.name)
        .join(", ")}`,
      status: "pending",
    };
  }

  return {
    reason: "PR is open, not draft, mergeable, and all checks are successful or skipped.",
    repairable: false,
    repairTriggers: [],
    status: "ready",
  };
}

function classifyNonRepairableMergeBlocker(
  pr: GhPrView,
): TerminalClassification | undefined {
  const mergeable = normalizeStatus(pr.mergeable);
  const mergeStateStatus = normalizeStatus(pr.mergeStateStatus);

  if (mergeable === "CONFLICTING") {
    return terminalClassification(
      "failing",
      "GitHub reports the PR has merge conflicts.",
    );
  }

  if (
    mergeStateStatus === "BEHIND" ||
    mergeStateStatus === "DIRTY" ||
    mergeStateStatus === "DRAFT"
  ) {
    return terminalClassification(
      "failing",
      `GitHub merge state is ${mergeStateStatus}.`,
    );
  }

  return undefined;
}

function classifyMergeability(pr: GhPrView): InternalClassification {
  const mergeable = normalizeStatus(pr.mergeable);
  const mergeStateStatus = normalizeStatus(pr.mergeStateStatus);

  if (mergeable === "CONFLICTING") {
    return terminalClassification(
      "failing",
      "GitHub reports the PR has merge conflicts.",
    );
  }

  if (
    mergeStateStatus === "BLOCKED" ||
    mergeStateStatus === "BEHIND" ||
    mergeStateStatus === "DIRTY" ||
    mergeStateStatus === "DRAFT"
  ) {
    return terminalClassification(
      "failing",
      `GitHub merge state is ${mergeStateStatus}.`,
    );
  }

  if (
    mergeStateStatus === "UNKNOWN" ||
    mergeStateStatus === "UNSTABLE" ||
    mergeStateStatus === "" ||
    mergeable === "UNKNOWN"
  ) {
    return {
      reason: `Waiting for GitHub mergeability. mergeable=${pr.mergeable ?? "unknown"}, mergeStateStatus=${pr.mergeStateStatus ?? "unknown"}.`,
      status: "pending",
    };
  }

  if (
    mergeStateStatus === "CLEAN" ||
    mergeStateStatus === "HAS_HOOKS" ||
    mergeable === "MERGEABLE"
  ) {
    return terminalClassification("ready", "GitHub reports the PR is mergeable.");
  }

  return {
    reason: `Waiting for GitHub mergeability. mergeable=${pr.mergeable ?? "unknown"}, mergeStateStatus=${pr.mergeStateStatus ?? "unknown"}.`,
    status: "pending",
  };
}

function terminalClassification(
  status: PrMonitorStatus,
  reason: string,
  repairable = false,
  repairTriggers: readonly PrRepairTrigger[] = [],
): TerminalClassification {
  return {
    reason,
    repairable,
    repairTriggers,
    status,
  };
}

function toReviewThreadLabel(thread: ActionableReviewThread): string {
  const location =
    thread.path === undefined
      ? "unknown location"
      : `${thread.path}${thread.line === undefined ? "" : `:${thread.line}`}`;

  return thread.author === undefined ? location : `${location} by ${thread.author}`;
}

function toPollingOutput({
  attempts,
  classification,
  elapsedSeconds,
  prUrl,
  snapshot,
  timedOut,
}: {
  readonly attempts: number;
  readonly classification: TerminalClassification;
  readonly elapsedSeconds: number;
  readonly prUrl: string;
  readonly snapshot: PollSnapshot;
  readonly timedOut: boolean;
}): PollingOutput {
  const checkSummary = summarizeChecks(snapshot.checks);

  return {
    actionableReviewThreads: [...snapshot.actionableReviewThreads],
    attempts,
    checkSummary: {
      cancelled: checkSummary.cancelled,
      failing: checkSummary.failing,
      pass: checkSummary.pass,
      pending: checkSummary.pending,
      skipping: checkSummary.skipping,
      total: checkSummary.total,
      unknown: checkSummary.unknown,
    },
    elapsedSeconds,
    failingChecks: checkSummary.failingChecks,
    isDraft: snapshot.pr.isDraft,
    mergeStateStatus: snapshot.pr.mergeStateStatus,
    mergeable: snapshot.pr.mergeable,
    pendingChecks: checkSummary.pendingChecks,
    prUrl,
    reason: classification.reason,
    repairable: classification.repairable,
    repairTriggers: [...classification.repairTriggers],
    reviewDecision: snapshot.pr.reviewDecision,
    reviewThreadSummary: snapshot.reviewThreadSummary,
    state: snapshot.pr.state,
    status: classification.status,
    timedOut,
    title: snapshot.pr.title,
  };
}

function emptyPollingOutput({
  attempts,
  elapsedSeconds,
  prUrl,
  reason,
  status,
  timedOut,
}: {
  readonly attempts: number;
  readonly elapsedSeconds: number;
  readonly prUrl: string;
  readonly reason: string;
  readonly status: PrMonitorStatus;
  readonly timedOut: boolean;
}): PollingOutput {
  return {
    actionableReviewThreads: [],
    attempts,
    checkSummary: {
      cancelled: 0,
      failing: 0,
      pass: 0,
      pending: 0,
      skipping: 0,
      total: 0,
      unknown: 0,
    },
    elapsedSeconds,
    failingChecks: [],
    pendingChecks: [],
    prUrl,
    reason,
    repairable: false,
    repairTriggers: [],
    reviewThreadSummary: {
      actionable: 0,
      outdated: 0,
      total: 0,
      unresolved: 0,
    },
    status,
    timedOut,
  };
}

function summarizeChecks(checks: readonly GhCheck[]) {
  const failingChecks: Array<z.input<typeof checkItemSchema>> = [];
  const pendingChecks: Array<z.input<typeof checkItemSchema>> = [];
  let cancelled = 0;
  let failing = 0;
  let pass = 0;
  let pending = 0;
  let skipping = 0;
  let unknown = 0;

  for (const check of checks) {
    const bucket = normalizeCheckBucket(check);
    const item = normalizeCheckItem(check, bucket);

    if (bucket === "pass") {
      pass += 1;
    } else if (bucket === "skipping") {
      skipping += 1;
    } else if (bucket === "pending") {
      pending += 1;
      pendingChecks.push(item);
    } else if (bucket === "cancel") {
      cancelled += 1;
      failingChecks.push(item);
    } else if (bucket === "fail") {
      failing += 1;
      failingChecks.push(item);
    } else {
      unknown += 1;
      pendingChecks.push(item);
    }
  }

  return {
    cancelled,
    failing,
    failingChecks,
    pass,
    pending,
    pendingChecks,
    skipping,
    total: checks.length,
    unknown,
  };
}

function normalizeCheckItem(
  check: GhCheck,
  bucket: string,
): z.input<typeof checkItemSchema> {
  return {
    bucket,
    link: check.link,
    name: check.name ?? "(unnamed check)",
    state: check.state,
    workflow: check.workflow,
  };
}

function normalizeCheckBucket(check: GhCheck): string {
  const bucket = normalizeStatus(check.bucket);

  if (
    bucket === "PASS" ||
    bucket === "FAIL" ||
    bucket === "PENDING" ||
    bucket === "SKIPPING" ||
    bucket === "CANCEL"
  ) {
    return bucket.toLowerCase();
  }

  const state = normalizeStatus(check.state);

  if (state === "SUCCESS" || state === "PASS" || state === "COMPLETED") {
    return "pass";
  }

  if (state === "SKIPPED" || state === "NEUTRAL") {
    return "skipping";
  }

  if (
    state === "FAILURE" ||
    state === "FAILED" ||
    state === "ERROR" ||
    state === "ACTION_REQUIRED" ||
    state === "TIMED_OUT"
  ) {
    return "fail";
  }

  if (state === "CANCELLED" || state === "CANCELED") {
    return "cancel";
  }

  if (
    state === "PENDING" ||
    state === "QUEUED" ||
    state === "IN_PROGRESS" ||
    state === "WAITING" ||
    state === "REQUESTED"
  ) {
    return "pending";
  }

  return "unknown";
}

async function runGhJson<T>(
  cwd: string,
  args: readonly string[],
  allowedExitCodes: readonly number[] = [],
): Promise<T> {
  const result = await runGh(cwd, args, allowedExitCodes);

  try {
    return JSON.parse(result.stdout === "" ? "[]" : result.stdout) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse gh JSON output from \`gh ${args.join(" ")}\`: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function runGh(
  cwd: string,
  args: readonly string[],
  allowedExitCodes: readonly number[],
): Promise<GhResult> {
  try {
    const { stderr, stdout } = await execFileAsync("gh", [...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_GH_OUTPUT_BYTES,
    });

    return {
      exitCode: 0,
      stderr: toText(stderr),
      stdout: toText(stdout),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException & {
      readonly stderr?: unknown;
      readonly stdout?: unknown;
    };
    const exitCode = typeof nodeError.code === "number" ? nodeError.code : undefined;
    const stderr = toText(nodeError.stderr);
    const stdout = toText(nodeError.stdout);

    if (exitCode !== undefined && allowedExitCodes.includes(exitCode)) {
      return {
        exitCode,
        stderr,
        stdout,
      };
    }

    throw new Error(
      `\`gh ${args.join(" ")}\` failed${
        exitCode === undefined ? "" : ` with exit code ${exitCode}`
      }: ${stderr || nodeError.message}`,
    );
  }
}

function toSteeringMessage(result: PollingOutput): string {
  return [
    "PR polling completed.",
    `Status: ${result.status}`,
    `Reason: ${result.reason}`,
    `PR: ${result.prUrl}`,
    `Elapsed seconds: ${Math.round(result.elapsedSeconds)}`,
    `Mergeability: mergeable=${result.mergeable ?? "unknown"}, mergeStateStatus=${result.mergeStateStatus ?? "unknown"}`,
    `Checks: ${result.checkSummary.pass} pass, ${result.checkSummary.skipping} skipped, ${result.checkSummary.pending} pending, ${result.checkSummary.failing} failed, ${result.checkSummary.cancelled} cancelled, ${result.checkSummary.unknown} unknown.`,
    `Review threads: ${result.reviewThreadSummary.actionable} actionable unresolved, ${result.reviewThreadSummary.unresolved} unresolved, ${result.reviewThreadSummary.outdated} outdated, ${result.reviewThreadSummary.total} total.`,
    `Repairable: ${result.repairable ? "yes" : "no"}.`,
    `Repair triggers: ${result.repairTriggers.length === 0 ? "none" : result.repairTriggers.join(", ")}.`,
    result.failingChecks.length === 0
      ? "Failing checks: none."
      : `Failing checks: ${result.failingChecks.map((check) => check.name).join(", ")}.`,
    result.pendingChecks.length === 0
      ? "Pending checks: none."
      : `Pending checks: ${result.pendingChecks.map((check) => check.name).join(", ")}.`,
    result.actionableReviewThreads.length === 0
      ? "Actionable review threads: none."
      : [
          "Actionable review threads:",
          ...result.actionableReviewThreads.map(
            (thread) =>
              `- ${toReviewThreadLabel(thread)}${thread.url === undefined ? "" : ` (${thread.url})`}: ${thread.bodyExcerpt}`,
          ),
        ].join("\n"),
    "Required final status markers:",
    `PR_MONITOR_STATUS: ${result.status}`,
    `PR_REPAIR_TRIGGER: ${result.repairable ? "yes" : "no"}`,
    `PR_REPAIR_TRIGGERS: ${result.repairTriggers.length === 0 ? "none" : result.repairTriggers.join(", ")}`,
    "Use this polling result for the final PR monitor response. Do not call polling again.",
  ].join("\n");
}

function normalizeStatus(value: string | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function secondsSince(startedAt: number): number {
  return (Date.now() - startedAt) / 1000;
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return value === undefined || value === null ? "" : String(value);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
