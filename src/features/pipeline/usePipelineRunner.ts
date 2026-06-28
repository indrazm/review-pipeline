import { useCallback, useRef, useState } from "react";
import { logInfo, logWarn } from "../../lib/logger.js";
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
      readonly mode: MenuItem;
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
            `[rp] ${mode.label} (${diffScope.label}): git diff: ${diff.stats.addedLines} added lines, ${diff.stats.removedLines} removed lines`,
          );

          if (reviewWillRun) {
            setState({ diff, diffScope, mode, status: "reviewing" });
            return;
          }

          logInfo(
            `[rp] ${mode.label} (${diffScope.label}): no changes found; review skipped`,
          );
          setState({
            diff,
            diffScope,
            mode,
            reviewSkipped: true,
            status: "completed",
          });
        },
      })
        .then((result) => {
          if (runIdRef.current !== runId) {
            return;
          }

          if (result.gitDiff === undefined) {
            throw new Error("Git diff step did not produce a result");
          }

          if (result.agentReview !== undefined) {
            logInfo(
              `[rp] ${mode.label} (${diffScope.label}): agent review completed (${result.agentReview.output.length} chars)`,
            );
          }

          setState({
            diff: result.gitDiff,
            diffScope,
            mode,
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
            `[rp] ${mode.label} (${diffScope.label}): pipeline failed: ${message}`,
          );
          setState({ diffScope, error: message, mode, status: "failed" });
        });
    },
    [cwd],
  );

  return { run, state };
}
