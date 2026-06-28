import { useEffect } from "react";
import { Box, Text } from "ink";
import { BrailleSpinner } from "../../components/BrailleSpinner.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { DiffPreview } from "./DiffPreview.js";
import { ReviewOutput } from "./ReviewOutput.js";
import { usePipelineRunner } from "./usePipelineRunner.js";

type PipelineScreenProps = {
  readonly cwd: string;
  readonly mode: MenuItem;
};

export function PipelineScreen({ cwd, mode }: PipelineScreenProps) {
  const { run, state } = usePipelineRunner(cwd);

  useEffect(() => {
    run(mode);
  }, [mode, run]);

  return (
    <Box flexDirection="column" flexGrow={1} width="100%" paddingX={1} gap={1}>
      <Box flexDirection="column" flexShrink={0}>
        <Text bold wrap="truncate">
          {mode.label}
        </Text>
        <Text dimColor wrap="truncate">
          {cwd}
        </Text>
      </Box>

      <PipelineSteps state={state} />
      <PipelineDiff state={state} />
      <PipelineReview state={state} />
      <PipelineCompletion state={state} />
    </Box>
  );
}

type PipelineStepsProps = {
  readonly state: ReturnType<typeof usePipelineRunner>["state"];
};

function PipelineSteps({ state }: PipelineStepsProps) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <StepLine
        isActive={state.status === "idle" || state.status === "loading-diff"}
        isDone={
          state.status === "reviewing" ||
          state.status === "completed" ||
          state.status === "failed"
        }
        label="Loading Diff"
      />
      <StepLine
        isActive={state.status === "reviewing"}
        isDone={state.status === "completed"}
        label="Reviewing ..."
      />
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
  readonly label: string;
};

function StepLine({ isActive, isDone, label }: StepLineProps) {
  if (isActive) {
    return <BrailleSpinner label={label} />;
  }

  return (
    <Text color={isDone ? "green" : undefined} dimColor={!isDone} wrap="truncate">
      {isDone ? "✓" : "·"} {label}
    </Text>
  );
}

type PipelineDiffProps = {
  readonly state: ReturnType<typeof usePipelineRunner>["state"];
};

function PipelineDiff({ state }: PipelineDiffProps) {
  if (state.status !== "reviewing" && state.status !== "completed") {
    return null;
  }

  return <DiffPreview maxLines={9} patch={state.diff.patch} />;
}

type PipelineReviewProps = {
  readonly state: ReturnType<typeof usePipelineRunner>["state"];
};

function PipelineReview({ state }: PipelineReviewProps) {
  if (state.status !== "completed") {
    return null;
  }

  return <ReviewOutput output={state.review?.output ?? ""} />;
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
