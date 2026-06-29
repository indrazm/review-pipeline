import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ActionableReviewThread } from "./schemas.js";
import type {
  GhCheck,
  GhPrView,
  GhResult,
  GhReviewThread,
  GhReviewThreadComment,
  GhReviewThreadsResponse,
  PollSnapshot,
  ReviewThreadSummary,
} from "./types.js";

const execFileAsync = promisify(execFile);

const MAX_GH_OUTPUT_BYTES = 1024 * 1024;

export async function readPullRequestSnapshot(
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

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return value === undefined || value === null ? "" : String(value);
}
