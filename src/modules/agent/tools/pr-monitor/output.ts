import type { PrMonitorStatus } from "../../types.js";
import {
  summarizeChecks,
  toReviewThreadLabel,
} from "./classify.js";
import type { PollingOutput } from "./schemas.js";
import type {
  PollSnapshot,
  TerminalClassification,
} from "./types.js";

export function toPollingOutput({
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

export function emptyPollingOutput({
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

export function toSteeringMessage(result: PollingOutput): string {
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
