import { useEffect } from "react";
import { Box, Text } from "ink";
import { BrailleSpinner } from "../../components/BrailleSpinner.js";
import { ReviewThisLogo } from "../../components/ReviewThisLogo.js";
import type { DiffScopeItem } from "../diff-scope/diffScopes.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { usePipelineRunner } from "./usePipelineRunner.js";

type PipelineScreenProps = {
  readonly cwd: string;
  readonly diffScope: DiffScopeItem;
  readonly mode: MenuItem;
};

export function PipelineScreen({ cwd, diffScope, mode }: PipelineScreenProps) {
  const { run, state } = usePipelineRunner(cwd);
  const showsFixStep = mode.id !== "review";
  const showsFullPipelineSteps = mode.id === "full-pipeline";

  useEffect(() => {
    run(mode, diffScope);
  }, [diffScope, mode, run]);

  return (
    <Box flexDirection="column" flexGrow={1} width="100%" paddingX={1} gap={1}>
      <Box flexShrink={0}>
        <ReviewThisLogo />
      </Box>

      <Box flexDirection="column" flexShrink={0}>
        <Text bold wrap="truncate">
          {mode.label}
        </Text>
        <Text dimColor wrap="truncate">
          {cwd}
        </Text>
        <Text dimColor wrap="truncate">
          {diffScope.label}
        </Text>
      </Box>

      <PipelineSteps
        showsFixStep={showsFixStep}
        showsFullPipelineSteps={showsFullPipelineSteps}
        state={state}
      />
      <PipelineNoChanges state={state} />
      <PipelineCompletion state={state} />
      <PipelineReviewOutput state={state} />
    </Box>
  );
}

type PipelineStepsProps = {
  readonly showsFixStep: boolean;
  readonly showsFullPipelineSteps: boolean;
  readonly state: ReturnType<typeof usePipelineRunner>["state"];
};

function PipelineSteps({
  showsFixStep,
  showsFullPipelineSteps,
  state,
}: PipelineStepsProps) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <StepLine
        isActive={state.status === "idle" || state.status === "loading-diff"}
        isDone={
          state.status === "reviewing" ||
          state.status === "linting" ||
          state.status === "fixing" ||
          state.status === "preparing-pr" ||
          state.status === "completed" ||
          state.status === "failed"
        }
        label="Loading Diff"
      />
      <StepLine
        isActive={state.status === "reviewing"}
        isDone={
          state.status === "fixing" ||
          state.status === "linting" ||
          state.status === "preparing-pr" ||
          (state.status === "completed" && !state.reviewSkipped)
        }
        isSkipped={state.status === "completed" && state.reviewSkipped}
        label="Reviewing ..."
      />
      {showsFullPipelineSteps && (
        <StepLine
          isActive={state.status === "linting"}
          isDone={
            state.status === "fixing" ||
            state.status === "preparing-pr" ||
            (state.status === "completed" && !state.lintSkipped)
          }
          isSkipped={state.status === "completed" && state.lintSkipped}
          label="Linting ..."
        />
      )}
      {showsFixStep && (
        <StepLine
          isActive={state.status === "fixing"}
          isDone={
            state.status === "preparing-pr" ||
            (state.status === "completed" && !state.fixSkipped)
          }
          isSkipped={
            (state.status === "preparing-pr" && state.fixSkipped) ||
            (state.status === "completed" && state.fixSkipped)
          }
          label="Fixing ..."
        />
      )}
      {showsFullPipelineSteps && (
        <StepLine
          isActive={state.status === "preparing-pr"}
          isDone={state.status === "completed" && !state.prSkipped}
          isSkipped={state.status === "completed" && state.prSkipped}
          label="Preparing PR ..."
        />
      )}
      {state.status === "failed" && (
        <Text color="yellow" wrap="truncate">
          Failed: {state.error}
        </Text>
      )}
    </Box>
  );
}

type StepLineProps = {
  readonly isActive: boolean;
  readonly isDone: boolean;
  readonly isSkipped?: boolean;
  readonly label: string;
};

function StepLine({ isActive, isDone, isSkipped = false, label }: StepLineProps) {
  if (isActive) {
    return <BrailleSpinner label={label} />;
  }

  if (isSkipped) {
    return (
      <Text dimColor wrap="truncate">
        · {label} skipped
      </Text>
    );
  }

  return (
    <Text color={isDone ? "green" : undefined} dimColor={!isDone} wrap="truncate">
      {isDone ? "✓" : "·"} {label}
    </Text>
  );
}

type PipelineNoChangesProps = {
  readonly state: ReturnType<typeof usePipelineRunner>["state"];
};

function PipelineNoChanges({ state }: PipelineNoChangesProps) {
  if (state.status !== "completed" || !state.reviewSkipped) {
    return null;
  }

  return (
    <Text color="yellow" wrap="truncate">
      {formatNoChangesMessage(state)}
    </Text>
  );
}

type PipelineCompletionProps = {
  readonly state: ReturnType<typeof usePipelineRunner>["state"];
};

function PipelineCompletion({ state }: PipelineCompletionProps) {
  if (state.status !== "completed") {
    return null;
  }

  return (
    <Text color="green" wrap="truncate">
      Completed.
    </Text>
  );
}

type PipelineReviewOutputProps = {
  readonly state: ReturnType<typeof usePipelineRunner>["state"];
};

function PipelineReviewOutput({ state }: PipelineReviewOutputProps) {
  if (
    state.status !== "completed" ||
    state.mode.id !== "review" ||
    state.reviewSkipped ||
    state.review === undefined
  ) {
    return null;
  }

  const output = state.review.content.trim();

  return (
    <Box flexDirection="column" flexShrink={1} overflow="hidden" width="100%">
      <Text bold>Review output</Text>
      {output.length === 0 ? (
        <Text dimColor>No review output.</Text>
      ) : (
        output.split(/\r?\n/).map((line, index) => (
          <Text key={`${index}-${line}`} wrap="wrap">
            {line.length === 0 ? " " : line}
          </Text>
        ))
      )}
    </Box>
  );
}

function formatNoChangesMessage(
  state: Extract<
    ReturnType<typeof usePipelineRunner>["state"],
    { readonly status: "completed" }
  >,
): string {
  const lineStats = `0 files changed, ${state.diff.stats.addedLines} added, ${state.diff.stats.removedLines} removed`;

  if (state.diffScope.id !== "branch-against-main") {
    return `No changes found (${lineStats}). Review skipped.`;
  }

  const commitCount = state.diff.stats.commitCount ?? 0;

  return `No changes found (${lineStats}, ${commitCount} commits against main). Review skipped.`;
}
