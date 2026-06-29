import type { PrMonitorStatus } from "../../types.js";
import type {
  ActionableReviewThread,
  CheckItem,
  PrRepairTrigger,
} from "./schemas.js";
import type {
  GhCheck,
  GhPrView,
  InternalClassification,
  PollSnapshot,
  TerminalClassification,
} from "./types.js";

export function classifySnapshot(snapshot: PollSnapshot): InternalClassification {
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

export function summarizeChecks(checks: readonly GhCheck[]) {
  const failingChecks: CheckItem[] = [];
  const pendingChecks: CheckItem[] = [];
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

export function toReviewThreadLabel(thread: ActionableReviewThread): string {
  const location =
    thread.path === undefined
      ? "unknown location"
      : `${thread.path}${thread.line === undefined ? "" : `:${thread.line}`}`;

  return thread.author === undefined ? location : `${location} by ${thread.author}`;
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

function normalizeCheckItem(check: GhCheck, bucket: string): CheckItem {
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

function normalizeStatus(value: string | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}
