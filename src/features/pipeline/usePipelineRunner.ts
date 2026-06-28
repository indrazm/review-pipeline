import { useCallback, useRef, useState } from "react";
import { logInfo, logWarn } from "../../lib/logger.js";
import type { AgentFixResult } from "../agent/fixAgent.js";
import type { AgentLintResult } from "../agent/lintAgent.js";
import type { AgentPrResult } from "../agent/prAgent.js";
import type { AgentReviewResult } from "../agent/reviewAgent.js";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";
import type { GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { runPipeline } from "./runPipeline.js";

export type PipelineRunState =
  | {
      readonly status: "idle";
    }
  | {
      readonly diffScope: DiffScopeItem;
      readonly mode: MenuItem;
      readonly status: "loading-diff";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly mode: MenuItem;
      readonly status: "reviewing";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly lint?: AgentLintResult;
      readonly mode: MenuItem;
      readonly review: AgentReviewResult;
      readonly status: "fixing";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly mode: MenuItem;
      readonly review?: AgentReviewResult;
      readonly status: "linting";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix: AgentFixResult;
      readonly fixSkipped: false;
      readonly lint: AgentLintResult;
      readonly mode: MenuItem;
      readonly review: AgentReviewResult;
      readonly status: "verifying-after-fix";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly lint: AgentLintResult;
      readonly mode: MenuItem;
      readonly review?: AgentReviewResult;
      readonly status: "preparing-pr";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly diffScope: DiffScopeItem;
      readonly fix?: AgentFixResult;
      readonly fixSkipped: boolean;
      readonly lint?: AgentLintResult;
      readonly lintSkipped: boolean;
      readonly mode: MenuItem;
      readonly postFixLint?: AgentLintResult;
      readonly postFixLintSkipped: boolean;
      readonly pr?: AgentPrResult;
      readonly prSkipped: boolean;
      readonly review?: AgentReviewResult;
      readonly reviewSkipped: boolean;
      readonly status: "completed";
    }
  | {
      readonly diffScope: DiffScopeItem;
      readonly error: string;
      readonly mode: MenuItem;
      readonly status: "failed";
    };

type PipelineRunner = {
  readonly run: (mode: MenuItem, diffScope: DiffScopeItem) => void;
  readonly state: PipelineRunState;
};

export function usePipelineRunner(cwd: string): PipelineRunner {
  const [state, setState] = useState<PipelineRunState>({ status: "idle" });
  const runIdRef = useRef(0);

  const run = useCallback(
    (mode: MenuItem, diffScope: DiffScopeItem) => {
      const runId = runIdRef.current + 1;

      runIdRef.current = runId;
      setState({ diffScope, mode, status: "loading-diff" });

      void runPipeline({
        cwd,
        diffScope,
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
            fixSkipped: mode.id !== "review",
            lintSkipped: mode.id === "full-pipeline",
            mode,
            postFixLintSkipped: mode.id === "full-pipeline",
            prSkipped: mode.id === "full-pipeline",
            reviewSkipped: true,
            status: "completed",
          });
        },
        onFixCompleted: (fix) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): fix agent completed (${fix.content.length} chars)`,
          );
        },
        onFixStarted: (diff, review, lint) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({ diff, diffScope, lint, mode, review, status: "fixing" });
        },
        onReviewCompleted: (review) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): agent review completed (${review.content.length} chars)`,
          );
        },
        onLintStarted: (diff, review, fix, fixSkipped) => {
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
            status: "linting",
          });
        },
        onLintCompleted: (lint) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): lint agent completed (${lint.content.length} chars)`,
          );
        },
        onPostFixLintStarted: (diff, review, fix, lint) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({
            diff,
            diffScope,
            fix,
            fixSkipped: false,
            lint,
            mode,
            review,
            status: "verifying-after-fix",
          });
        },
        onPostFixLintCompleted: (lint) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[review-this] ${mode.label} (${diffScope.label}): post-fix verification completed (${lint.content.length} chars)`,
          );
        },
        onPrStarted: (diff, review, fix, lint) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setState({
            diff,
            diffScope,
            fix,
            fixSkipped: mode.id !== "review" && fix === undefined,
            lint,
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

          setState({
            diff: result.gitDiff,
            diffScope,
            fix: result.agentFix,
            fixSkipped: result.fixSkipped,
            lint: result.agentLint,
            lintSkipped: result.lintSkipped,
            mode,
            postFixLint: result.agentPostFixLint,
            postFixLintSkipped: result.postFixLintSkipped,
            pr: result.agentPr,
            prSkipped: result.prSkipped,
            review: result.agentReview,
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
