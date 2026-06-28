import { useCallback, useRef, useState } from "react";
import { logInfo, logWarn } from "../../lib/logger.js";
import type { AgentReviewResult } from "../agent/reviewAgent.js";
import type { GitDiffSnapshot } from "../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { runPipeline } from "./runPipeline.js";

export type PipelineRunState =
  | {
      readonly status: "idle";
    }
  | {
      readonly mode: MenuItem;
      readonly status: "loading-diff";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly mode: MenuItem;
      readonly status: "reviewing";
    }
  | {
      readonly diff: GitDiffSnapshot;
      readonly mode: MenuItem;
      readonly review?: AgentReviewResult;
      readonly status: "completed";
    }
  | {
      readonly error: string;
      readonly mode: MenuItem;
      readonly status: "failed";
    };

type PipelineRunner = {
  readonly run: (mode: MenuItem) => void;
  readonly state: PipelineRunState;
};

export function usePipelineRunner(cwd: string): PipelineRunner {
  const [state, setState] = useState<PipelineRunState>({ status: "idle" });
  const runIdRef = useRef(0);

  const run = useCallback(
    (mode: MenuItem) => {
      const runId = runIdRef.current + 1;

      runIdRef.current = runId;
      setState({ mode, status: "loading-diff" });

      void runPipeline({
        cwd,
        mode,
        onGitDiffLoaded: (diff) => {
          if (runIdRef.current !== runId) {
            return;
          }

          logInfo(
            `[rp] ${mode.label}: git diff: ${diff.stats.addedLines} added lines, ${diff.stats.removedLines} removed lines`,
          );
          setState({ diff, mode, status: "reviewing" });
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
              `[rp] ${mode.label}: agent review completed (${result.agentReview.output.length} chars)`,
            );
          }

          setState({
            diff: result.gitDiff,
            mode,
            review: result.agentReview,
            status: "completed",
          });
        })
        .catch((error: unknown) => {
          if (runIdRef.current !== runId) {
            return;
          }

          const message = error instanceof Error ? error.message : String(error);

          logWarn(`[rp] ${mode.label}: pipeline failed: ${message}`);
          setState({ error: message, mode, status: "failed" });
        });
    },
    [cwd],
  );

  return { run, state };
}
