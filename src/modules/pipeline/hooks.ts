import { useCallback, useRef, useState } from "react";
import { logInfo, logWarn } from "../../lib/logger.js";
import type { MenuItem } from "../main-menu/index.js";
import type { ReviewTarget } from "../review-target/index.js";
import { runPipeline } from "./service.js";
import type { PipelineRunner, PipelineRunState } from "./types.js";

export function usePipelineRunner(cwd: string): PipelineRunner {
  const [state, setState] = useState<PipelineRunState>({ status: "idle" });
  const runIdRef = useRef(0);

  const run = useCallback(
    (mode: MenuItem, reviewTarget: ReviewTarget) => {
      const diffScope = reviewTarget.scope;
      const runId = runIdRef.current + 1;
      const hasInitialVerificationStep =
        mode.id === "review" ||
        mode.id === "review-and-fix" ||
        mode.id === "full-pipeline";
      const hasPostFixVerificationStep =
        mode.id === "review-and-fix" || mode.id === "full-pipeline";

      runIdRef.current = runId;
      setState({ diffScope, mode, status: "loading-diff" });

      void runPipeline({
        cwd,
        mode,
        onGitDiffLoaded: (diff, reviewWillRun) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): git diff: ${diff.stats.addedLines} added lines, ${diff.stats.removedLines} removed lines`,
          );

          if (reviewWillRun) {
            setState({ diff, diffScope, mode, status: "reviewing" });
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): no changes found; review skipped`,
          );
          setState({
            diff,
            diffScope,
            fixAttempts: [],
            fixSkipped: mode.id !== "review",
            verificationAttempts: [],
            verificationSkipped: hasInitialVerificationStep,
            mode,
            postFixVerificationSkipped: hasPostFixVerificationStep,
            prMonitorAttempts: [],
            prMonitorSkipped: mode.id === "full-pipeline",
            prRepairAttempts: [],
            prRepairSkipped: mode.id === "full-pipeline",
            prSkipped: mode.id === "full-pipeline",
            reviewAttempts: [],
            reviewSkipped: true,
            status: "completed",
          });
        },
        onFixCompleted: (
          fix,
          _diff,
          _review,
          _verification,
          attempt,
          maxAttempts,
        ) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): fix agent attempt ${attempt}/${maxAttempts} completed with ${fix.verdicts.verdict} (${fix.content.length} chars)`,
          );
        },
        onFixStarted: (diff, review, verification, attempt, maxAttempts) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({
            diff,
            diffScope,
            fixAttempt: attempt,
            verification,
            maxFixAttempts: maxAttempts,
            mode,
            review,
            status: "fixing",
          });
        },
        onReviewCompleted: (review) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): agent review completed (${review.content.length} chars)`,
          );
        },
        onVerificationStarted: (diff, review, fix, fixSkipped) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({
            diff,
            diffScope,
            fix,
            fixSkipped,
            mode,
            review,
            status: "verifying",
          });
        },
        onVerificationCompleted: (verification) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): verification agent completed (${verification.content.length} chars)`,
          );
        },
        onPostFixVerificationStarted: (
          diff,
          review,
          fix,
          verification,
          attempt,
          maxAttempts,
        ) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({
            diff,
            diffScope,
            fix,
            fixSkipped: false,
            verification,
            maxVerificationAttempts: maxAttempts,
            mode,
            review,
            status: "verifying-after-fix",
            verificationAttempt: attempt,
          });
        },
        onPostFixVerificationCompleted: (verification, _diff, _review, _fix, _initialVerification, attempt, maxAttempts) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): post-fix verification attempt ${attempt}/${maxAttempts} completed with ${verification.verdicts.verdict} (${verification.content.length} chars)`,
          );
        },
        onPrStarted: (diff, review, fix, verification) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({
            diff,
            diffScope,
            fix,
            fixSkipped: mode.id !== "review" && fix === undefined,
            verification,
            mode,
            review,
            status: "preparing-pr",
          });
        },
        onPrCompleted: (pr) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): PR agent completed (${pr.content.length} chars)`,
          );
        },
        onPrMonitorCompleted: (monitor) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): PR monitor completed with ${monitor.status} (${monitor.content.length} chars)`,
          );
        },
        onPrMonitorStarted: (diff, review, fix, verification, pr) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({
            diff,
            diffScope,
            fix,
            fixSkipped: mode.id !== "review" && fix === undefined,
            verification,
            mode,
            pr,
            review,
            status: "monitoring-pr",
          });
        },
        onPrRepairCompleted: (repair) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): PR repair completed with ${repair.verdict} (${repair.content.length} chars)`,
          );
        },
        onPrRepairStarted: (
          diff,
          review,
          fix,
          verification,
          pr,
          monitor,
          repairAttempt,
          maxRepairAttempts,
        ) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({
            diff,
            diffScope,
            fix,
            fixSkipped: mode.id !== "review" && fix === undefined,
            verification,
            maxRepairAttempts,
            mode,
            pr,
            prMonitor: monitor,
            repairAttempt,
            review,
            status: "repairing-pr",
          });
        },
        reviewTarget,
      })
        .then((result) => {
          if (runIdRef.current !== runId) {
            return;
          }

          if (result.gitDiff === undefined) {
            throw new Error("Git diff step did not produce a result");
          }

          if (result.prSkipped && result.prSkipReason !== undefined) {
            logInfo(
              `[review-this] ${mode.label} (${diffScope.label}): PR skipped: ${result.prSkipReason}`,
            );
          }

          if (
            result.prMonitorSkipped &&
            result.prMonitorSkipReason !== undefined
          ) {
            logInfo(
              `[review-this] ${mode.label} (${diffScope.label}): PR monitor skipped: ${result.prMonitorSkipReason}`,
            );
          }

          if (
            result.prRepairSkipped &&
            result.prRepairSkipReason !== undefined
          ) {
            logInfo(
              `[review-this] ${mode.label} (${diffScope.label}): PR repair skipped: ${result.prRepairSkipReason}`,
            );
          }

          setState({
            diff: result.gitDiff,
            diffScope,
            fix: result.agentFix,
            fixAttempts: result.agentFixAttempts,
            fixSkipped: result.fixSkipped,
            verification: result.agentVerification,
            verificationAttempts: result.agentVerificationAttempts,
            verificationSkipped: result.verificationSkipped,
            mode,
            postFixVerification: result.agentPostFixVerification,
            postFixVerificationSkipped: result.postFixVerificationSkipped,
            pr: result.agentPr,
            prSkipReason: result.prSkipReason,
            prMonitor: result.agentPrMonitor,
            prMonitorAttempts: result.agentPrMonitorAttempts,
            prMonitorSkipped: result.prMonitorSkipped,
            prRepair: result.agentPrRepair,
            prRepairAttempts: result.agentPrRepairAttempts,
            prRepairSkipped: result.prRepairSkipped,
            prSkipped: result.prSkipped,
            review: result.agentReview,
            reviewAttempts: result.agentReviewAttempts,
            reviewSkipped: result.reviewSkipped,
            status: "completed",
          });
        })
        .catch((error: unknown) => {
          if (runIdRef.current !== runId) {
            return;
          }

          const message = error instanceof Error ? error.message : String(error);

          logWarn(
            `[review-this] ${mode.label} (${diffScope.label}): pipeline failed: ${message}`,
          );
          setState({ diffScope, error: message, mode, status: "failed" });
        });
    },
    [cwd],
  );

  return { run, state };
}
